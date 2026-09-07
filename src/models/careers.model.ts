import { getPool, queryRow, queryText, type Db } from '../lib/db.js';
import type { GapPriority, SkillGapStatus } from '../lib/scoring/skill-gap.js';

export interface CareerRecommendationRow {
  id: string;
  userId: string;
  careerPathId: string;
  matchScore: number;
  reason: string;
  rank: number;
  createdAt: Date;
}

export interface SkillGapRow {
  id: string;
  userId: string;
  careerPathId: string;
  skillId: string;
  status: SkillGapStatus;
  priority: GapPriority;
  reason: string | null;
  createdAt: Date;
}

/** Replaces all stored recommendations for a user (for a given recompute). */
export async function replaceCareerRecommendations(
  db: Db,
  userId: string,
  items: Array<{ careerPathId: string; matchScore: number; reason: string; rank: number }>,
): Promise<void> {
  await queryText(db, 'DELETE FROM "career_recommendations" WHERE "userId" = $1', [userId]);
  for (const item of items) {
    await queryText(
      db,
      `INSERT INTO "career_recommendations"
         ("userId", "careerPathId", "matchScore", "reason", "rank")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, item.careerPathId, item.matchScore, item.reason, item.rank],
    );
  }
}

export async function listCareerRecommendationsWithName(
  db: Db | undefined,
  userId: string,
): Promise<
  Array<{ careerId: string; careerName: string; matchScore: number; rank: number; reason: string }>
> {
  return queryText(
    db ?? getPool(),
    `SELECT cr."careerPathId" AS "careerId", cp."name" AS "careerName",
            cr."matchScore", cr."rank", cr."reason"
     FROM "career_recommendations" cr
     JOIN "career_paths" cp ON cp."id" = cr."careerPathId"
     WHERE cr."userId" = $1
     ORDER BY cr."rank" ASC`,
    [userId],
  );
}

export async function replaceSkillGaps(
  db: Db,
  userId: string,
  careerPathId: string,
  items: Array<{ skillId: string; status: SkillGapStatus; priority: GapPriority; reason: string | null }>,
): Promise<void> {
  await queryText(db, 'DELETE FROM "skill_gaps" WHERE "userId" = $1 AND "careerPathId" = $2', [
    userId,
    careerPathId,
  ]);
  for (const item of items) {
    await queryText(
      db,
      `INSERT INTO "skill_gaps"
         ("userId", "careerPathId", "skillId", "status", "priority", "reason")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, careerPathId, item.skillId, item.status, item.priority, item.reason],
    );
  }
}

export async function listSkillGapsWithNames(
  db: Db | undefined,
  userId: string,
  careerPathId: string,
): Promise<Array<{ skillId: string; skillName: string; status: SkillGapStatus; priority: GapPriority }>> {
  return queryText(
    db ?? getPool(),
    `SELECT sg."skillId", s."name" AS "skillName", sg."status", sg."priority"
     FROM "skill_gaps" sg
     JOIN "skills" s ON s."id" = sg."skillId"
     WHERE sg."userId" = $1 AND sg."careerPathId" = $2
     ORDER BY sg."priority" DESC, s."name" ASC`,
    [userId, careerPathId],
  );
}

export async function findSkillGapsForUserCareer(
  db: Db | undefined,
  userId: string,
  careerPathId: string,
): Promise<SkillGapRow[]> {
  return queryText<SkillGapRow>(
    db ?? getPool(),
    'SELECT * FROM "skill_gaps" WHERE "userId" = $1 AND "careerPathId" = $2',
    [userId, careerPathId],
  );
}

export async function countRecommendations(db: Db | undefined, userId: string): Promise<number> {
  const row = await queryRow<{ count: string }>(
    db ?? getPool(),
    'SELECT COUNT(*)::text AS count FROM "career_recommendations" WHERE "userId" = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}
