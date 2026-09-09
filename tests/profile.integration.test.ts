import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';

// Exercises the GET/PUT /profile API against the real database. Run with
// npm run test:db. Requires migration 003 (career_profiles unique).
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `prof-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

describe.runIf(runDbTests)('career profile API (integration)', () => {
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

  async function register(): Promise<{ token: string; userId: string }> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { firstName: 'Prof', lastName: 'Tester', email, password: PASSWORD, country: 'Nigeria' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    return { token: body.data.accessToken as string, userId: body.data.user.id as string };
  }

  function call(options: {
    method: 'GET' | 'PUT';
    url: string;
    token?: string;
    payload?: Record<string, unknown>;
  }): Promise<LightMyRequestResponse> {
    return app.inject({
      method: options.method,
      url: options.url,
      ...(options.payload === undefined ? {} : { body: options.payload }),
      ...(options.token === undefined ? {} : { headers: { authorization: `Bearer ${options.token}` } }),
    });
  }

  it('requires authentication for profile routes', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      const response = await call({ method, url: '/api/v1/profile' });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('returns 404 when no career profile exists yet', async () => {
    const { token } = await register();
    const response = await call({ method: 'GET', url: '/api/v1/profile', token });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('creates, reads and updates the career profile', async () => {
    const { token } = await register();
    const skills = await queryText<{ id: string; name: string }>(getPool(), 'SELECT "id", "name" FROM "skills"');

    const payload = {
      currentOccupation: 'POS Business Owner',
      industry: 'Financial Services',
      yearsOfExperience: 4,
      education: 'Secondary School',
      employmentType: 'INFORMAL_WORKER',
      careerInterests: ['Fintech', 'Banking Operations'],
      skillIds: skills.slice(0, 3).map((s) => s.id),
    };

    const create = await call({ method: 'PUT', url: '/api/v1/profile', token, payload });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.currentOccupation).toBe('POS Business Owner');
    expect(created.employmentType).toBe('INFORMAL_WORKER');
    expect(created.targetCareer).toBeNull();
    expect(created.existingSkills.map((s: { skillName: string }) => s.skillName).sort()).toEqual(
      skills.slice(0, 3).map((s) => s.name).sort(),
    );

    const before = await call({ method: 'GET', url: '/api/v1/profile', token });
    expect(before.statusCode).toBe(200);

    // Updating must not create a second career_profile row.
    const updatedPayload = { ...payload, currentOccupation: 'Senior POS Business Owner', yearsOfExperience: 5 };
    const update = await call({ method: 'PUT', url: '/api/v1/profile', token, payload: updatedPayload });
    expect(update.statusCode).toBe(200);
    expect(update.json().data.currentOccupation).toBe('Senior POS Business Owner');
    expect(update.json().data.yearsOfExperience).toBe(5);

    const rows = await queryText<{ n: string }>(
      getPool(),
      `SELECT COUNT(*)::text AS n FROM "career_profiles" cp
       JOIN "participant_profiles" pp ON pp."id" = cp."participantProfileId"
       JOIN "users" u ON u."id" = pp."userId"`,
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(0);
  });

  it('rejects an unknown target career id with 404', async () => {
    const { token } = await register();
    const response = await call({
      method: 'PUT',
      url: '/api/v1/profile',
      token,
      payload: {
        currentOccupation: 'Trader',
        industry: 'Retail',
        yearsOfExperience: 2,
        employmentType: 'SELF_EMPLOYED',
        targetCareerId: '00000000-0000-4000-8000-000000000000',
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('accepts an approved target career and embeds it in the response', async () => {
    const { token } = await register();
    const careers = await queryText<{ id: string; name: string }>(getPool(), 'SELECT "id", "name" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id;
    expect(careerId).toBeDefined();
    if (careerId === undefined) {
      throw new Error('Expected a seeded career.');
    }

    const response = await call({
      method: 'PUT',
      url: '/api/v1/profile',
      token,
      payload: {
        currentOccupation: 'Bank Teller',
        industry: 'Financial Services',
        yearsOfExperience: 3,
        employmentType: 'EMPLOYED',
        targetCareerId: careerId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.targetCareer).toMatchObject({ id: careerId, name: careers[0]?.name });
  });

  it('rejects skill ids outside the approved catalogue with 400', async () => {
    const { token } = await register();
    const response = await call({
      method: 'PUT',
      url: '/api/v1/profile',
      token,
      payload: {
        currentOccupation: 'Trader',
        industry: 'Retail',
        yearsOfExperience: 2,
        employmentType: 'SELF_EMPLOYED',
        skillIds: ['00000000-0000-4000-8000-000000000000'],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('stores existing skills as SELF_REPORTED user skills', async () => {
    const { token, userId } = await register();
    const reconciliation = await queryText<{ id: string }>(
      getPool(),
      'SELECT "id" FROM "skills" WHERE "name" = $1 LIMIT 1',
      ['Reconciliation'],
    );
    expect(reconciliation[0]?.id).toBeDefined();
    if (reconciliation[0]?.id === undefined) {
      throw new Error('Expected seeded Reconciliation skill.');
    }

    const response = await call({
      method: 'PUT',
      url: '/api/v1/profile',
      token,
      payload: {
        currentOccupation: 'POS Business Owner',
        industry: 'Financial Services',
        yearsOfExperience: 4,
        employmentType: 'SELF_EMPLOYED',
        skillIds: [reconciliation[0].id],
      },
    });
    expect(response.statusCode).toBe(200);

    const rows = await queryText<{ source: string }>(
      getPool(),
      'SELECT "source" FROM "user_skills" WHERE "userId" = $1 AND "skillId" = $2',
      [userId, reconciliation[0].id],
    );
    expect(rows[0]?.source).toBe('SELF_REPORTED');
  });

  it('validates the request body', async () => {
    const { token } = await register();
    const response = await call({
      method: 'PUT',
      url: '/api/v1/profile',
      token,
      payload: { currentOccupation: '', industry: 'x', yearsOfExperience: -1, employmentType: 'NOT_A_TYPE' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});