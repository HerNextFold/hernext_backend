import { getPool, queryRow, type Db } from '../lib/db.js';

export interface PassportRow {
  id: string;
  userId: string;
  slug: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPassportInput {
  userId: string;
  slug: string;
  isPublic: boolean;
}

/**
 * Creates the participant's passport or updates its visibility. The user has
 * exactly one passport (UNIQUE "userId"); an existing slug is kept stable so a
 * shared link never breaks when the passport is regenerated
 * (docs/DATABASE_SCHEMA.md §23, docs/SECURITY_SPEC.md §37).
 */
export async function upsertPassport(db: Db, input: UpsertPassportInput): Promise<PassportRow> {
  const row = await queryRow<PassportRow>(
    db,
    `INSERT INTO "career_passports" ("userId", "slug", "isPublic")
     VALUES ($1, $2, $3)
     ON CONFLICT ("userId") DO UPDATE SET
       "isPublic" = EXCLUDED."isPublic",
       "updatedAt" = now()
     RETURNING *`,
    [input.userId, input.slug, input.isPublic],
  );
  if (row === null) {
    throw new Error('upsertPassport returned no row');
  }
  return row;
}

export async function findPassportByUserId(
  db: Db | undefined,
  userId: string,
): Promise<PassportRow | null> {
  return queryRow<PassportRow>(
    db ?? getPool(),
    'SELECT * FROM "career_passports" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
}

export async function findPassportBySlug(
  db: Db | undefined,
  slug: string,
): Promise<PassportRow | null> {
  return queryRow<PassportRow>(db ?? getPool(), 'SELECT * FROM "career_passports" WHERE "slug" = $1', [slug]);
}