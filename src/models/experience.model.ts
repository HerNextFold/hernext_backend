import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

export type EmploymentType =
  | 'EMPLOYED'
  | 'SELF_EMPLOYED'
  | 'FREELANCER'
  | 'STUDENT'
  | 'UNEMPLOYED'
  | 'INFORMAL_WORKER';

export interface ExperienceRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  organization: string | null;
  years: number | null;
  employmentType: EmploymentType;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExperienceInput {
  userId: string;
  title: string;
  description: string;
  organization?: string | null;
  years?: number | null;
  employmentType: EmploymentType;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface UpdateExperienceInput {
  title?: string;
  description?: string;
  organization?: string | null;
  years?: number | null;
  employmentType?: EmploymentType;
  startDate?: Date | null;
  endDate?: Date | null;
}

export async function insertExperience(db: Db, input: CreateExperienceInput): Promise<ExperienceRow> {
  const row = await queryRow<ExperienceRow>(
    db,
    `INSERT INTO "experiences"
       ("userId", "title", "description", "organization", "years", "employmentType", "startDate", "endDate")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.userId,
      input.title,
      input.description,
      input.organization ?? null,
      input.years ?? null,
      input.employmentType,
      input.startDate ?? null,
      input.endDate ?? null,
    ],
  );
  if (row === null) {
    throw new Error('insertExperience returned no row');
  }
  return row;
}

export async function listExperiences(db: Db | undefined, userId: string): Promise<ExperienceRow[]> {
  return queryText<ExperienceRow>(
    db ?? getPool(),
    'SELECT * FROM "experiences" WHERE "userId" = $1 ORDER BY "startDate" DESC NULLS LAST, "createdAt" DESC',
    [userId],
  );
}

/**
 * Loads an experience only if it belongs to the given user. Returns null when
 * the experience does not exist or is owned by another user (ownership is
 * enforced in the query to prevent IDOR - docs/SECURITY_SPEC.md §14).
 */
export async function findOwnedExperience(
  db: Db | undefined,
  id: string,
  userId: string,
): Promise<ExperienceRow | null> {
  return queryRow<ExperienceRow>(
    db ?? getPool(),
    'SELECT * FROM "experiences" WHERE "id" = $1 AND "userId" = $2',
    [id, userId],
  );
}

const UPDATE_FIELDS = {
  title: { column: '"title"', toValue: (v: string) => v },
  description: { column: '"description"', toValue: (v: string) => v },
  organization: { column: '"organization"', toValue: (v: string | null) => v },
  years: { column: '"years"', toValue: (v: number | null) => v },
  employmentType: { column: '"employmentType"', toValue: (v: EmploymentType) => v },
  startDate: { column: '"startDate"', toValue: (v: Date | null) => v },
  endDate: { column: '"endDate"', toValue: (v: Date | null) => v },
} as const;

export async function updateExperience(
  db: Db,
  id: string,
  userId: string,
  input: UpdateExperienceInput,
): Promise<ExperienceRow | null> {
  const entries = Object.entries(input).filter(
    (entry): entry is [string, string | number | Date | EmploymentType | null] =>
      entry[1] !== undefined,
  );
  if (entries.length === 0) {
    return queryRow<ExperienceRow>(
      db,
      'SELECT * FROM "experiences" WHERE "id" = $1 AND "userId" = $2',
      [id, userId],
    );
  }

  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const [key, value] of entries) {
    if (!(key in UPDATE_FIELDS)) continue;
    const field = UPDATE_FIELDS[key as keyof typeof UPDATE_FIELDS];
    params.push(field.toValue(value as never));
    sets.push(`${field.column} = $${params.length}`);
  }
  sets.push('"updatedAt" = now()');

  const row = await queryRow<ExperienceRow>(
    db,
    `UPDATE "experiences" SET ${sets.join(', ')} WHERE "id" = $1 AND "userId" = $2 RETURNING *`,
    params,
  );
  return row;
}

/**
 * Deletes an experience only if it belongs to the user. Returns true when a
 * row was deleted, false when the experience is missing or not owned.
 */
export async function deleteExperience(
  db: Db | undefined,
  id: string,
  userId: string,
): Promise<boolean> {
  const rows = await queryText<{ deleted: number }>(
    db ?? getPool(),
    'DELETE FROM "experiences" WHERE "id" = $1 AND "userId" = $2 RETURNING 1 AS deleted',
    [id, userId],
  );
  return rows.length > 0;
}

/** Throws a 404 when the experience is missing or not owned by the user. */
export function assertExperienceOwned(experience: ExperienceRow | null, _id: string): ExperienceRow {
  if (experience === null) {
    throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Experience not found', 404);
  }
  return experience;
}
