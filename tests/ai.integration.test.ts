import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail, type UserRow } from '../src/models/user.model.js';
import { updateExperience } from '../src/models/experience.model.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { LLMProviderError, type LLMProvider } from '../src/modules/ai/providers/llm.provider.js';

// These tests exercise AI service behaviour against a real database (Neon)
// with a mocked LLM provider, so the normal test suite never needs a live AI
// provider (docs/AGENTS.md §37). Run with npm run test:db.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `ai-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

/** Deterministic fake provider whose response can be swapped per test. */
class FakeProvider implements LLMProvider {
  responder: (input: { system: string; user: string }) => unknown = () => ({});
  async completeStructured(input: { system: string; user: string }): Promise<unknown> {
    return this.responder(input);
  }
}

async function registerUser(app: FastifyInstance): Promise<{ user: UserRow; token: string }> {
  const email = randomEmail();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      firstName: 'AI',
      lastName: 'Tester',
      email,
      password: PASSWORD,
      country: 'Nigeria',
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  return { user: body.data.user as UserRow, token: body.data.accessToken as string };
}

async function createExperience(app: FastifyInstance, token: string): Promise<{ id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/experiences',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      title: 'POS Business Owner',
      description:
        'Ran a Point of Sale terminal business. Recorded daily transactions, reconciled totals each evening, balanced cash against sales, resolved customer payment issues, and kept manual ledgers.',
      organization: 'My POS Kiosk',
      years: 4,
      employmentType: 'SELF_EMPLOYED',
    },
  });
  expect(response.statusCode).toBe(201);
  return { id: response.json().data.id as string };
}

