import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import type { PassportRow } from '../src/models/passport.model.js';

const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `pp-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

async function call(
  app: FastifyInstance,
  options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: Record<string, unknown>;
  },
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: options.method,
    url: options.url,
    headers: options.token === undefined ? {} : { authorization: `Bearer ${options.token}` },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });
}

describe.runIf(runDbTests)('career passport API (integration)', { timeout: 120_000 }, () => {
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

  async function register(first: string, last: string): Promise<{ token: string; userId: string }> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { firstName: first, lastName: last, email, password: PASSWORD, country: 'Nigeria' },
    });
    expect(response.statusCode).toBe(201);
    const token = response.json().data.accessToken as string;
    const user = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "users" WHERE "email" = $1', [email]);
    if (user === null) {
      throw new Error('Expected created user.');
    }
    return { token, userId: user.id };
  }

  async function findPassport(userId: string): Promise<PassportRow | null> {
    return queryRow<PassportRow>(getPool(), 'SELECT * FROM "career_passports" WHERE "userId" = $1 LIMIT 1', [userId]);
  }

  it('requires authentication for the private passport routes', async () => {
    const get = await call(app, { method: 'GET', url: '/api/v1/passport' });
    expect(get.statusCode).toBe(401);
    const generate = await call(app, { method: 'POST', url: '/api/v1/passport/generate' });
    expect(generate.statusCode).toBe(401);
  });

  it('returns 404 before a passport has been generated', async () => {
    const { token } = await register('Fresh', 'User');
    const response = await call(app, { method: 'GET', url: '/api/v1/passport', token });
    expect(response.statusCode).toBe(404);
  });

  it('generates a private passport with a URL-safe slug and awards PASSPORT_READY', async () => {
    const { token, userId } = await register('Aisha', 'Demo');
    const response = await call(app, { method: 'POST', url: '/api/v1/passport/generate', token, payload: {} });
    expect(response.statusCode).toBe(200);
    const passport = response.json().data.passport;
    expect(passport.id).toBeTruthy();
    expect(passport.isPublic).toBe(false);
    expect(passport.slug).toMatch(/^[a-z0-9-]{1,120}$/);
    expect(passport.name).toBe('Aisha Demo');
    expect(passport.country).toBe('Nigeria');
    expect(typeof passport.readiness.score).toBe('number');
    expect(typeof passport.roadmapProgress).toBe('number');

    const row = await findPassport(userId);
    expect(row).not.toBeNull();
    expect(row!.slug).toBe(passport.slug);

    const achievements = await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    const list = achievements.json().data.achievements;
    const ready = list.find((a: { name: string }) => a.name === 'Career Passport Ready');
    expect(ready.earned).toBe(true);
  });

  it('re-generating keeps the same slug', async () => {
    const { token } = await register('Stable', 'Slug');
    await call(app, { method: 'POST', url: '/api/v1/passport/generate', token, payload: {} });
    const first = await call(app, { method: 'GET', url: '/api/v1/passport', token });
    const firstSlug = first.json().data.passport.slug;
    await call(app, { method: 'POST', url: '/api/v1/passport/generate', token, payload: {} });
    const second = await call(app, { method: 'GET', url: '/api/v1/passport', token });
    expect(second.json().data.passport.slug).toBe(firstSlug);
  });

  it('exposes only allowlisted fields on the public passport', async () => {
    const { token } = await register('Public', 'Face');
    await call(app, {
      method: 'POST',
      url: '/api/v1/passport/generate',
      token,
      payload: { isPublic: true },
    });
    const privateResponse = await call(app, { method: 'GET', url: '/api/v1/passport', token });
    const slug = privateResponse.json().data.passport.slug;

    const publicResponse = await call(app, { method: 'GET', url: `/api/v1/passport/public/${slug}` });
    expect(publicResponse.statusCode).toBe(200);
    const publicPassport = publicResponse.json().data.passport;
    expect(publicPassport.name).toBe('Public Face');
    expect(publicPassport.country).toBe('Nigeria');
    expect(typeof publicPassport.readiness).toBe('number');

    const serialized = JSON.stringify(publicPassport).toLowerCase();
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('passwordhash');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('challengeid');
    expect(publicPassport.profile).toBeUndefined();
    // Internal passport DB ids are never in the public payload.
    expect(publicPassport.id).toBeUndefined();
    expect(publicPassport.slug).toBeUndefined();
  });

  it('returns 404 for non-public and unknown slugs without leaking state', async () => {
    const hidden = await register('Hidden', 'Person');
    await call(app, { method: 'POST', url: '/api/v1/passport/generate', token: hidden.token, payload: {} });
    const hiddenPrivate = await call(app, { method: 'GET', url: '/api/v1/passport', token: hidden.token });
    const hiddenSlug = hiddenPrivate.json().data.passport.slug;

    const nonPublic = await call(app, { method: 'GET', url: `/api/v1/passport/public/${hiddenSlug}` });
    expect(nonPublic.statusCode).toBe(404);
    expect(nonPublic.json().error.code).toBe('RESOURCE_NOT_FOUND');

    const unknown = await call(app, { method: 'GET', url: `/api/v1/passport/public/${randomUUID()}` });
    expect(unknown.statusCode).toBe(404);
  });

  it('aggregates real records into the passport view', async () => {
    const { token, userId } = await register('Aggregated', 'Journey');

    const participantProfile = await queryRow<{ id: string }>(
      getPool(),
      'SELECT "id" FROM "participant_profiles" WHERE "userId" = $1',
      [userId],
    );
    if (participantProfile === null) {
      throw new Error('Expected participant profile.');
    }
    const career = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" ORDER BY "name" ASC LIMIT 1');
    if (career === null) {
      throw new Error('Expected seeded career.');
    }
    await queryText(
      getPool(),
      `INSERT INTO "career_profiles"
         ("participantProfileId", "currentOccupation", "industry", "yearsOfExperience", "employmentType", "targetCareerId")
       VALUES ($1, 'POS Business Owner', 'Financial Services', 4, 'SELF_EMPLOYED', $2)`,
      [participantProfile.id, career.id],
    );

    await app.inject({
      method: 'POST',
      url: '/api/v1/experiences',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'POS Business Owner',
        description: 'Own and run a point-of-sale payments business.',
        organization: 'Self',
        years: 4,
        employmentType: 'SELF_EMPLOYED',
      },
    });

    const challengeId = await queryRow<{ id: string }>(
      getPool(),
      'SELECT "id" FROM "challenges" WHERE "title" = $1',
      ['Financial Reconciliation Challenge'],
    );
    if (challengeId === null) {
      throw new Error('Expected seeded challenge.');
    }
    await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId.id}/submit`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        answer: {
          totalCredits: 250000,
          totalDebits: 245000,
          difference: 5000,
          discrepancyFound: true,
          explanation: 'A debit of 5,000 was recorded on the statement but is missing from the ledger.',
        },
      },
    });

    await call(app, { method: 'POST', url: '/api/v1/passport/generate', token, payload: { isPublic: true } });
    const privateResponse = await call(app, { method: 'GET', url: '/api/v1/passport', token });
    const passport = privateResponse.json().data.passport;
    expect(passport.headline).toContain('Aspiring');
    expect(passport.experience.length).toBe(1);
    expect(passport.challenges.length).toBe(1);
    expect(passport.evidence.length).toBe(4);
    expect(passport.readiness.score).toBeGreaterThan(0);

    const slug = passport.slug;
    const publicResponse = await call(app, { method: 'GET', url: `/api/v1/passport/public/${slug}` });
    expect(publicResponse.statusCode).toBe(200);
    const publicPassport = publicResponse.json().data.passport;
    expect(publicPassport.experience.length).toBe(1);
    expect(publicPassport.challenges).toEqual([{ title: 'Financial Reconciliation Challenge' }]);
    expect(publicPassport.achievements.length).toBeGreaterThan(0);
  });

  it('rejects unknown fields on generate and malformed slugs', async () => {
    const { token } = await register('Strict', 'Body');
    const unknown = await call(app, {
      method: 'POST',
      url: '/api/v1/passport/generate',
      token,
      payload: { email: 'leak@example.com' },
    });
    expect(unknown.statusCode).toBe(400);

    const callResult = await call(app, { method: 'GET', url: '/api/v1/passport/public/Not A Slug!' });
    expect(callResult.statusCode).toBe(400);
  });
});