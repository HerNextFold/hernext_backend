-- 007_user_state_location.sql
-- Adds the optional state / province of a user alongside the already
-- required "users"."country" (docs/DATABASE_SCHEMA.md S"users").
--
-- The column is nullable with no default and requires no data backfill:
--   * existing users keep working and simply report "state": null;
--   * clients that omit state keep registering successfully;
--   * countries without an administrative subdivision list may leave it null.
-- Guarded exactly like 006_auth_otps_and_email_verification.sql so the
-- migration is safe to re-run against a partially migrated database.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'state'
  ) THEN
    ALTER TABLE "users"
      ADD COLUMN "state" text;
  END IF;
END
$$;
