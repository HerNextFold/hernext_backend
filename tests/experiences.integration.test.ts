import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, initDb } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';

// Exercises the experiences CRUD API against the real database. Run with
// npm run test:db. Ownership is enforced through userId from the token.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `exp-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

async function call(
  app: FastifyInstance,
  options: {
    method: 'POST' | 'GET' | 'PUT' | 'DELETE';
    url: string;
    token?: string;
    payload?: Record<string, unknown>;
  },
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: options.method,
    url: options.url,
    ...(options.payload === undefined ? {} : { body: options.payload }),
    ...(options.token === undefined ? {} : { headers: { authorization: `Bearer ${options.token}` } }),
  });
}

describe.runIf(runDbTests)('experiences API (integration)', () => {
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

  async function register(): Promise<string> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Exp',
        lastName: 'Tester',
        email,
        password: PASSWORD,
        country: 'Nigeria',
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().data.accessToken as string;
  }

  it('requires authentication for every experiences route', async () => {
    const url = '/api/v1/experiences';
    for (const method of ['POST', 'GET'] as const) {
      const response = await call(app, { method, url });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('creates, lists, gets, updates and deletes an experience', async () => {
    const token = await register();

    const createResponse = await call(app, {
      method: 'POST',
      url: '/api/v1/experiences',
      token,
      payload: {
        title: 'POS Business Owner',
        description: 'Managed a POS kiosk, reconciled cash daily.',
        organization: 'My Kiosk',
        years: 4,
        employmentType: 'SELF_EMPLOYED',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const experience = createResponse.json().data;
    expect(experience.employmentType).toBe('SELF_EMPLOYED');
    expect(experience.years).toBe(4);

    const listResponse = await call(app, { method: 'GET', url: '/api/v1/experiences', token });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.experiences.some((e: { id: string }) => e.id === experience.id)).toBe(true);

    const updateResponse = await call(app, {
      method: 'PUT',
      url: `/api/v1/experiences/${experience.id}`,
      token,
      payload: {
        title: 'POS Business Owner (Senior)',
        years: 5,
        startDate: '2023-01-01',
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data.years).toBe(5);
    expect(new Date(updateResponse.json().data.startDate).toISOString().startsWith('2023')).toBe(true);

    const getResponse = await call(app, { method: 'GET', url: `/api/v1/experiences/${experience.id}`, token });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().data.title).toBe('POS Business Owner (Senior)');

    const deleteResponse = await call(app, { method: 'DELETE', url: `/api/v1/experiences/${experience.id}`, token });
    expect(deleteResponse.statusCode).toBe(200);

    const missing = await call(app, { method: 'GET', url: `/api/v1/experiences/${experience.id}`, token });
    expect(missing.statusCode).toBe(404);
  });

  it('rejects a second user from reading another user experience (IDOR)', async () => {
    const ownerToken = await register();
    const attackerToken = await register();

    const create = await call(app, {
      method: 'POST',
      url: '/api/v1/experiences',
      token: ownerToken,
      payload: {
        title: 'Secret Ledger',
        description: 'Private.',
        employmentType: 'EMPLOYED',
      },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().data.id as string;

    const read = await call(app, { method: 'GET', url: `/api/v1/experiences/${id}`, token: attackerToken });
    expect(read.statusCode).toBe(404);

    const update = await call(app, {
      method: 'PUT',
      url: `/api/v1/experiences/${id}`,
      token: attackerToken,
      payload: { title: 'Hacked' },
    });
    expect(update.statusCode).toBe(404);

    const del = await call(app, { method: 'DELETE', url: `/api/v1/experiences/${id}`, token: attackerToken });
    expect(del.statusCode).toBe(404);
  });

  it('validates the request body', async () => {
    const token = await register();
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/experiences',
      token,
      payload: { title: '', description: 'x', employmentType: 'NOT_A_TYPE' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});