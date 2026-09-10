import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { insertRoadmap, insertRoadmapTask } from '../src/models/roadmap.model.js';
import { readLatestOtp } from './helpers/auth.js';

const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `ach-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

async function call(
  app: FastifyInstance,
  options: {
    method: 'GET';
    url: string;
    token?: string;
  },
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: options.method,
    url: options.url,
    ...(options.token === undefined ? {} : { headers: { authorization: `Bearer ${options.token}` } }),
  });
}

/** Inserts a realistic career profile for the test user. */
async function insertCareerProfile(userId: string, skillIds: string[]): Promise<void> {
  const participantProfile = await queryRow<{ id: string }>(
    getPool(),
    'SELECT "id" FROM "participant_profiles" WHERE "userId" = $1',
    [userId],
  );
  if (participantProfile === null) {
    throw new Error('Expected a participant profile created on registration.');
  }
  const career = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" ORDER BY "name" ASC LIMIT 1');
  if (career === null) {
    throw new Error('Expected a seeded career.');
  }
  await queryText(
    getPool(),
    `INSERT INTO "career_profiles"
       ("participantProfileId", "currentOccupation", "industry", "yearsOfExperience", "employmentType", "targetCareerId")
     VALUES ($1, 'POS Business Owner', 'Financial Services', 4, 'SELF_EMPLOYED', $2)`,
    [participantProfile.id, career.id],
  );
  for (const skillId of skillIds) {
    await queryText(
      getPool(),
      `INSERT INTO "user_skills" ("userId", "skillId", "source", "confidence", "proficiency")
       VALUES ($1, $2, 'SELF_REPORTED', 0.5, 0.5)
       ON CONFLICT ("userId", "skillId") DO NOTHING`,
      [userId, skillId],
    );
  }
}

async function loadUserSkillCount(userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    getPool(),
    'SELECT COUNT(*)::text AS count FROM "user_skills" WHERE "userId" = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}

describe.runIf(runDbTests)('achievements API (integration)', { timeout: 90_000 }, () => {
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
        firstName: 'Ach',
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

  it('requires authentication for the achievements route', async () => {
    const response = await call(app, { method: 'GET', url: '/api/v1/achievements' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns all achievements unearned for a fresh participant', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.achievements.length).toBeGreaterThan(0);
    for (const a of body.data.achievements) {
      expect(a.earned).toBe(false);
      expect(a.earnedAt).toBeNull();
    }
  });

  it('awards PROFILE_COMPLETED and FIRST_SKILL_DISCOVERED when state is met', async () => {
    const { token, userId } = await register();
    const skills = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "skills" ORDER BY "name" ASC LIMIT 2');
    const skillIds = skills.map((s) => s.id);
    await insertCareerProfile(userId, skillIds);
    const skillCount = await loadUserSkillCount(userId);
    expect(skillCount).toBe(skillIds.length);

    const response = await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    expect(response.statusCode).toBe(200);
    const achievements = response.json().data.achievements;
    const profileAch = achievements.find((a: { name: string }) => a.name === 'Profile Completed');
    const skillAch = achievements.find((a: { name: string }) => a.name === 'First Skill Discovered');
    expect(profileAch).toBeDefined();
    expect(profileAch!.earned).toBe(true);
    expect(profileAch!.earnedAt).not.toBeNull();
    expect(skillAch).toBeDefined();
    expect(skillAch!.earned).toBe(true);
    expect(skillAch!.earnedAt).not.toBeNull();
  });

  it('is idempotent: repeated calls never duplicate earned rows', async () => {
    const { token, userId } = await register();
    await insertCareerProfile(userId, []);

    await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    const firstRow = await queryRow<{ count: string }>(
      getPool(),
      'SELECT COUNT(*)::text AS count FROM "user_achievements" WHERE "userId" = $1',
      [userId],
    );
    expect(firstRow).not.toBeNull();

    await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    const secondRow = await queryRow<{ count: string }>(
      getPool(),
      'SELECT COUNT(*)::text AS count FROM "user_achievements" WHERE "userId" = $1',
      [userId],
    );

    expect(secondRow?.count).toBe(firstRow?.count);
  });

  it('awards ROADMAP_COMPLETED and 30_DAY_GOAL when all tasks are done', async () => {
    const { token, userId } = await register();
    const skill = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "skills" ORDER BY "name" ASC LIMIT 1');
    const career = await queryRow<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" ORDER BY "name" ASC LIMIT 1');
    if (skill === null || career === null) {
      throw new Error('Expected seeded catalogue.');
    }

    const participantProfile = await queryRow<{ id: string }>(
      getPool(),
      'SELECT "id" FROM "participant_profiles" WHERE "userId" = $1',
      [userId],
    );
    if (participantProfile === null) {
      throw new Error('Expected participant profile.');
    }
    await queryText(
      getPool(),
      `INSERT INTO "career_profiles"
         ("participantProfileId", "currentOccupation", "industry", "yearsOfExperience", "employmentType", "targetCareerId")
       VALUES ($1, 'Pos', 'Finance', 3, 'SELF_EMPLOYED', $2)`,
      [participantProfile.id, career.id],
    );

    const roadmap = await insertRoadmap(getPool(), {
      userId,
      careerPathId: career.id,
      title: 'Achievement Test Roadmap',
      description: 'Test',
    });

    // Insert 2 tasks, complete both.
    for (const [phase, order] of [['DAY_30', 1], ['DAY_30', 2]] as const) {
      await insertRoadmapTask(getPool(), {
        roadmapId: roadmap.id,
        phase,
        title: `Complete me ${order}`,
        description: 'Task',
        skillId: skill.id,
        estimatedMinutes: 30,
        order,
      });
    }
    const tasks = await queryText<{ id: string }>(
      getPool(),
      'SELECT "id" FROM "roadmap_tasks" WHERE "roadmapId" = $1 ORDER BY "order"',
      [roadmap.id],
    );
    for (const task of tasks) {
      await call(app, {
        method: 'GET',
        url: `/api/v1/roadmaps/tasks/${task.id}`,
        token,
      });
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/roadmaps/tasks/${task.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'COMPLETED' },
      });
    }

    const response = await call(app, { method: 'GET', url: '/api/v1/achievements', token });
    const achievements = response.json().data.achievements;
    const roadmapAch = achievements.find((a: { name: string }) => a.name === 'Roadmap Completed');
    const goalAch = achievements.find((a: { name: string }) => a.name === '30-Day Goal Completed');
    expect(roadmapAch).toBeDefined();
    expect(roadmapAch!.earned).toBe(true);
    expect(goalAch).toBeDefined();
    expect(goalAch!.earned).toBe(true);
  });
});