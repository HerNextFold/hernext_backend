import { queryRow, queryText, type Db } from '../lib/db.js';
import type { OtpPurpose } from '../modules/auth/otp.util.js';

export interface AuthOtpRow {
  id: string;
  userId: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
}

export interface InsertOtpInput {
  userId: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
}

export async function insertOtp(db: Db, input: InsertOtpInput): Promise<AuthOtpRow> {
  const row = await queryRow<AuthOtpRow>(
    db,
    `INSERT INTO "auth_otps" ("userId", "purpose", "codeHash", "expiresAt")
     VALUES ($1, $2::"auth_otp_purpose", $3, $4)
     RETURNING "id", "userId", "purpose", "codeHash", "expiresAt", "attempts", "consumedAt", "createdAt"`,
    [input.userId, input.purpose, input.codeHash, input.expiresAt],
  );
  if (row === null) {
    throw new Error('Failed to insert OTP.');
  }
  return row;
}

/** Marks every active OTP for a user+purpose as consumed (single-active rule). */
export async function invalidateActiveOtps(db: Db, userId: string, purpose: OtpPurpose): Promise<void> {
  await queryText(
    db,
    `UPDATE "auth_otps"
     SET "consumedAt" = now()
     WHERE "userId" = $1 AND "purpose" = $2::"auth_otp_purpose" AND "consumedAt" IS NULL`,
    [userId, purpose],
  );
}

/**
 * Locks and returns the newest active, unexpired OTP for a user+purpose.
 * Invoked inside a transaction so concurrent consumers cannot race the
 * single-use and max-attempt guarantees.
 */
export async function findActiveOtpForUpdate(
  db: Db,
  userId: string,
  purpose: OtpPurpose,
): Promise<AuthOtpRow | null> {
  return queryRow<AuthOtpRow>(
    db,
    `SELECT "id", "userId", "purpose", "codeHash", "expiresAt", "attempts", "consumedAt", "createdAt"
     FROM "auth_otps"
     WHERE "userId" = $1
       AND "purpose" = $2::"auth_otp_purpose"
       AND "consumedAt" IS NULL
       AND "expiresAt" > now()
     ORDER BY "createdAt" DESC
     LIMIT 1
     FOR UPDATE`,
    [userId, purpose],
  );
}

export async function incrementOtpAttempts(db: Db, id: string): Promise<void> {
  await queryText(db, 'UPDATE "auth_otps" SET "attempts" = "attempts" + 1 WHERE "id" = $1', [id]);
}

/** Consumes an OTP atomically; the caller that returns a row wins single-use. */
export async function consumeOtp(db: Db, id: string): Promise<boolean> {
  const row = await queryRow<{ id: string }>(
    db,
    `UPDATE "auth_otps" SET "consumedAt" = now() WHERE "id" = $1 AND "consumedAt" IS NULL RETURNING "id"`,
    [id],
  );
  return row !== null;
}

/** Marks a single OTP consumed (used when the attempt limit is exhausted). */
export async function invalidateOtpById(db: Db, id: string): Promise<void> {
  await queryText(db, 'UPDATE "auth_otps" SET "consumedAt" = now() WHERE "id" = $1', [id]);
}

/** Expiry for a freshly issued OTP. */
export function otpExpiresAt(now: Date, lifetimeMs: number): Date {
  return new Date(now.getTime() + lifetimeMs);
}