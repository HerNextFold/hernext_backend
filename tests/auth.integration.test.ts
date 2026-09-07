import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';

// These tests exercise real persistence against the Neon database. They run
// only when RUN_DB_TESTS=1 (npm run test:db) and expect db/migrations/001 to
// have been applied already.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `test-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

function credentials(email: string, password: string = PASSWORD): Record<string, unknown> {
  return { email, password };
}

describe.runIf(runDbTests)('auth endpoints (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadEnv();
    initDb(config);
    if (!(await checkDatabaseConnection())) {
      throw new Error('Database is not reachable. Apply migrations and try again.');
    }
    app = buildApp({ config, logger: false });
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    for (const email of createdEmails) {
      await deleteUserByEmail(undefined, email).catch(() => undefined);
    }
    await closeDb();
  });

  it('registers a participant and creates their participant profile', async () => {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Aisha',
        lastName: 'Abdullah',
        email,
        password: PASSWORD,
        country: 'Nigeria',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toMatchObject({
      firstName: 'Aisha',
      lastName: 'Abdullah',
      email,
      role: 'PARTICIPANT',
      country: 'Nigeria',
    });
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.accessToken.length).toBeGreaterThan(0);

    const rows = await queryText(
      getPool(),
      'SELECT COUNT(*)::text AS count FROM "participant_profiles" WHERE "userId" = $1',
      [body.data.user.id],
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(1);
  });

  it('rejects duplicate email registration with 409', async () => {
    const email = randomEmail();
    const payload = {
      firstName: 'Amina',
      lastName: 'Yusuf',
      email,
      password: PASSWORD,
      country: 'Nigeria',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload,
    });
    expect(second.statusCode).toBe(409);
    const body = second.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RESOURCE_ALREADY_EXISTS');
  });

  it('rejects a weak password with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Zainab',
        lastName: 'Okafor',
        email: randomEmail(),
        password: 'short',
        country: 'Nigeria',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('forbids self-registering an organization role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Bola',
        lastName: 'Igwe',
        email: randomEmail(),
        password: PASSWORD,
        country: 'Nigeria',
        role: 'ORGANIZATION_ADMIN',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('logs in with valid credentials', async () => {
    const email = randomEmail();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Chiamaka',
        lastName: 'Nwosu',
        email,
        password: PASSWORD,
        country: 'Kenya',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials(email),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(email);
    expect(typeof body.data.accessToken).toBe('string');
  });

  it('returns a generic 401 for a wrong password', async () => {
    const email = randomEmail();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Ngozi',
        lastName: 'Eze',
        email,
        password: PASSWORD,
        country: 'Ghana',
      },
    });

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials(email, 'WrongPassword999!'),
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials(randomEmail()),
    });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
      expect(body.error.message).toBe('Invalid email or password.');
    }
  });

  it('returns the current user from /auth/me', async () => {
    const email = randomEmail();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Fatima',
        lastName: 'Bello',
        email,
        password: PASSWORD,
        country: 'South Africa',
      },
    });
    const accessToken = register.json().data.accessToken as string;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(email);
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects /auth/me without a token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects /auth/me with an invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_TOKEN');
  });

  it('rejects /auth/me with an expired token', async () => {
    const email = randomEmail();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Halima',
        lastName: 'Adamu',
        email,
        password: PASSWORD,
        country: 'Egypt',
      },
    });
    const userId = register.json().data.user.id as string;

    const expiredToken = app.jwt.sign({ id: userId, role: 'PARTICIPANT' }, { expiresIn: -30 });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('TOKEN_EXPIRED');
  });

  it('logs out an authenticated user', async () => {
    const email = randomEmail();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Kemi',
        lastName: 'Adeyemi',
        email,
        password: PASSWORD,
        country: 'Nigeria',
      },
    });
    const accessToken = register.json().data.accessToken as string;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Logged out successfully');
  });

  it('rejects logout without a token', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});