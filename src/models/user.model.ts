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
  isActive: boolean;
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
      `INSERT INTO "users" ("email", "passwordHash", "firstName", "lastName", "role", "country")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.email, input.passwordHash, input.firstName, input.lastName, input.role, input.country],
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