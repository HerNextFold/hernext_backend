import { getPool, queryText, type Db } from '../lib/db.js';

export type SkillSource = 'SELF_REPORTED' | 'AI_DERIVED' | 'CHALLENGE' | 'VERIFIED';

export interface UserSkillRow {
  id: string;
  userId: string;
  skillId: string;
  source: SkillSource;
  confidence: number;
  proficiency: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSkillWithName extends UserSkillRow {
  skillName: string;
  skillCategory?: string;
}

export type InheritableSkillSource = 'SELF_REPORTED' | 'AI_DERIVED' | 'CHALLENGE' | 'VERIFIED';

/** Loads every skill a user possesses, joined with the skill name. */
export async function listUserSkillsWithNames(
  db: Db | undefined,
  userId: string,
): Promise<UserSkillWithName[]> {
  return queryText<UserSkillWithName>(
    db ?? getPool(),
    `SELECT us.*, s."name" AS "skillName", s."category" AS "skillCategory"
     FROM "user_skills" us
     JOIN "skills" s ON s."id" = us."skillId"
     WHERE us."userId" = $1
     ORDER BY s."name" ASC`,
    [userId],
  );
}

/**
 * Trust ordering for a skill's provenance. A higher-trust source is never
 * overwritten by a lower-trust source, so AI-inferred skills can never degrade
 * skills earned through challenges or verified by an organization
 * (docs/AGENTS.md §18 "AI-derived skills remain AI_DERIVED", docs/PRODUCT_SPEC.md §30).
 */
export const SOURCE_RANK: Record<SkillSource, number> = {
  SELF_REPORTED: 1,
  AI_DERIVED: 2,
  CHALLENGE: 3,
  VERIFIED: 4,
};

/**
 * Upserts a user skill. Source/proficiency only change when the incoming
 * source has equal or higher trust than the stored one; confidence always
 * takes the greater of the two values. Removes duplicates by relying on the
 * UNIQUE ("userId", "skillId") index (db/migrations/002).
 */
export async function upsertUserSkill(
  db: Db,
  input: {
    userId: string;
    skillId: string;
    source: SkillSource;
    confidence: number;
    proficiency?: number;
  },
): Promise<void> {
  const incomingRank = SOURCE_RANK[input.source];
  await queryText(
    db,
    `INSERT INTO "user_skills" ("userId", "skillId", "source", "confidence", "proficiency")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("userId", "skillId") DO UPDATE
       SET "source" = CASE
             WHEN $6 >= (
               CASE "user_skills"."source"
                 WHEN 'VERIFIED' THEN 4
                 WHEN 'CHALLENGE' THEN 3
                 WHEN 'AI_DERIVED' THEN 2
                 ELSE 1
               END
             )
             THEN EXCLUDED."source"
             ELSE "user_skills"."source"
           END,
           "confidence" = GREATEST("user_skills"."confidence", EXCLUDED."confidence"),
           "proficiency" = CASE
             WHEN $6 >= (
               CASE "user_skills"."source"
                 WHEN 'VERIFIED' THEN 4
                 WHEN 'CHALLENGE' THEN 3
                 WHEN 'AI_DERIVED' THEN 2
                 ELSE 1
               END
             )
             THEN EXCLUDED."proficiency"
             ELSE "user_skills"."proficiency"
           END,
           "updatedAt" = now()
     RETURNING 1`,
    [input.userId, input.skillId, input.source, input.confidence, input.proficiency ?? 0, incomingRank],
  );
}
