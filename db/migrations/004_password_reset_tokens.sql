-- 004_password_reset_tokens.sql
-- Password-reset token storage (docs/SECURITY_SPEC.md §46).
-- Tokens are stored hashed (SHA-256), expire, are single-use, and are
-- invalidated after a successful reset. Compatible with both Neon and local
-- Postgres (gen_random_uuid() is available in pgcrypto / PG 13+'s core).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'password_reset_tokens') THEN
    CREATE TABLE "password_reset_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "tokenHash" text NOT NULL UNIQUE,
      "expiresAt" timestamptz NOT NULL,
      "usedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens" ("userId");
    CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens" ("expiresAt");
  END IF;
END
$$;