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