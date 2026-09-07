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

/** Upserts an AI-derived user skill, keeping an existing AI-derived entry's confidence, else inserting. */
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
  await queryText(
    db,
    `INSERT INTO "user_skills" ("userId", "skillId", "source", "confidence", "proficiency")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("userId", "skillId") DO UPDATE
       SET "source" = EXCLUDED."source",
           "confidence" = GREATEST("user_skills"."confidence", EXCLUDED."confidence"),
           "proficiency" = EXCLUDED."proficiency",
           "updatedAt" = now()
     RETURNING 1`,
    [input.userId, input.skillId, input.source, input.confidence, input.proficiency ?? 0],
  );
}
