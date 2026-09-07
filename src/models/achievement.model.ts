import { getPool, queryText, type Db } from '../lib/db.js';
import type { AchievementCode } from '../lib/scoring/achievements.js';

export interface AchievementRow {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, unknown>;
  createdAt: Date;
}

export interface UserAchievementRow {
  id: string;
  userId: string;
  achievementId: string;
  earnedAt: Date;
}

export interface AchievementWithEarned extends AchievementRow {
  code: AchievementCode | null;
  earned: boolean;
  earnedAt: Date | null;
}

const KNOWN_CODES = new Set<AchievementCode>([
  'PROFILE_COMPLETED',
  'ASSESSMENT_COMPLETED',
  'FIRST_SKILL_DISCOVERED',
  'FIRST_CHALLENGE_COMPLETED',
  'FIRST_EVIDENCE_CREATED',
  '30_DAY_GOAL_COMPLETED',
  'ROADMAP_COMPLETED',
  'PASSPORT_READY',
]);

function parseCode(criteria: Record<string, unknown>): AchievementCode | null {
  const value = criteria?.code;
  if (typeof value !== 'string') {
    return null;
  }
  return KNOWN_CODES.has(value as AchievementCode) ? (value as AchievementCode) : null;
}

/** Loads every achievement in the catalogue with the user's earn state derived. */
export async function listAchievementsWithEarned(
  db: Db | undefined,
  userId: string,
): Promise<AchievementWithEarned[]> {
  const rows = await queryText<AchievementRow & { earnedAt: Date | null }>(
    db ?? getPool(),
    `SELECT a.*, ua."earnedAt"
     FROM "achievements" a
     LEFT JOIN "user_achievements" ua
       ON ua."achievementId" = a."id" AND ua."userId" = $1
     ORDER BY a."name" ASC`,
    [userId],
  );
  return rows.map((row) => ({
    ...row,
    code: parseCode(row.criteria),
    earned: row.earnedAt !== null,
  }));
}

/**
 * Loads the stable catalogue code for every achievement (from its stored
 * criteria jsonb), so the evaluator can run deterministic rules over the
 * catalogue. Rows without a recognised code are excluded - an achievement with
 * unknown criteria can never be silently granted.
 */
export async function listAchievementCodes(db: Db | undefined): Promise<AchievementCode[]> {
  const rows = await queryText<{ code: string | null }>(
    db ?? getPool(),
    `SELECT "criteria" ->> 'code' AS code FROM "achievements"`,
  );
  return rows
    .map((r) => r.code)
    .filter((c): c is AchievementCode => c !== null && KNOWN_CODES.has(c as AchievementCode));
}

/**
 * Grants an achievement to a user only if not already earned. Idempotent: the
 * unique (userId, achievementId) constraint plus ON CONFLICT guarantees a user
 * never receives the same achievement twice (docs/SCORING_LOGIC.md §33).
 * Returns true when a new row was inserted.
 */
export async function grantAchievementIfNotEarned(
  db: Db,
  userId: string,
  achievementId: string,
): Promise<boolean> {
  const rows = await queryText<{ inserted: number }>(
    db,
    `INSERT INTO "user_achievements" ("userId", "achievementId")
     VALUES ($1, $2)
     ON CONFLICT ("userId", "achievementId") DO NOTHING
     RETURNING 1 AS inserted`,
    [userId, achievementId],
  );
  return rows.length > 0;
}