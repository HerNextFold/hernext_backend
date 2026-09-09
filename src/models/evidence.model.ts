import { getPool, queryText, queryRow, type Db } from '../lib/db.js';

export type EvidenceStatus = 'PENDING' | 'VERIFIED';

export interface EvidenceRow {
  id: string;
  userId: string;
  challengeId: string | null;
  skillId: string | null;
  title: string;
  description: string;
  result: string;
  status: EvidenceStatus;
  createdAt: Date;
}

export interface EvidenceWithSkill extends EvidenceRow {
  skillName: string | null;
}

export interface InsertEvidenceInput {
  userId: string;
  challengeId: string | null;
  skillId: string | null;
  title: string;
  description: string;
  result: string;
  status: EvidenceStatus;
}

/**
 * Inserts an evidence row, returning null when an identical
 * (userId, challengeId, skillId) row already exists. The unique constraint
 * added by migration 005 makes evidence creation idempotent - re-processing a
 * passed challenge never creates duplicates (docs/PRODUCT_SPEC.md §22,
 * docs/AGENTS.md §25).
 */
export async function insertEvidence(
  db: Db,
  input: InsertEvidenceInput,
): Promise<EvidenceRow | null> {
  const row = await queryRow<EvidenceRow>(
    db,
    `INSERT INTO "evidence"
       ("userId", "challengeId", "skillId", "title", "description", "result", "status")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ("userId", "challengeId", "skillId") DO NOTHING
     RETURNING *`,
    [
      input.userId,
      input.challengeId,
      input.skillId,
      input.title,
      input.description,
      input.result,
      input.status,
    ],
  );
  return row;
}

export async function listEvidenceForUser(
  db: Db | undefined,
  userId: string,
): Promise<EvidenceWithSkill[]> {
  return queryText<EvidenceWithSkill>(
    db ?? getPool(),
    `SELECT e.*, s."name" AS "skillName"
     FROM "evidence" e
     LEFT JOIN "skills" s ON s."id" = e."skillId"
     WHERE e."userId" = $1
     ORDER BY e."createdAt" DESC`,
    [userId],
  );
}

/**
 * Loads an evidence row only when it belongs to the given user. Ownership is
 * enforced in the query to prevent IDOR (docs/SECURITY_SPEC.md §14).
 */
export async function findOwnedEvidence(
  db: Db | undefined,
  id: string,
  userId: string,
): Promise<EvidenceWithSkill | null> {
  return queryRow<EvidenceWithSkill>(
    db ?? getPool(),
    `SELECT e.*, s."name" AS "skillName"
     FROM "evidence" e
     LEFT JOIN "skills" s ON s."id" = e."skillId"
     WHERE e."id" = $1 AND e."userId" = $2`,
    [id, userId],
  );
}