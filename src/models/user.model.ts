import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import type { UserRole } from '../common/types/auth.js';
import { getPool, queryRow, queryText, type Db } from '../lib/db.js';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  country: string;
  state: string | null;
  isActive: boolean;
  emailVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantProfileRow {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  country: string;
  state?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

/** Inserts a user, mapping a duplicate-email unique violation to a 409. */
export async function insertUser(db: Db, input: CreateUserInput): Promise<UserRow> {
  try {
    const row = await queryRow<UserRow>(
      db,
      `INSERT INTO "users" ("email", "passwordHash", "firstName", "lastName", "role", "country", "state")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.email,
        input.passwordHash,
        input.firstName,
        input.lastName,
        input.role,
        input.country,
        input.state ?? null,
      ],
    );
    if (row === null) {
      throw new Error('insertUser returned no row');
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        errorCodes.RESOURCE_ALREADY_EXISTS,
        'An account with this email already exists.',
        409,
      );
    }
    throw error;
  }
}

export async function findUserByEmail(db: Db | undefined, email: string): Promise<UserRow | null> {
  return queryRow<UserRow>(db ?? getPool(), 'SELECT * FROM "users" WHERE "email" = $1', [email]);
}

export async function findUserById(db: Db | undefined, id: string): Promise<UserRow | null> {
  return queryRow<UserRow>(db ?? getPool(), 'SELECT * FROM "users" WHERE "id" = $1', [id]);
}

export async function updateUserPasswordHash(
  db: Db,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await queryText(db, 'UPDATE "users" SET "passwordHash" = $1, "updatedAt" = now() WHERE "id" = $2', [
    passwordHash,
    userId,
  ]);
}

/** Marks a user's email as verified. Called only after a valid OTP proof. */
export async function markUserVerified(db: Db, userId: string): Promise<void> {
  await queryText(
    db,
    'UPDATE "users" SET "emailVerified" = true, "verifiedAt" = now(), "updatedAt" = now() WHERE "id" = $1',
    [userId],
  );
}

export interface UpdateUserLocationInput {
  country?: string;
  state?: string | null;
}

/**
 * Partially updates the user's own location. Omitted fields are left untouched,
 * while an explicit `state: null` clears it, so the caller stays in control of
 * whether a country change also clears the state.
 */
export async function updateUserLocation(
  db: Db,
  userId: string,
  input: UpdateUserLocationInput,
): Promise<UserRow | null> {
  return queryRow<UserRow>(
    db,
    `UPDATE "users"
     SET "country" = CASE WHEN $2::boolean THEN $3 ELSE "country" END,
         "state" = CASE WHEN $4::boolean THEN $5 ELSE "state" END,
         "updatedAt" = now()
     WHERE "id" = $1
     RETURNING *`,
    [
      userId,
      input.country !== undefined,
      input.country ?? null,
      input.state !== undefined,
      input.state ?? null,
    ],
  );
}

export async function findParticipantProfileByUserId(
  db: Db | undefined,
  userId: string,
): Promise<ParticipantProfileRow | null> {
  return queryRow<ParticipantProfileRow>(
    db ?? getPool(),
    'SELECT * FROM "participant_profiles" WHERE "userId" = $1',
    [userId],
  );
}

/** Creates the ParticipantProfile required for every participant account. */
export async function insertParticipantProfile(db: Db, userId: string): Promise<ParticipantProfileRow> {
  const row = await queryRow<ParticipantProfileRow>(
    db,
    'INSERT INTO "participant_profiles" ("userId") VALUES ($1) RETURNING *',
    [userId],
  );
  if (row === null) {
    throw new Error('insertParticipantProfile returned no row');
  }
  return row;
}

export async function deleteUserByEmail(db: Db | undefined, email: string): Promise<void> {
  await queryText(db ?? getPool(), 'DELETE FROM "users" WHERE "email" = $1', [email]);
}