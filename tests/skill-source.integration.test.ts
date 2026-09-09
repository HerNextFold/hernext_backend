import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { upsertUserSkill } from '../src/models/user-skill.model.js';

// Verifies that an AI-derived skill never downgrades a higher-trust provenance
// (docs/AGENTS.md §18, §P1-5). Run with npm run test:db.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `skill-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

describe.runIf(runDbTests)('user skill source preservation (integration)', () => {
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

  async function registerUserId(): Promise<string> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { firstName: 'Skill', lastName: 'Tester', email, password: PASSWORD, country: 'Nigeria' },
    });
    expect(response.statusCode).toBe(201);
    return response.json().data.user.id as string;
  }

  async function skillId(name: string): Promise<string> {
    const rows = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "skills" WHERE "name" = $1 LIMIT 1', [name]);
    const id = rows[0]?.id;
    expect(id).toBeDefined();
    if (id === undefined) {
      throw new Error(`Expected seeded skill ${name}.`);
    }
    return id;
  }

  async function currentSource(userId: string, id: string): Promise<string | undefined> {
    const rows = await queryText<{ source: string }>(
      getPool(),
      'SELECT "source" FROM "user_skills" WHERE "userId" = $1 AND "skillId" = $2',
      [userId, id],
    );
    return rows[0]?.source;
  }

  it('keeps the source when an AI-derived attempt hits an existing SELF_REPORTED skill (upgrades to AI_DERIVED)', async () => {
    const userId = await registerUserId();
    const id = await skillId('Reconciliation');
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'SELF_REPORTED', confidence: 1 });
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'AI_DERIVED', confidence: 0.9, proficiency: 0.9 });
    expect(await currentSource(userId, id)).toBe('AI_DERIVED');
  });

  it('refreshes an existing AI_DERIVED skill', async () => {
    const userId = await registerUserId();
    const id = await skillId('Reconciliation');
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'AI_DERIVED', confidence: 0.7, proficiency: 0.7 });
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'AI_DERIVED', confidence: 0.9, proficiency: 0.9 });
    expect(await currentSource(userId, id)).toBe('AI_DERIVED');
  });

  it('never downgrades a CHALLENGE skill to AI_DERIVED', async () => {
    const userId = await registerUserId();
    const id = await skillId('Reconciliation');
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'CHALLENGE', confidence: 1, proficiency: 1 });
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'AI_DERIVED', confidence: 0.95, proficiency: 0.95 });
    expect(await currentSource(userId, id)).toBe('CHALLENGE');
  });

  it('never downgrades a VERIFIED skill to AI_DERIVED', async () => {
    const userId = await registerUserId();
    const id = await skillId('Reconciliation');
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'VERIFIED', confidence: 1, proficiency: 1 });
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'AI_DERIVED', confidence: 0.95, proficiency: 0.95 });
    expect(await currentSource(userId, id)).toBe('VERIFIED');
  });

  it('never downgrades a VERIFIED/CHALLENGE proficiency with an AI inference', async () => {
    const userId = await registerUserId();
    const id = await skillId('Excel');
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'VERIFIED', confidence: 0.5, proficiency: 1 });
    await upsertUserSkill(getPool(), { userId, skillId: id, source: 'AI_DERIVED', confidence: 0.9, proficiency: 0.2 });
    const rows = await queryText<{ source: string; proficiency: number }>(
      getPool(),
      'SELECT "source", "proficiency" FROM "user_skills" WHERE "userId" = $1 AND "skillId" = $2',
      [userId, id],
    );
    expect(rows[0]).toEqual({ source: 'VERIFIED', proficiency: 1 });
  });
});