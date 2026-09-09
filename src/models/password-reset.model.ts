import { queryRow, queryText, type Db } from '../lib/db.js';

export interface PasswordResetTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Stores a hashed, short-lived password-reset token. Raw tokens must never be
 * persisted (docs/SECURITY_SPEC.md §46).
 */
export async function insertPasswordResetToken(
  db: Db,
  input: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<PasswordResetTokenRow> {
  const row = await queryRow<PasswordResetTokenRow>(
    db,
    `INSERT INTO "password_reset_tokens" ("userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.userId, input.tokenHash, input.expiresAt],
  );
  if (row === null) {
    throw new Error('insertPasswordResetToken returned no row');
  }
  return row;
}

/**
 * Atomically consumes an unused, unexpired reset token (single-use guarantee).
 * Returns the owning userId, or null when the token is unknown, already used,
 * or expired. Racing requests cannot both consume the same token.
 */
export async function consumePasswordResetToken(
  db: Db,
  tokenHash: string,
): Promise<{ userId: string } | null> {
  return queryRow<{ userId: string }>(
    db,
    `UPDATE "password_reset_tokens"
     SET "usedAt" = now()
     WHERE "tokenHash" = $1
       AND "usedAt" IS NULL
       AND "expiresAt" > now()
     RETURNING "userId"`,
    [tokenHash],
  );
}

/** Removes a user's reset tokens (used, expired or pending) after a reset. */
export async function deleteUserPasswordResetTokens(db: Db, userId: string): Promise<void> {
  await queryText(db, 'DELETE FROM "password_reset_tokens" WHERE "userId" = $1', [userId]);
}