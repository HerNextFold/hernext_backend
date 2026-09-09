import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

export type SubmissionStatus = 'PENDING' | 'PASSED' | 'FAILED';

export interface ChallengeSubmissionRow {
  id: string;
  challengeId: string;
  userId: string;
  answer: Record<string, unknown>;
  score: number | null;
  status: SubmissionStatus;
  feedback: string | null;
  submittedAt: Date;
  evaluatedAt: Date | null;
}

export interface InsertSubmissionInput {
  challengeId: string;
  userId: string;
  answer: Record<string, unknown>;
  score: number;
  status: SubmissionStatus;
  feedback: string;
}

/**
 * Persists a challenge attempt. The schema has no unique constraint on
 * (challengeId, userId), so repeated submissions are stored as separate
 * attempts; progress is derived from DISTINCT passed challenges, so extra
 * attempts can never inflate progress or evidence.
 */
export async function insertSubmission(
  db: Db,
  input: InsertSubmissionInput,
): Promise<ChallengeSubmissionRow> {
  const row = await queryRow<ChallengeSubmissionRow>(
    db,
    `INSERT INTO "challenge_submissions"
       ("challengeId", "userId", "answer", "score", "status", "feedback", "evaluatedAt")
     VALUES ($1, $2, $3::jsonb, $4, $5::submission_status, $6, now())
     RETURNING *`,
    [
      input.challengeId,
      input.userId,
      JSON.stringify(input.answer),
      input.score,
      input.status,
      input.feedback,
    ],
  );
  if (row === null) {
    throw new Error('insertSubmission returned no row');
  }
  return row;
}

/** Latest attempt per challenge for the user's challenge list view. */
export async function listLatestSubmissions(
  db: Db | undefined,
  userId: string,
): Promise<Array<{ challengeId: string; status: SubmissionStatus; score: number | null; submittedAt: Date }>> {
  return queryText(
    db ?? getPool(),
    `SELECT DISTINCT ON ("challengeId") "challengeId", "status", "score", "submittedAt"
     FROM "challenge_submissions"
     WHERE "userId" = $1
     ORDER BY "challengeId", "submittedAt" DESC`,
    [userId],
  );
}

/** Challenges the user has passed, with challenge titles (for the passport). */
export async function listPassedChallengesForUser(
  db: Db | undefined,
  userId: string,
): Promise<Array<{ challengeId: string; title: string }>> {
  return queryText(
    db ?? getPool(),
    `SELECT DISTINCT cs."challengeId", c."title"
     FROM "challenge_submissions" cs
     JOIN "challenges" c ON c."id" = cs."challengeId"
     WHERE cs."userId" = $1 AND cs."status" = 'PASSED'
     ORDER BY c."title" ASC`,
    [userId],
  );
}