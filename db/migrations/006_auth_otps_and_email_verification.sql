-- 006_auth_otps_and_email_verification.sql
-- Email verification + OTP storage (docs/SECURITY_SPEC.md §47, §48).
-- Accounts are UNVERIFIED until a matching EMAIL_VERIFICATION OTP is proven.
-- OTPs are stored only as SHA-256 hashes, carry an explicit purpose, expire,
-- are single-use, and respect a bounded attempt count. Compatible with Neon.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'emailVerified'
  ) THEN
    ALTER TABLE "users"
      ADD COLUMN "emailVerified" boolean NOT NULL DEFAULT false,
      ADD COLUMN "verifiedAt" timestamptz;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_otp_purpose') THEN
    CREATE TYPE "auth_otp_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'auth_otps') THEN
    CREATE TABLE "auth_otps" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "purpose" "auth_otp_purpose" NOT NULL,
      "codeHash" text NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
      "consumedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX "auth_otps_userId_purpose_idx" ON "auth_otps" ("userId", "purpose");
    CREATE INDEX "auth_otps_expiresAt_idx" ON "auth_otps" ("expiresAt");
  END IF;
END
$$;