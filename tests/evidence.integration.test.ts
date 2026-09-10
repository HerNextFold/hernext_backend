import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { readLatestOtp } from './helpers/auth.js';

const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `ev-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

async function call(
  app: FastifyInstance,
  options: { method: 'GET'; url: string; token?: string },
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: options.method,
    url: options.url,
    ...(options.token === undefined ? {} : { headers: { authorization: `Bearer ${options.token}` } }),
  });
}

async function findChallengeId(title: string): Promise<string> {
  const row = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "challenges" WHERE "title" = $1', [title]);
  if (row === null) {
    throw new Error(`Expected seeded challenge: ${title}`);
  }
  return row.id;
}

describe.runIf(runDbTests)('evidence API (integration)', { timeout: 120_000 }, () => {
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

  async function register(first = 'Ev', last = 'Tester'): Promise<{ token: string; userId: string }> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { firstName: first, lastName: last, email, password: PASSWORD, country: 'Kenya' },
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

  async function passReconciliation(token: string): Promise<void> {
    const challengeId = await findChallengeId('Financial Reconciliation Challenge');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/submit`,
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
    expect(response.statusCode).toBe(200);
  }

  it('requires authentication for evidence routes', async () => {
    const list = await call(app, { method: 'GET', url: '/api/v1/evidence' });
    expect(list.statusCode).toBe(401);
  });

  it('returns an empty list for a participant with no evidence', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/evidence', token });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.evidence).toEqual([]);
  });

  it('lists evidence created after passing a challenge', async () => {
    const { token } = await register('Ev', 'Challenger');
    await passReconciliation(token);

    const response = await call(app, { method: 'GET', url: '/api/v1/evidence', token });
    expect(response.statusCode).toBe(200);
    const items = response.json().data.evidence;
    expect(items.length).toBe(4);
    const [first] = items;
    expect(first.title).toBe('Financial Reconciliation Challenge');
    expect(first.status).toBe('PENDING');
    expect(first.skillName).toBeTruthy();
    expect(first.description).toBeTruthy();
    expect(first.result).toContain('PASSED');
  });

  it('returns an owned evidence item and 404 for a missing one', async () => {
    const { token } = await register('Ev', 'Owner');
    await passReconciliation(token);
    const list = await call(app, { method: 'GET', url: '/api/v1/evidence', token });
    const evidenceId = list.json().data.evidence[0].id;

    const owned = await call(app, { method: 'GET', url: `/api/v1/evidence/${evidenceId}`, token });
    expect(owned.statusCode).toBe(200);
    expect(owned.json().data.evidence.id).toBe(evidenceId);

    const missing = await call(app, { method: 'GET', url: `/api/v1/evidence/${randomUUID()}`, token });
    expect(missing.statusCode).toBe(404);
  });

  it('prevents IDOR: another participant cannot read someone elses evidence', async () => {
    const owner = await register('Ev', 'OwnerTwo');
    await passReconciliation(owner.token);
    const list = await call(app, { method: 'GET', url: '/api/v1/evidence', token: owner.token });
    const evidenceId = list.json().data.evidence[0].id;

    const intruder = await register('Ev', 'Intruder');
    const response = await call(app, {
      method: 'GET',
      url: `/api/v1/evidence/${evidenceId}`,
      token: intruder.token,
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects a malformed evidence id', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/evidence/not-a-uuid', token });
    expect(response.statusCode).toBe(400);
  });
});