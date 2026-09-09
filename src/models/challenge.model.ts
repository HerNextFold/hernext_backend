import { getPool, queryText, type Db } from '../lib/db.js';

export type ChallengeDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface ChallengeRow {
  id: string;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  createdAt: Date;
  updatedAt: Date;
}

export async function listChallenges(
  db: Db | undefined,
  filters: { skillId?: string; difficulty?: ChallengeDifficulty } = {},
): Promise<ChallengeRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.skillId !== undefined) {
    params.push(filters.skillId);
    conditions.push(
      `EXISTS (SELECT 1 FROM "challenge_skills" cs WHERE cs."challengeId" = c."id" AND cs."skillId" = $${params.length})`,
    );
  }
  if (filters.difficulty !== undefined) {
    params.push(filters.difficulty);
    conditions.push(`c."difficulty" = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return queryText<ChallengeRow>(
    db ?? getPool(),
    `SELECT c.* FROM "challenges" c ${where} ORDER BY c."title" ASC`,
    params,
  );
}

export async function findChallengeById(db: Db | undefined, id: string): Promise<ChallengeRow | null> {
  const rows = await queryText<ChallengeRow>(
    db ?? getPool(),
    'SELECT * FROM "challenges" WHERE "id" = $1',
    [id],
  );
  return rows[0] ?? null;
}

export interface ChallengeSkillRow {
  challengeId: string;
  skillId: string;
  skillName: string;
}

/** Loads the skill ids/names linked to the given challenges in one query. */
export async function listChallengeSkills(
  db: Db | undefined,
  challengeIds: string[],
): Promise<ChallengeSkillRow[]> {
  if (challengeIds.length === 0) {
    return [];
  }
  return queryText<ChallengeSkillRow>(
    db ?? getPool(),
    `SELECT cs."challengeId", s."id" AS "skillId", s."name" AS "skillName"
     FROM "challenge_skills" cs
     JOIN "skills" s ON s."id" = cs."skillId"
     WHERE cs."challengeId" = ANY($1::uuid[])
     ORDER BY s."name" ASC`,
    [challengeIds],
  );
}

export interface ChallengeWithSkills extends ChallengeRow {
  skills: Array<{ skillId: string; skillName: string }>;
}

/** Interface shared by challenge list responses so skills are attached once. */
export function attachSkills(
  challenges: ChallengeRow[],
  skillRows: ChallengeSkillRow[],
): ChallengeWithSkills[] {
  const byChallenge = new Map<string, Array<{ skillId: string; skillName: string }>>();
  for (const row of skillRows) {
    const list = byChallenge.get(row.challengeId) ?? [];
    list.push({ skillId: row.skillId, skillName: row.skillName });
    byChallenge.set(row.challengeId, list);
  }
  return challenges.map((challenge) => ({
    ...challenge,
    skills: byChallenge.get(challenge.id) ?? [],
  }));
}