describe.runIf(runDbTests)('AI service (integration, mocked provider)', () => {
  let app: FastifyInstance;
  let provider: FakeProvider;
  let service: AiService;

  beforeAll(async () => {
    const config = loadEnv();
    initDb(config);
    if (!(await checkDatabaseConnection())) {
      throw new Error('Database is not reachable. Apply migrations and try again.');
    }
    app = buildApp({ config, logger: false });
    provider = new FakeProvider();
    service = new AiService(provider);
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

  it('runs a career impact assessment, validates output and persists it', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    provider.responder = () => ({
      automationTasks: ['Recording daily transactions'],
      augmentedTasks: ['Checking transaction anomalies'],
      humanStrengths: ['Resolving customer payment issues'],
      emergingSkills: ['Digital payment operations'],
      explanation: 'Grounded in the description of a POS business.',
    });

    const result = await service.runCareerImpact(user.id, experienceId);
    expect(result.experienceId).toBe(experienceId);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(result.level);
    expect(result.automationTasks).toContain('Recording daily transactions');

    const persisted = await queryRow<{ n: number }>(
      getPool(),
      'SELECT count(*)::int AS n FROM "career_analyses" WHERE "userId" = $1 AND "experienceId" = $2',
      [user.id, experienceId],
    );
    expect(persisted?.n).toBe(1);
  });

  it('reuses a stored assessment instead of calling the AI again', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    let calls = 0;
    provider.responder = () => {
      calls += 1;
      return {
        automationTasks: ['A'],
        augmentedTasks: ['B'],
        humanStrengths: ['C'],
        emergingSkills: [],
        explanation: 'first',
      };
    };

    await service.runCareerImpact(user.id, experienceId);
    await service.runCareerImpact(user.id, experienceId);
    expect(calls).toBe(1);
  });

  it('returns AI_OUTPUT_INVALID (422) when AI output fails validation', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    provider.responder = () => ({ explanation: 42 });

    await expect(service.runCareerImpact(user.id, experienceId)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
      statusCode: 422,
    });
  });

  it('fails safely (503) when the provider is unavailable', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    provider.responder = () => {
      throw new LLMProviderError('down', 'unavailable', true);
    };

    await expect(service.runTransferableSkills(user.id, experienceId)).rejects.toMatchObject({
      code: 'AI_SERVICE_ERROR',
      statusCode: 503,
    });
  });

  it('retries transient provider failures up to the bound', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    let calls = 0;
    provider.responder = () => {
      calls += 1;
      if (calls === 1) {
        throw new LLMProviderError('transient', 'unavailable', true);
      }
      return {
        automationTasks: ['A'],
        augmentedTasks: ['B'],
        humanStrengths: ['C'],
        emergingSkills: [],
        explanation: 'recovered',
      };
    };

    const result = await service.runCareerImpact(user.id, experienceId);
    expect(calls).toBe(2);
    expect(result.explanation).toBe('recovered');
  });

  it('extracts transferable skills, resolving only catalogue skill names', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    provider.responder = () => ({
      skills: [
        { skillName: 'Reconciliation', reason: 'Matched daily totals', confidence: 0.9 },
        { skillName: 'Attention to Detail', reason: 'Balanced the cash drawer', confidence: 0.85 },
        { skillName: 'A Made Up Skill', reason: 'Not in catalogue', confidence: 0.99 },
      ],
    });

    const result = await service.runTransferableSkills(user.id, experienceId);
    expect(result.some((item) => item.skillName === 'Reconciliation')).toBe(true);
    expect(result.some((item) => item.skillName === 'A Made Up Skill')).toBe(false);

    const userSkillNames = await queryText<{ name: string; source: string }>(
      getPool(),
      `SELECT s."name", us."source" FROM "user_skills" us JOIN "skills" s ON s."id" = us."skillId" WHERE us."userId" = $1 ORDER BY s."name"`,
      [user.id],
    );
    expect(userSkillNames).toContainEqual({
      name: 'Reconciliation',
      source: 'AI_DERIVED',
    });
  });

  it('rejects an out-of-range confidence value with AI_OUTPUT_INVALID', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    provider.responder = () => ({
      skills: [{ skillName: 'Reconciliation', reason: 'x', confidence: 5 }],
    });

    await expect(service.runTransferableSkills(user.id, experienceId)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
    });
  });

  it('returns 404 when the experience does not belong to the user', async () => {
    const { user } = await registerUser(app);
    const otherId = '00000000-0000-4000-8000-000000000000';
    await expect(service.runCareerImpact(user.id, otherId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('computes career recommendations and persists them ranked', async () => {
    const { user, token } = await registerUser(app);
    await createExperience(app, token);

    const recommendations = await service.runCareerRecommendations(user.id);
    expect(recommendations.length).toBeGreaterThan(0);
    // Ranks are 1..N in score order.
    const ranks = recommendations.map((r) => r.rank);
    expect(ranks).toEqual(Array.from({ length: ranks.length }, (_, i) => i + 1));

    const scores = recommendations.map((r) => r.matchScore);
    expect(scores.slice().sort((a, b) => b - a)).toEqual(scores);
  });

  it('computes skill gaps with statuses and priorities derived from the catalogue', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    provider.responder = () => ({
      skills: [
        { skillName: 'Reconciliation', reason: 'balanced totals', confidence: 0.9 },
        { skillName: 'Cash Management', reason: 'managed cash', confidence: 0.8 },
      ],
    });
    await service.runTransferableSkills(user.id, experienceId);

    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id;
    expect(careerId).toBeDefined();
    if (careerId === undefined) {
      throw new Error('Expected a seeded career in the catalogue.');
    }

    const result = await service.runSkillGaps(user.id, careerId);
    expect(result.career.id).toBe(careerId);
    expect(result.skills.length).toBeGreaterThan(0);
    for (const gap of result.skills) {
      expect(['HAS_SKILL', 'NEEDS_DEVELOPMENT']).toContain(gap.status);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(gap.priority);
    }
  });

  it('generates a roadmap with 30/60/90 phases and validates referenced skills', async () => {
    const { user, token } = await registerUser(app);
    await createExperience(app, token);
    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id as string;

    provider.responder = () => ({
      title: 'Become a Fintech Operations Associate',
      description: 'Close the gaps step by step.',
      phases: {
        30: [
          { title: 'Excel basics', description: 'Take a course', skillName: 'Excel', estimatedMinutes: 120 },
          { title: 'Spreadsheet practice', description: 'Build a ledger', skillName: 'Excel', estimatedMinutes: 90 },
          { title: 'Data analysis intro', description: 'Review trends', skillName: 'Data Analysis', estimatedMinutes: 60 },
        ],
        60: [
          { title: 'Fraud awareness', description: 'Read guidance', skillName: 'Fraud Awareness', estimatedMinutes: 45 },
          { title: 'Payment fraud cases', description: 'Study cases', skillName: 'Fraud Awareness', estimatedMinutes: 60 },
          { title: 'Digital payments', description: 'Practice', skillName: 'Digital Payments', estimatedMinutes: 90 },
        ],
        90: [
          { title: 'Digital payment tools', description: 'Hands-on', skillName: 'Digital Payments', estimatedMinutes: 120 },
          { title: 'Process improvement', description: 'Map workflows', skillName: 'Problem Solving', estimatedMinutes: 75 },
          { title: 'Risk scenarios', description: 'Case review', skillName: 'Risk Management', estimatedMinutes: 90 },
        ],
      },
    });

    const roadmap = await service.runRoadmap(user.id, careerId);
    expect(roadmap.roadmap.id).toBeDefined();
    expect(roadmap.phases.DAY_30.length).toBe(3);
    expect(roadmap.phases.DAY_60.length).toBe(3);
    expect(roadmap.phases.DAY_90.length).toBe(3);

    const taskCount = await queryRow<{ n: number }>(
      getPool(),
      'SELECT count(*)::int AS n FROM "roadmap_tasks" WHERE "roadmapId" = $1',
      [roadmap.roadmap.id],
    );
    expect(taskCount?.n).toBe(9);
  });

  it('regenerates the assessment when the experience changes or regenerate=true', async () => {
    const { user, token } = await registerUser(app);
    const { id: experienceId } = await createExperience(app, token);
    let calls = 0;
    provider.responder = () => {
      calls += 1;
      return {
        automationTasks: ['A'],
        augmentedTasks: ['B'],
        humanStrengths: ['C'],
        emergingSkills: [],
        explanation: `version ${calls}`,
      };
    };

    const first = await service.runCareerImpact(user.id, experienceId);
    const reused = await service.runCareerImpact(user.id, experienceId);
    expect(reused.id).toBe(first.id);
    expect(calls).toBe(1);

    // Editing the experience invalidates the cached assessment.
    await updateExperience(getPool(), experienceId, user.id, { description: 'A materially different role.' });
    const regenerated = await service.runCareerImpact(user.id, experienceId);
    expect(regenerated.id).not.toBe(first.id);
    expect(calls).toBe(2);

    // An explicit regenerate forces a new analysis even when nothing changed.
    const forced = await service.runCareerImpact(user.id, experienceId, true);
    expect(forced.id).not.toBe(regenerated.id);
    expect(forced.id).not.toBe(first.id);
    expect(calls).toBe(3);

    const persistedCount = await queryRow<{ n: number }>(
      getPool(),
      'SELECT count(*)::int AS n FROM "career_analyses" WHERE "userId" = $1 AND "experienceId" = $2',
      [user.id, experienceId],
    );
    expect(persistedCount?.n).toBe(3);
  });

  it('rejects roadmap output with fewer than 3 tasks per phase', async () => {
    const { user, token } = await registerUser(app);
    await createExperience(app, token);
    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id as string;

    provider.responder = () => ({
      title: 'Roadmap',
      description: 'Too sparse.',
      phases: {
        30: [{ title: 'Excel basics', description: 'x', skillName: 'Excel' }],
        60: [{ title: 'Fraud awareness', description: 'x', skillName: 'Fraud Awareness' }],
        90: [{ title: 'Digital payments', description: 'x', skillName: 'Digital Payments' }],
      },
    });

    await expect(service.runRoadmap(user.id, careerId)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
      statusCode: 422,
    });

    const roadmapCount = await queryRow<{ n: number }>(
      getPool(),
      'SELECT count(*)::int AS n FROM "roadmaps" WHERE "userId" = $1',
      [user.id],
    );
    expect(roadmapCount?.n).toBe(0);
  });

  it('rejects roadmap output referencing an unknown skill name', async () => {
    const { user, token } = await registerUser(app);
    await createExperience(app, token);
    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id as string;

    const threeTasks = (skillName: string) => [
      { title: 'Task 1', description: 'x', skillName },
      { title: 'Task 2', description: 'x', skillName: 'Excel' },
      { title: 'Task 3', description: 'x', skillName: 'Problem Solving' },
    ];
    provider.responder = () => ({
      title: 'Roadmap',
      description: 'References an out-of-catalogue skill.',
      phases: {
        30: threeTasks('Excel'),
        60: threeTasks('Fraud Awareness'),
        90: threeTasks('Made Up Skill'),
      },
    });

    await expect(service.runRoadmap(user.id, careerId)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
      statusCode: 422,
    });
  });

  it('reuses the current roadmap for the same career without an extra AI call', async () => {
    const { user, token } = await registerUser(app);
    await createExperience(app, token);
    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id as string;

    let calls = 0;
    provider.responder = () => {
      calls += 1;
      const task = (skillName: string, i: number) => ({
        title: `Task ${i}`,
        description: 'x',
        skillName,
      });
      return {
        title: 'Roadmap',
        description: 'Reused.',
        phases: {
          30: [task('Excel', 1), task('Excel', 2), task('Data Analysis', 3)],
          60: [task('Fraud Awareness', 1), task('Fraud Awareness', 2), task('Digital Payments', 3)],
          90: [task('Problem Solving', 1), task('Risk Management', 2), task('Digital Payments', 3)],
        },
      };
    };

    const first = await service.runRoadmap(user.id, careerId);
    const second = await service.runRoadmap(user.id, careerId);
    expect(second.roadmap.id).toBe(first.roadmap.id);
    expect(calls).toBe(1);

    const forced = await service.runRoadmap(user.id, careerId, true);
    expect(forced.roadmap.id).toBe(first.roadmap.id);

    const roadmapCount = await queryRow<{ n: number }>(
      getPool(),
      'SELECT count(*)::int AS n FROM "roadmaps" WHERE "userId" = $1',
      [user.id],
    );
    expect(roadmapCount?.n).toBe(1);
  });

  it('blocks roadmap generation when there are no skill gaps', async () => {
    const { user, token } = await registerUser(app);
    await createExperience(app, token);
    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id as string;

    // Give the user every catalogue skill, so no gaps remain.
    const allSkills = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "skills"');
    for (const skill of allSkills) {
      await queryText(
        getPool(),
        `INSERT INTO "user_skills" ("userId", "skillId", "source", "confidence", "proficiency")
         VALUES ($1, $2, 'AI_DERIVED', 1, 1)
         ON CONFLICT ("userId", "skillId") DO NOTHING`,
        [user.id, skill.id],
      );
    }

    await expect(service.runRoadmap(user.id, careerId)).rejects.toMatchObject({
      code: 'RESOURCE_ALREADY_EXISTS',
      statusCode: 409,
    });
  });
});