import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, getPool, initDb, queryRow, queryText } from '../src/lib/db.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { insertExperience } from '../src/models/experience.model.js';
import { insertCareerAnalysis } from '../src/models/ai.model.js';
import { insertRoadmap, insertRoadmapTask } from '../src/models/roadmap.model.js';
import { calculateAiImpactScore, impactLevelForScore } from '../src/lib/scoring/ai-impact.js';
import { readLatestOtp } from './helpers/auth.js';

// Exercises organizations, programs, participant monitoring, analytics and
// reports against the real database, including tenant isolation (IDOR).
// Run with npm run test:db.
const runDbTests = process.env.RUN_DB_TESTS === '1';

const PASSWORD = 'SecurePassword123!';
const createdEmails: string[] = [];

function randomEmail(): string {
  const email = `org-${randomUUID()}@example.com`;
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
    ...(options.payload === undefined ? {} : { payload: options.payload }),
    ...(options.token === undefined ? {} : { headers: { authorization: `Bearer ${options.token}` } }),
  });
}

describe.runIf(runDbTests)('organizations API (integration)', { timeout: 240_000 }, () => {
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
  }, 240_000);

  async function register(): Promise<{ token: string; userId: string }> {
    const email = randomEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Org',
        lastName: 'Tester',
        email,
        password: PASSWORD,
        country: 'Nigeria',
      },
    });
    expect(response.statusCode, `register response body: ${JSON.stringify(response.json())}`).toBe(201);
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

  async function createOrg(token: string): Promise<{ organizationId: string }> {
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/organizations',
      token,
      payload: { name: 'Test Org', description: 'A test organization', country: 'Nigeria' },
    });
    expect(response.statusCode).toBe(201);
    return { organizationId: response.json().data.organization.id as string };
  }

  async function createProgram(token: string, organizationId: string): Promise<{ programId: string }> {
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token,
      payload: { name: 'Test Cohort', description: 'A test cohort' },
    });
    expect(response.statusCode).toBe(201);
    return { programId: response.json().data.program.id as string };
  }

  async function addMember(organizationId: string, userId: string): Promise<void> {
    await queryText(
      getPool(),
      `INSERT INTO "organization_members" ("organizationId", "userId", "role") VALUES ($1, $2, 'MEMBER')`,
      [organizationId, userId],
    );
  }

  it('requires authentication for all organization endpoints', async () => {
    const orgId = randomUUID();
    const programId = randomUUID();
    const routes: Array<{ method: 'GET' | 'POST'; url: string; payload?: Record<string, unknown> }> = [
      { method: 'POST', url: '/api/v1/organizations', payload: { name: 'X', description: 'Y', country: 'Z' } },
      { method: 'GET', url: `/api/v1/organizations/${orgId}` },
      { method: 'POST', url: `/api/v1/organizations/${orgId}/programs`, payload: { name: 'P', description: 'D' } },
      { method: 'GET', url: `/api/v1/organizations/${orgId}/programs` },
      { method: 'POST', url: `/api/v1/programs/${programId}/participants`, payload: { userId: orgId } },
      { method: 'GET', url: `/api/v1/programs/${programId}/participants` },
      { method: 'GET', url: `/api/v1/programs/${programId}/participants/${orgId}` },
      { method: 'GET', url: `/api/v1/programs/${programId}/analytics` },
      { method: 'GET', url: `/api/v1/programs/${programId}/report` },
    ];
    for (const route of routes) {
      const response = await call(app, route);
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
  });

  it('creates an organization and makes its creator the founding ADMIN', async () => {
    const owner = await register();
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/organizations',
      token: owner.token,
      payload: { name: 'Women in Finance Nigeria', description: 'Career development program for women.', country: 'Nigeria' },
    });
    expect(response.statusCode).toBe(201);
    const organization = response.json().data.organization as Record<string, unknown>;
    expect(organization).toMatchObject({
      name: 'Women in Finance Nigeria',
      description: 'Career development program for women.',
      country: 'Nigeria',
      role: 'ADMIN',
    });
  });

  it('only exposes an organization to its members', async () => {
    const owner = await register();
    const outsider = await register();
    const { organizationId } = await createOrg(owner.token);

    const asMember = await call(app, {
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}`,
      token: owner.token,
    });
    expect(asMember.statusCode).toBe(200);
    expect(asMember.json().data.organization.id).toBe(organizationId);

    const asOutsider = await call(app, {
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}`,
      token: outsider.token,
    });
    expect(asOutsider.statusCode).toBe(403);

    const unknown = await call(app, {
      method: 'GET',
      url: `/api/v1/organizations/${randomUUID()}`,
      token: owner.token,
    });
    expect(unknown.statusCode).toBe(403);
  });

  it('creates programs as an admin and rejects members and non-members', async () => {
    const owner = await register();
    const member = await register();
    const outsider = await register();
    const { organizationId } = await createOrg(owner.token);
    await addMember(organizationId, member.userId);

    const asAdmin = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: owner.token,
      payload: { name: 'Admin Cohort', description: 'Created by an admin' },
    });
    expect(asAdmin.statusCode).toBe(201);
    expect(asAdmin.json().data.program.status).toBe('DRAFT');

    const asMember = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: member.token,
      payload: { name: 'Member Cohort', description: 'Should be rejected' },
    });
    expect(asMember.statusCode).toBe(403);

    const asOutsider = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: outsider.token,
      payload: { name: 'Outsider Cohort', description: 'Should be rejected' },
    });
    expect(asOutsider.statusCode).toBe(403);
  });

  it('lists programs for any member of the organization', async () => {
    const owner = await register();
    const member = await register();
    const { organizationId } = await createOrg(owner.token);
    await createProgram(owner.token, organizationId);
    await createProgram(owner.token, organizationId);
    await addMember(organizationId, member.userId);

    const response = await call(app, {
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: member.token,
    });
    expect(response.statusCode).toBe(200);
    const programs = response.json().data.programs as Array<Record<string, unknown>>;
    expect(programs.length).toBe(2);
  });

  it('enrolls participants, prevents duplicates, validates existence and role', async () => {
    const owner = await register();
    const member = await register();
    const participant = await register();
    const { organizationId } = await createOrg(owner.token);
    const { programId } = await createProgram(owner.token, organizationId);
    await addMember(organizationId, member.userId);

    const enroll = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: participant.userId },
    });
    expect(enroll.statusCode).toBe(201);
    expect(enroll.json().data.participant).toMatchObject({ programId, userId: participant.userId });

    const duplicate = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: participant.userId },
    });
    expect(duplicate.statusCode).toBe(409);

    const unknownUser = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: randomUUID() },
    });
    expect(unknownUser.statusCode).toBe(404);

    const notAdmin = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: member.token,
      payload: { userId: participant.userId },
    });
    expect(notAdmin.statusCode).toBe(403);
  });

  it('lists participant summaries with deterministic status', async () => {
    const owner = await register();
    const fresh = await register();
    const { organizationId } = await createOrg(owner.token);
    const { programId } = await createProgram(owner.token, organizationId);

    const enroll = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: fresh.userId },
    });
    expect(enroll.statusCode).toBe(201);

    const list = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
    });
    expect(list.statusCode).toBe(200);
    const participants = list.json().data.participants as Array<Record<string, unknown>>;
    expect(participants.length).toBe(1);
    const first = participants[0] as Record<string, unknown>;
    expect(first).toMatchObject({ id: fresh.userId, status: 'ON_TRACK' });
    expect(typeof first.readinessScore).toBe('number');
    expect(typeof first.roadmapProgress).toBe('number');
  });

  it('classifies a participant as AT_RISK when significantly behind the program timeline', async () => {
    const owner = await register();
    const inactive = await register();
    const { organizationId } = await createOrg(owner.token);

    const create = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: owner.token,
      payload: {
        name: 'Overdue Cohort',
        description: 'Timeline mostly elapsed',
        startDate: '2026-01-01',
        endDate: '2026-09-01',
      },
    });
    expect(create.statusCode).toBe(201);
    const programId = create.json().data.program.id as string;
    await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: inactive.userId },
    });

    const list = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
    });
    const participants = list.json().data.participants as Array<Record<string, unknown>>;
    expect((participants[0] as Record<string, unknown>).status).toBe('AT_RISK');
  });

  it('returns participant monitoring detail and hides it from other tenants', async () => {
    const owner = await register();
    const member = await register();
    const participant = await register();
    const outsiderAdmin = await register();
    const { organizationId } = await createOrg(owner.token);
    const { programId } = await createProgram(owner.token, organizationId);
    await addMember(organizationId, member.userId);
    await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: participant.userId },
    });

    const detail = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/participants/${participant.userId}`,
      token: member.token,
    });
    expect(detail.statusCode).toBe(200);
    const data = detail.json().data.participant as Record<string, unknown>;
    expect(data).toMatchObject({ id: participant.userId, status: 'ON_TRACK' });
    expect(data.currentCareerGoal).toBeNull();

    const notEnrolled = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/participants/${member.userId}`,
      token: owner.token,
    });
    expect(notEnrolled.statusCode).toBe(404);

    await createOrg(outsiderAdmin.token);
    const outsiderDetail = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/participants/${participant.userId}`,
      token: outsiderAdmin.token,
    });
    expect(outsiderDetail.statusCode).toBe(403);
  });

  it('returns analytics derived from source records with documented empty-data rules', async () => {
    const owner = await register();
    const participant = await register();
    const { organizationId } = await createOrg(owner.token);
    const { programId } = await createProgram(owner.token, organizationId);

    const empty = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/analytics`,
      token: owner.token,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().data.analytics).toMatchObject({
      totalParticipants: 0,
      activeParticipants: 0,
      assessmentCompletion: 0,
      averageReadiness: 0,
      averageRoadmapProgress: 0,
      challengesCompleted: 0,
      evidenceCreated: 0,
      passportsCreated: 0,
    });

    await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: participant.userId },
    });

    const experience = await insertExperience(getPool(), {
      userId: participant.userId,
      title: 'POS Business Owner',
      description: 'Processed transactions and reconciled cash daily.',
      organization: 'My Shop',
      years: 4,
      employmentType: 'INFORMAL_WORKER',
    });
    const score = calculateAiImpactScore({ automationCount: 3, augmentedCount: 3, humanCount: 3 });
    await insertCareerAnalysis(getPool(), {
      userId: participant.userId,
      experienceId: experience.id,
      aiImpactScore: score,
      impactLevel: impactLevelForScore(score),
      automationTasks: ['Recording transactions'],
      augmentedTasks: ['Transaction monitoring'],
      humanStrengths: ['Customer relationships'],
      emergingSkills: ['Excel'],
      explanation: 'Test analysis',
    });
    const career = await queryRow<{ id: string }>(
      getPool(),
      'SELECT "id" FROM "career_paths" ORDER BY "name" ASC LIMIT 1',
    );
    if (career !== null) {
      const roadmap = await insertRoadmap(getPool(), {
        userId: participant.userId,
        careerPathId: career.id,
        title: 'Monitor Roadmap',
        description: 'Roadmap for analytics test',
      });
      const task = await insertRoadmapTask(getPool(), {
        roadmapId: roadmap.id,
        phase: 'DAY_30',
        title: 'Excel fundamentals',
        description: 'Learn Excel',
        skillId: null,
        estimatedMinutes: 60,
        order: 1,
      });
      await insertRoadmapTask(getPool(), {
        roadmapId: roadmap.id,
        phase: 'DAY_30',
        title: 'Digital payments basics',
        description: 'Review settlement flows',
        skillId: null,
        estimatedMinutes: 45,
        order: 2,
      });
      await queryText(
        getPool(),
        `UPDATE "roadmap_tasks" SET "status" = 'COMPLETED', "completedAt" = now() WHERE "id" = $1`,
        [task.id],
      );
    }

    const filled = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/analytics`,
      token: owner.token,
    });
    const analytics = filled.json().data.analytics as Record<string, unknown>;
    expect(analytics.totalParticipants).toBe(1);
    expect(analytics.activeParticipants).toBe(1);
    expect(analytics.assessmentCompletion).toBe(100);
    expect(analytics.averageRoadmapProgress).toBe(50);
    expect(typeof analytics.averageReadiness).toBe('number');
    expect(analytics.averageReadiness).toBeGreaterThan(0);
  });

  it('returns a program report with status distribution and safe empty data', async () => {
    const owner = await register();
    const participantA = await register();
    const participantB = await register();
    const { organizationId } = await createOrg(owner.token);
    const { programId } = await createProgram(owner.token, organizationId);

    await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: participantA.userId },
    });
    await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: participantB.userId },
    });

    const response = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programId}/report`,
      token: owner.token,
    });
    expect(response.statusCode).toBe(200);
    const report = response.json().data.report as Record<string, unknown>;
    expect(report.program).toHaveProperty('id');
    expect(report.participants).toBe(2);
    const distribution = report.statusDistribution as {
      ON_TRACK: number;
      NEEDS_ATTENTION: number;
      AT_RISK: number;
    };
    expect(distribution.ON_TRACK + distribution.NEEDS_ATTENTION + distribution.AT_RISK).toBe(2);
  });

  it('enforces tenant isolation across organizations (IDOR)', async () => {
    const ownerA = await register();
    const ownerB = await register();
    const participantA = await register();
    const { organizationId: orgA } = await createOrg(ownerA.token);
    const { programId: programA } = await createProgram(ownerA.token, orgA);
    await createOrg(ownerB.token);

    await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programA}/participants`,
      token: ownerA.token,
      payload: { userId: participantA.userId },
    });

    const crossEnroll = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programA}/participants`,
      token: ownerB.token,
      payload: { userId: ownerB.userId },
    });
    expect(crossEnroll.statusCode).toBe(403);

    const crossList = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programA}/participants`,
      token: ownerB.token,
    });
    expect(crossList.statusCode).toBe(403);

    const crossAnalytics = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programA}/analytics`,
      token: ownerB.token,
    });
    expect(crossAnalytics.statusCode).toBe(403);

    const crossReport = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${programA}/report`,
      token: ownerB.token,
    });
    expect(crossReport.statusCode).toBe(403);

    const crossProgram = await call(app, {
      method: 'GET',
      url: `/api/v1/organizations/${orgA}/programs`,
      token: ownerB.token,
    });
    expect(crossProgram.statusCode).toBe(403);
  });

  it('rejects invalid request bodies and unknown programs', async () => {
    const owner = await register();
    const { organizationId } = await createOrg(owner.token);
    const { programId } = await createProgram(owner.token, organizationId);

    const missingName = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: owner.token,
      payload: { description: 'No name' },
    });
    expect(missingName.statusCode).toBe(400);

    const badDates = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: owner.token,
      payload: { name: 'Bad', description: 'X', startDate: '2026-12-01', endDate: '2026-11-01' },
    });
    expect(badDates.statusCode).toBe(400);

    const badUser = await call(app, {
      method: 'POST',
      url: `/api/v1/programs/${programId}/participants`,
      token: owner.token,
      payload: { userId: 'not-a-uuid' },
    });
    expect(badUser.statusCode).toBe(400);

    const invalidDate = await call(app, {
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/programs`,
      token: owner.token,
      payload: { name: 'Bad', description: 'X', startDate: 'not-a-date' },
    });
    expect(invalidDate.statusCode).toBe(400);

    const unknownProgram = await call(app, {
      method: 'GET',
      url: `/api/v1/programs/${randomUUID()}/participants`,
      token: owner.token,
    });
    expect(unknownProgram.statusCode).toBe(404);
  });
});