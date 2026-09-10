import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, initDb, getPool, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { insertRoadmap, insertRoadmapTask } from '../src/models/roadmap.model.js';
import { readLatestOtp } from './helpers/auth.js';

// Exercises progress + roadmap task completion against the real database.
// Run with npm run test:db.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `prog-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

async function call(
  app: FastifyInstance,
  options: {
    method: 'GET' | 'PATCH';
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

async function createRoadmapWithTasks(
  userId: string,
  taskCount = 3,
): Promise<{ roadmapId: string; taskIds: string[] }> {
  const where = await queryText<{ id: string; name: string }>(getPool(), 'SELECT "id", "name" FROM "career_paths" ORDER BY "name" ASC LIMIT 1');
  if (where[0] === undefined) {
    throw new Error('Expected a seeded career.');
  }
  const skill = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "skills" ORDER BY "name" ASC LIMIT 1');

  const roadmap = await insertRoadmap(getPool(), {
    userId,
    careerPathId: where[0].id,
    title: 'Progress Test Roadmap',
    description: 'Integration test roadmap',
  });

  const taskIds: string[] = [];
  for (let i = 0; i < taskCount; i += 1) {
    const task = await insertRoadmapTask(getPool(), {
      roadmapId: roadmap.id,
      phase: (i === 0 ? 'DAY_30' : i === 1 ? 'DAY_60' : 'DAY_90') as 'DAY_30' | 'DAY_60' | 'DAY_90',
      title: `Task ${i + 1}`,
      description: `Task ${i + 1} description`,
      skillId: skill[0]?.id ?? null,
      estimatedMinutes: 30,
      order: i + 1,
    });
    taskIds.push(task.id);
  }
  return { roadmapId: roadmap.id, taskIds };
}

describe.runIf(runDbTests)('progress API (integration)', () => {
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
        firstName: 'Prog',
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

  it('requires authentication for progress routes', async () => {
    for (const url of ['/api/v1/progress', '/api/v1/progress/summary', '/api/v1/progress/next-action']) {
      const response = await call(app, { method: 'GET', url });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('returns zeroed progress for a fresh participant', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/progress', token });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.overallProgress).toBe(0);
    expect(data.roadmapProgress).toBe(0);
    expect(data.challengeProgress).toBe(0);
    expect(data.evidenceCount).toBe(0);
    expect(data.skillsDeveloped).toBe(0);
    expect(data.skillsRemaining).toBe(0);
    expect(data.readinessScore).toBe(0);
  });

  it('returns zeroed summary for a fresh participant', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/progress/summary', token });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.currentCareerGoal).toBeNull();
    expect(data.careerReadiness).toBe(0);
    expect(data.roadmapProgress).toBe(0);
    expect(data.aiImpact).toBeNull();
    expect(data.skillsDeveloped).toBe(0);
    expect(data.skillsRemaining).toBe(0);
    expect(data.challengesCompleted).toBe(0);
    expect(data.evidenceCreated).toBe(0);
  });

  it('recommends completing the profile as the first action', async () => {
    const { token } = await register();
    const response = await call(app, { method: 'GET', url: '/api/v1/progress/next-action', token });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.type).toBe('COMPLETE_PROFILE');
  });

  it('updates a roadmap task status and recomputes progress', async () => {
    const { token, userId } = await register();
    const { taskIds } = await createRoadmapWithTasks(userId);

    const before = await call(app, { method: 'GET', url: '/api/v1/progress', token });
    expect(before.json().data.roadmapProgress).toBe(0);

    const patch = await call(app, {
      method: 'PATCH',
      url: `/api/v1/roadmaps/tasks/${taskIds[0]}`,
      token,
      payload: { status: 'COMPLETED' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.taskId).toBe(taskIds[0]);
    expect(patch.json().data.status).toBe('COMPLETED');
    expect(patch.json().data.completedAt).not.toBeNull();
    expect(patch.json().data.roadmapProgress).toBe(33);

    const after = await call(app, { method: 'GET', url: '/api/v1/progress', token });
    expect(after.json().data.roadmapProgress).toBe(33);

    // Verify the DB row actually changed.
    const row = await queryRow<{ status: string; completedAt: Date | null }>(
      getPool(),
      'SELECT "status", "completedAt" FROM "roadmap_tasks" WHERE "id" = $1',
      [taskIds[0]],
    );
    expect(row?.status).toBe('COMPLETED');
    expect(row?.completedAt).not.toBeNull();
  });

  it('validates status and rejects a task owned by another user (404)', async () => {
    const { token, userId } = await register();
    const other = await register();

    const { taskIds } = await createRoadmapWithTasks(userId);

    // Invalid status.
    const invalid = await call(app, {
      method: 'PATCH',
      url: `/api/v1/roadmaps/tasks/${taskIds[0]}`,
      token,
      payload: { status: 'DONE' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');

    // Ownership (IDOR) - another user cannot touch this task.
    const idor = await call(app, {
      method: 'PATCH',
      url: `/api/v1/roadmaps/tasks/${taskIds[0]}`,
      token: other.token,
      payload: { status: 'COMPLETED' },
    });
    expect(idor.statusCode).toBe(404);
    expect(idor.json().error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('returns 404 for a nonexistent task', async () => {
    const { token } = await register();
    const missing = '00000000-0000-4000-8000-000000000000';
    const response = await call(app, {
      method: 'PATCH',
      url: `/api/v1/roadmaps/tasks/${missing}`,
      token,
      payload: { status: 'COMPLETED' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('reflects lifecycle data in progress once a roadmap and skills exist', async () => {
    const { token, userId } = await register();
    const { taskIds } = await createRoadmapWithTasks(userId, 2);

    await call(app, {
      method: 'PATCH',
      url: `/api/v1/roadmaps/tasks/${taskIds[0]}`,
      token,
      payload: { status: 'COMPLETED' },
    });

    const response = await call(app, { method: 'GET', url: '/api/v1/progress', token });
    const data = response.json().data;
    expect(data.roadmapProgress).toBe(50);
    expect(data.overallProgress).toBeGreaterThan(0);
  });
});