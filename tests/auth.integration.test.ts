import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { readLatestOtp } from './helpers/auth.js';

// These tests exercise real persistence against the Neon database. They run
// only when RUN_DB_TESTS=1 (npm run test:db) and expect the migrations to
// have been applied already.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `auth-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

function credentials(email: string, password: string = PASSWORD): Record<string, unknown> {
  return { email, password };
}

function registerPayload(email: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: 'Aisha',
    lastName: 'Abdullah',
    email,
    password: PASSWORD,
    country: 'Nigeria',
    ...overrides,
  };
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

  async function register(email: string): Promise<{ statusCode: number; body: Record<string, any> }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registerPayload(email),
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  async function verifyEmail(email: string): Promise<{ statusCode: number; body: Record<string, any> }> {
    const code = readLatestOtp(app, email, 'EMAIL_VERIFICATION');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email-otp',
      payload: { email, code },
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  async function registerAndVerify(
    email: string,
  ): Promise<{ user: Record<string, any>; accessToken: string; email: string }> {
    const result = await register(email);
    expect(result.statusCode).toBe(201);
    const verified = await verifyEmail(email);
    expect(verified.statusCode).toBe(200);
    return {
      email,
      user: verified.body.data.user as Record<string, any>,
      accessToken: verified.body.data.accessToken as string,
    };
  }

  it('registers a participant as UNVERIFIED and returns no access token', async () => {
    const email = randomEmail();
    const { statusCode, body } = await register(email);
    expect(statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.verificationStatus).toBe('PENDING');
    expect(body.data).not.toHaveProperty('accessToken');
    expect(body.data.user).toMatchObject({
      firstName: 'Aisha',
      lastName: 'Abdullah',
      email,
      role: 'PARTICIPANT',
      country: 'Nigeria',
      emailVerified: false,
    });
    expect(body.data.user).not.toHaveProperty('passwordHash');

    const rows = await queryText(
      getPool(),
      'SELECT COUNT(*)::text AS count FROM "participant_profiles" WHERE "userId" = $1',
      [body.data.user.id],
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(1);

    // A code must have been captured by the TestEmailProvider (never returned in the API).
    expect(readLatestOtp(app, email, 'EMAIL_VERIFICATION')).toMatch(/^\d{6}$/);
  });

  it('verifies the email OTP and issues the first access token', async () => {
    const email = randomEmail();
    const { user, accessToken } = await registerAndVerify(email);
    expect(user.email).toBe(email);
    expect(user.emailVerified).toBe(true);
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);
  });

  it('rejects an unverified account at login with ACCOUNT_UNVERIFIED', async () => {
    const email = randomEmail();
    await register(email);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials(email),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ACCOUNT_UNVERIFIED');
  });

  it('allows login after verification', async () => {
    const email = randomEmail();
    await registerAndVerify(email);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials(email),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.emailVerified).toBe(true);
    expect(typeof body.data.accessToken).toBe('string');
  });

  it('returns a single generic INVALID_OTP for wrong codes and unknown emails', async () => {
    const email = randomEmail();
    await register(email);
    const wrongCode = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email-otp',
      payload: { email, code: '000001' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email-otp',
      payload: { email: randomEmail(), code: '000001' },
    });
    for (const response of [wrongCode, unknown]) {
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_OTP');
      expect(body.error.message).toBe('Invalid or expired verification code.');
    }
  });

  it('invalidates the OTP after the maximum number of attempts', async () => {
    const email = randomEmail();
    await register(email);
    const originalCode = readLatestOtp(app, email, 'EMAIL_VERIFICATION');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email-otp',
        payload: { email, code: '000000' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_OTP');
    }

    // Even the correct code is now unusable: the OTP was invalidated.
    const correct = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email-otp',
      payload: { email, code: originalCode },
    });
    expect(correct.statusCode).toBe(400);
    expect(correct.json().error.code).toBe('INVALID_OTP');
  });

  it('resend-email-verification is enumeration-safe and respects the cooldown', async () => {
    const email = randomEmail();
    await register(email);
    const original = readLatestOtp(app, email, 'EMAIL_VERIFICATION');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-email-verification',
      payload: { email },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({});

    // Within the cooldown no new code is generated: the captured code is unchanged.
    expect(readLatestOtp(app, email, 'EMAIL_VERIFICATION')).toBe(original);

    // Unknown emails receive the same generic 200.
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-email-verification',
      payload: { email: randomEmail() },
    });
    expect(unknown.statusCode).toBe(200);
  });

  it('rejects duplicate email registration with 409', async () => {
    const email = randomEmail();
    const first = await register(email);
    expect(first.statusCode).toBe(201);
    const second = await register(email);
    expect(second.statusCode).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe('RESOURCE_ALREADY_EXISTS');
  });

  it('rejects a weak password with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registerPayload(randomEmail(), { password: 'short' }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('forbids self-registering an organization role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registerPayload(randomEmail(), { role: 'ORGANIZATION_ADMIN' }),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('returns a generic 401 for a wrong password or unknown email', async () => {
    const email = randomEmail();
    await registerAndVerify(email);

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
    const { email, accessToken } = await registerAndVerify(randomEmail());
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(email);
    expect(body.data.emailVerified).toBe(true);
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
    const { user } = await registerAndVerify(randomEmail());
    const expiredToken = app.jwt.sign({ id: user.id, role: 'PARTICIPANT' }, { expiresIn: -30 });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('TOKEN_EXPIRED');
  });

  it('logs out an authenticated user', async () => {
    const { accessToken } = await registerAndVerify(randomEmail());
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe('Logged out successfully');
  });

  it('rejects logout without a token', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});