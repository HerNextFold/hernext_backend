import { getPool, queryRow, queryText, type Db } from '../lib/db.js';
import { findCareerById } from './catalogue.model.js';
import { findCareerProfileByUserId, type CareerProfileRow } from './career-profile.model.js';
import { listExperiences, type ExperienceRow } from './experience.model.js';
import {
  findLatestRoadmapWithTasks,
  type RoadmapPhase,
  type RoadmapWithTasks,
  type RoadmapTaskRow,
} from './roadmap.model.js';
import { listUserSkillsWithNames, type UserSkillWithName } from './user-skill.model.js';

/**
 * Journey-level metrics derived from persisted source records. All progress and
 * readiness values are computed from these counts - the backend never trusts
 * client-supplied percentages (docs/DEVELOPMENT_PLAN.md §24).
 */

export type ImpactLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface ImpactSnapshot {
  score: number;
  level: ImpactLevel;
  createdAt: Date;
}

export interface JourneyMetrics {
  hasCareerProfile: boolean;
  targetCareerId: string | null;
  targetCareerName: string | null;
  assessmentCount: number;
  latestAiImpact: ImpactSnapshot | null;
  transferableSkillCount: number;
  userSkills: UserSkillWithName[];
  evidenceCount: number;
  verifiedEvidenceCount: number;
  passedChallengeIds: ReadonlySet<string>;
  availableChallenges: Array<{ id: string; title: string }>;
  skillGapCountForTarget: number;
  hasPassport: boolean;
  experienceCount: number;
  relevantYears: number;
  hasExperienceRecords: boolean;
  currentRoadmap: RoadmapWithTasks | null;
}

export async function countCareerAnalyses(db: Db | undefined, userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    'SELECT COUNT(*)::text AS count FROM "career_analyses" WHERE "userId" = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function findLatestCareerAnalysis(
  db: Db | undefined,
  userId: string,
): Promise<ImpactSnapshot | null> {
  return queryRow<ImpactSnapshot>(
    db ?? getPool(),
    'SELECT "aiImpactScore" AS "score", "impactLevel" AS "level", "createdAt" FROM "career_analyses" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [userId],
  );
}

export async function countTransferableSkills(db: Db | undefined, userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    'SELECT COUNT(*)::text AS count FROM "transferable_skills" WHERE "userId" = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function countEvidence(db: Db | undefined, userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    'SELECT COUNT(*)::text AS count FROM "evidence" WHERE "userId" = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function countVerifiedEvidence(db: Db | undefined, userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    `SELECT COUNT(*)::text AS count FROM "evidence" WHERE "userId" = $1 AND "status" = 'VERIFIED'`,
    [userId],
  );
  return Number(row?.count ?? 0);
}

/** Challenge IDs with at least one PASSED submission for the user. */
export async function listPassedChallengeIds(db: Db | undefined, userId: string): Promise<string[]> {
  const rows = await queryText<{ challengeId: string }>(
    db ?? getPool(),
    `SELECT DISTINCT "challengeId" FROM "challenge_submissions"
     WHERE "userId" = $1 AND "status" = 'PASSED'`,
    [userId],
  );
  return rows.map((r) => r.challengeId);
}

export async function listAllChallenges(
  db: Db | undefined,
): Promise<Array<{ id: string; title: string }>> {
  return queryText(
    db ?? getPool(),
    'SELECT "id", "title" FROM "challenges" ORDER BY "title" ASC',
  );
}

export async function countSkillGapsForCareer(
  db: Db | undefined,
  userId: string,
  careerPathId: string,
): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    'SELECT COUNT(*)::text AS count FROM "skill_gaps" WHERE "userId" = $1 AND "careerPathId" = $2',
    [userId, careerPathId],
  );
  return Number(row?.count ?? 0);
}

export async function hasPassport(db: Db | undefined, userId: string): Promise<boolean> {
  const row = await queryRow<{ id: string }>(
    db ?? getPool(),
    'SELECT "id" FROM "career_passports" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  return row !== null;
}

function sumExperienceYears(experiences: ExperienceRow[]): number {
  return experiences.reduce((sum, e) => sum + (e.years ?? 0), 0);
}

function phaseStats(tasks: RoadmapTaskRow[], phase: RoadmapPhase): { total: number; completed: number } {
  const phaseTasks = tasks.filter((t) => t.phase === phase);
  return {
    total: phaseTasks.length,
    completed: phaseTasks.filter((t) => t.status === 'COMPLETED').length,
  };
}

/**
 * Loads every metric the progress, readiness, next-action and achievement
 * services need, so a dashboard read stays a small fixed set of queries with
 * no AI calls (docs/PRODUCT_SPEC.md §17).
 */
export async function loadJourneyMetrics(db: Db | undefined, userId: string): Promise<JourneyMetrics> {
  const pool = db ?? getPool();

  const careerProfile: CareerProfileRow | null = await findCareerProfileByUserId(pool, userId);

  const [
    experiences,
    userSkills,
    assessmentCount,
    latestAiImpact,
    transferableSkillCount,
    evidenceCount,
    verifiedEvidenceCount,
    passedChallengeIds,
    availableChallenges,
    passportExists,
    currentRoadmap,
  ] = await Promise.all([
    listExperiences(pool, userId),
    listUserSkillsWithNames(pool, userId),
    countCareerAnalyses(pool, userId),
    findLatestCareerAnalysis(pool, userId),
    countTransferableSkills(pool, userId),
    countEvidence(pool, userId),
    countVerifiedEvidence(pool, userId),
    listPassedChallengeIds(pool, userId),
    listAllChallenges(pool),
    hasPassport(pool, userId),
    findLatestRoadmapWithTasks(pool, userId),
  ]);

  const targetCareerId = careerProfile?.targetCareerId ?? null;
  const targetCareer = targetCareerId === null ? null : await findCareerById(pool, targetCareerId);

  const skillGapCountForTarget =
    careerProfile !== null && careerProfile.targetCareerId !== null
      ? await countSkillGapsForCareer(pool, userId, careerProfile.targetCareerId)
      : 0;

  return {
    hasCareerProfile: careerProfile !== null,
    targetCareerId,
    targetCareerName: targetCareer?.name ?? null,
    assessmentCount,
    latestAiImpact,
    transferableSkillCount,
    userSkills,
    evidenceCount,
    verifiedEvidenceCount,
    passedChallengeIds: new Set(passedChallengeIds),
    availableChallenges,
    skillGapCountForTarget,
    hasPassport: passportExists,
    experienceCount: experiences.length,
    relevantYears: (careerProfile?.yearsOfExperience ?? 0) + sumExperienceYears(experiences),
    hasExperienceRecords: experiences.length > 0,
    currentRoadmap,
  };
}

export { phaseStats };