import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail, type UserRow } from '../src/models/user.model.js';
import { calculateAiImpactScore, impactLevelForScore } from '../src/lib/scoring/ai-impact.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { GeminiProvider } from '../src/modules/ai/providers/gemini.provider.js';

/**
 * REAL Google Gemini end-to-end verification against the live database.
 *
 * This test intentionally does NOT run in the normal suite. It only executes
 * when BOTH of the following are true, so it can never accidentally call the
 * live provider during routine development or leak the API key:
 *
 *   - RUN_GEMINI=1                (explicit opt-in)
 *   - AI_PROVIDER=gemini AND AI_API_KEY AND AI_MODEL are set
 *
 * The API key is read from the environment at runtime and is never committed,
 * logged, or printed here.
 *
 * Run manually with:
 *   set RUN_GEMINI=1&& npx vitest run tests/gemini.integration.test.ts
 */
const runGemini = process.env.RUN_GEMINI === '1';
const apiKey = process.env.AI_API_KEY ?? '';
const model = process.env.AI_MODEL ?? '';
const providerMatches = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase() === 'gemini';
const enabled = runGemini && providerMatches && apiKey.length > 0 && model.length > 0;

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `gemini-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

describe('GeminiProvider real end-to-end (opt-in, live)', () => {
  let app: FastifyInstance;
  let service: AiService;
  let provider: GeminiProvider;

  beforeAll(async () => {
    if (!enabled) return;
    const config = loadEnv();
    initDb(config);
    if (!(await checkDatabaseConnection())) {
      throw new Error('Database is not reachable. Apply migrations and try again.');
    }
    app = buildApp({ config, logger: false });
    provider = new GeminiProvider({ apiKey, model, timeoutMs: 60_000 });
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

  async function registerUser(): Promise<{ user: UserRow; token: string }> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { firstName: 'Gemini', lastName: 'Tester', email, password: PASSWORD, country: 'Nigeria' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    return { user: body.data.user as UserRow, token: body.data.accessToken as string };
  }

  async function createExperience(token: string): Promise<{ id: string }> {
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

  it('runs a real career impact assessment end-to-end (Gemini → Zod → backend score → Neon)', async () => {
    if (!enabled) return;
    const { user, token } = await registerUser();
    const { id: experienceId } = await createExperience(token);

    // Full pipeline: AiService -> GeminiProvider -> Gemini 2.5 Flash -> structured
    // JSON -> Zod validation -> backend scoring -> model persistence.
    const result = await service.runCareerImpact(user.id, experienceId);

    // Structured output is present and well-formed.
    expect(result.experienceId).toBe(experienceId);
    expect(result.aiImpactScore).toBeGreaterThanOrEqual(0);
    expect(result.aiImpactScore).toBeLessThanOrEqual(100);
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(result.impactLevel);
    expect(result.explanation.length).toBeGreaterThan(0);

    // The row was persisted to Neon.
    const stored = await queryRow<{
      aiImpactScore: number;
      impactLevel: string;
      automationTasks: string[];
      augmentedTasks: string[];
      humanStrengths: string[];
    }>(
      getPool(),
      `SELECT "aiImpactScore", "impactLevel", "automationTasks", "augmentedTasks", "humanStrengths"
       FROM "career_analyses" WHERE "userId" = $1 AND "experienceId" = $2`,
      [user.id, experienceId],
    );
    expect(stored?.aiImpactScore).toBe(result.aiImpactScore);

    // Backend-owned scoring: the stored score is recomputed by the deterministic
    // backend formula from the AI's task arrays, NOT returned by Gemini.
    if (stored) {
      const expected = calculateAiImpactScore({
        automationCount: stored.automationTasks.length,
        augmentedCount: stored.augmentedTasks.length,
        humanCount: stored.humanStrengths.length,
      });
      expect(result.aiImpactScore).toBe(expected);
      expect(result.impactLevel).toBe(impactLevelForScore(expected));
    }
  });

  it('returns persisted career impact from the GET path without another Gemini call', async () => {
    if (!enabled) return;
    const { user, token } = await registerUser();
    const { id: experienceId } = await createExperience(token);

    // Generate once with the real provider.
    const generated = await service.runCareerImpact(user.id, experienceId);

    // GET path reads the persisted row without touching the provider.
    const fetched = await service.getCareerImpact(user.id, experienceId);
    expect(fetched.id).toBe(generated.id);
    expect(fetched.aiImpactScore).toBe(generated.aiImpactScore);
    expect(fetched.automationTasks).toEqual(generated.automationTasks);
  });

  it('extracts transferable skills with the real provider and stores them as AI_DERIVED (never VERIFIED)', async () => {
    if (!enabled) return;
    const { user, token } = await registerUser();
    const { id: experienceId } = await createExperience(token);

    const skills = await service.runTransferableSkills(user.id, experienceId);
    expect(Array.isArray(skills)).toBe(true);

    for (const skill of skills) {
      expect(skill.skillName).toBeTruthy();
      expect(skill.confidence).toBeGreaterThanOrEqual(0);
      expect(skill.confidence).toBeLessThanOrEqual(1);

      const row = await queryRow<{ source: string }>(
        getPool(),
        `SELECT us."source", us."confidence", us."proficiency"
         FROM "user_skills" us WHERE us."userId" = $1 AND us."skillId" = $2`,
        [user.id, skill.skillId],
      );
      expect(row?.source).toBe('AI_DERIVED');
      expect(row?.source).not.toBe('VERIFIED');
      if (row && 'confidence' in row) {
        const c = (row as { confidence?: number }).confidence;
        const p = (row as { proficiency?: number }).proficiency;
        expect(c).toBe(skill.confidence);
        if (p !== undefined) expect(p).toBe(skill.confidence);
      }
    }
  });

  it('generates a roadmap with the real provider (best-effort)', async () => {
    if (!enabled) return;
    const { user, token } = await registerUser();
    await createExperience(token);

    // Seed some user skills so at least one gap exists for the roadmap.
    await queryText(
      getPool(),
      `INSERT INTO "user_skills" ("userId", "skillId", "source", "confidence", "proficiency")
       SELECT $1, s."id", 'SELF_REPORTED', 1, 1 FROM "skills" s WHERE s."name" IN ('Customer Service','Cash Management')`,
      [user.id],
    );

    const careers = await queryText<{ id: string }>(getPool(), 'SELECT "id" FROM "career_paths" LIMIT 1');
    const careerId = careers[0]?.id;
    if (!careerId) return; // seed must exist

    const roadmap = (await service.runRoadmap(user.id, careerId)) as {
      roadmap: { id: string };
      phases: { DAY_30: unknown[]; DAY_60: unknown[]; DAY_90: unknown[] };
    };
    expect(roadmap.roadmap.id).toBeTruthy();
    expect([roadmap.phases.DAY_30, roadmap.phases.DAY_60, roadmap.phases.DAY_90].some((p) => p.length > 0)).toBe(true);

    const count = await queryRow<{ n: number }>(
      getPool(),
      'SELECT COUNT(*)::int AS n FROM "roadmap_tasks" WHERE "roadmapId" = $1',
      [roadmap.roadmap.id],
    );
    expect((count?.n ?? 0)).toBeGreaterThan(0);
  });
});
