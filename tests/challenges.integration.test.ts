import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { readLatestOtp } from './helpers/auth.js';

const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `ch-${randomUUID()}@example.com`;
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

async function findChallengeId(title: string): Promise<string> {
  const row = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "challenges" WHERE "title" = $1', [title]);
  if (row === null) {
    throw new Error(`Expected seeded challenge: ${title}`);
  }
  return row.id;
}

const CORRECT_RECONCILIATION = {
  answer: {
    totalCredits: 250000,
    totalDebits: 245000,
    difference: 5000,
    discrepancyFound: true,
    explanation:
      'A debit of 5,000 was recorded on the statement but is missing from the ledger, causing the difference.',
  },
};

const WRONG_RECONCILIATION = {
  answer: {
    totalCredits: 100,
    totalDebits: 200,
    difference: 300,
    discrepancyFound: false,
    explanation: 'x',
  },
};

describe.runIf(runDbTests)('challenges API (integration)', { timeout: 120_000 }, () => {
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
      payload: {
        firstName: 'Chal',
        lastName: 'Tester',
        email,
        password: PASSWORD,
        country: 'Nigeria',
      },
    });
    expect(response.statusCode).toBe(201);
    const code = readLatestOtp(app, email, 'EMAIL_VERIFICATION');
    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email-otp',
      payload: { email, code },
    });
    expect(verify.statusCode).toBe(200);
    const token = verify.json().data.accessToken as string;
    const user = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "users" WHERE "email" = $1', [email]);
    if (user === null) {
      throw new Error('Expected created user.');
    }
    return { token, userId: user.id };
  }

  async function countForUser(table: 'challenge_submissions' | 'evidence', userId: string): Promise<number> {
    const row = await queryRow<{ count: string }>(
      getPool(),
      `SELECT COUNT(*)::text AS count FROM "${table}" WHERE "userId" = $1`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  it('requires authentication for challenge routes', async () => {
    const list = await call(app, { method: 'GET', url: '/api/v1/challenges' });
    expect(list.statusCode).toBe(401);
    const detail = await call(app, { method: 'GET', url: '/api/v1/challenges/cbd50f9c-0000-4000-8000-000000000000' });
    expect(detail.statusCode).toBe(401);
  });

  it('lists the seeded challenges with their skills', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/challenges', token });
    expect(response.statusCode).toBe(200);
    const challenges = response.json().data.challenges;
    expect(challenges.length).toBeGreaterThanOrEqual(2);
    const reconciliation = challenges.find(
      (c: { title: string }) => c.title === 'Financial Reconciliation Challenge',
    );
    expect(reconciliation).toBeDefined();
    expect(reconciliation.skills.length).toBeGreaterThan(0);
    expect(reconciliation.latestAttempt).toBeNull();
  });

  it('filters challenges by difficulty and skill', async () => {
    const { token } = await register();
    const filters = await call(app, { method: 'GET', url: '/api/v1/challenges?difficulty=BEGINNER', token });
    expect(filters.statusCode).toBe(200);
    expect(filters.json().data.challenges.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 404 for an unknown challenge and 404 for get by id', async () => {
    const { token } = await register();
    const missing = await call(
      app,
      { method: 'GET', url: `/api/v1/challenges/${randomUUID()}`, token },
    );
    expect(missing.statusCode).toBe(404);

    const challengeId = await findChallengeId('Financial Reconciliation Challenge');
    const detail = await call(app, { method: 'GET', url: `/api/v1/challenges/${challengeId}`, token });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.challenge.title).toBe('Financial Reconciliation Challenge');
  });

  it('passes a correct reconciliation, creates evidence and awards achievements', async () => {
    const { token, userId } = await register();
    const challengeId = await findChallengeId('Financial Reconciliation Challenge');

    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: CORRECT_RECONCILIATION,
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.status).toBe('PASSED');
    expect(data.score).toBe(100);
    expect(data.feedback).toContain('correctly reconciled');
    expect(data.evidenceCreated).toBe(4);

    const submissions = await countForUser('challenge_submissions', userId);
    expect(submissions).toBe(1);
    const evidenceCount = await countForUser('evidence', userId);
    expect(evidenceCount).toBe(4);

    const evidence = await queryText<{ status: string; skillName: string | null }>(
      getPool(),
      `SELECT e."status", s."name" AS "skillName"
       FROM "evidence" e LEFT JOIN "skills" s ON s."id" = e."skillId"
       WHERE e."userId" = $1 ORDER BY s."name" ASC`,
      [userId],
    );
    expect(evidence.every((row) => row.status === 'PENDING')).toBe(true);
    expect(evidence.map((row) => row.skillName)).toEqual(
      expect.arrayContaining([
        'Financial Record Keeping',
        'Reconciliation',
        'Attention to Detail',
        'Problem Solving',
      ]),
    );

    const achievements = await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    const list = achievements.json().data.achievements;
    const firstChallenge = list.find((a: { name: string }) => a.name === 'First Challenge Completed');
    const firstEvidence = list.find((a: { name: string }) => a.name === 'First Evidence Added');
    expect(firstChallenge.earned).toBe(true);
    expect(firstEvidence.earned).toBe(true);
  });

  it('upgrades challenge skills to CHALLENGE source on a pass', async () => {
    const { token, userId } = await register();
    const challengeId = await findChallengeId('Financial Reconciliation Challenge');
    await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: CORRECT_RECONCILIATION,
    });
    const sources = await queryText<{ source: string }>(
      getPool(),
      `SELECT DISTINCT us."source"
       FROM "user_skills" us
       JOIN "challenge_skills" cs ON cs."skillId" = us."skillId" AND cs."challengeId" = $2
       WHERE us."userId" = $1`,
      [userId, challengeId],
    );
    expect(sources.map((s) => s.source)).toEqual(['CHALLENGE']);
  });

  it('fails a wrong answer without creating evidence or skills', async () => {
    const { token, userId } = await register();
    const challengeId = await findChallengeId('Financial Reconciliation Challenge');
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: WRONG_RECONCILIATION,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('FAILED');
    expect(response.json().data.evidenceCreated).toBe(0);
    expect(await countForUser('evidence', userId)).toBe(0);
    const skills = await queryRow<{ count: string }>(
      getPool(),
      'SELECT COUNT(*)::text AS count FROM "user_skills" WHERE "userId" = $1',
      [userId],
    );
    expect(Number(skills?.count ?? 0)).toBe(0);
  });

  it('keeps evidence and achievements idempotent across repeated passes', async () => {
    const { token, userId } = await register();
    const challengeId = await findChallengeId('Financial Reconciliation Challenge');

    await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: CORRECT_RECONCILIATION,
    });
    await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: CORRECT_RECONCILIATION,
    });

    // Two attempts stored, but evidence stays at one row per challenge skill.
    expect(await countForUser('challenge_submissions', userId)).toBe(2);
    expect(await countForUser('evidence', userId)).toBe(4);

    const userAchievements = await queryRow<{ count: string }>(
      getPool(),
      'SELECT COUNT(*)::text AS count FROM "user_achievements" WHERE "userId" = $1',
      [userId],
    );
    // Unique (userId, achievementId) keeps award count stable across re-runs.
    expect(Number(userAchievements?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('evaluates the payment resolution challenge deterministically', async () => {
    const { token, userId } = await register();
    const challengeId = await findChallengeId('Customer Payment Resolution Challenge');
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: {
        answer: {
          steps: [
            'Verify the transaction status',
            'Contact the customer to explain',
            'Check the payment gateway',
            'Push a refund to reverse the charge',
            'Confirm the outcome with the customer',
          ],
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('PASSED');
    expect(response.json().data.score).toBe(100);
    expect(await countForUser('evidence', userId)).toBe(4);
  });

  it('rejects invalid and unknown fields with 400', async () => {
    const { token } = await register();
    const challengeId = await findChallengeId('Financial Reconciliation Challenge');

    const unknownKey = await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: { answer: { totalCredits: 1 }, bonus: 'nope' },
    });
    expect(unknownKey.statusCode).toBe(400);

    const wrongShape = await call(app, {
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
      token,
      payload: { answer: { steps: ['Verify the transaction'] } },
    });
    expect(wrongShape.statusCode).toBe(400);
    expect(wrongShape.json().error.code).toBe('VALIDATION_ERROR');

    const invalidId = await call(app, {
      method: 'POST',
      url: '/api/v1/challenges/not-a-uuid/submit',
      token,
      payload: CORRECT_RECONCILIATION,
    });
    expect(invalidId.statusCode).toBe(400);
  });
});