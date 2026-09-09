-- HerNext alignment migration (Phase 5A)
-- 1. Closes drift between the applied migrations and deployed Neon schemas by
--    enforcing the uniqueness constraints the seed relies on.
-- 2. Enforces the documented 1:1 relationship between ParticipantProfile and
--    CareerProfile so PUT /profile can upsert safely (DATABASE_SCHEMA.md §5).

-- achievements.name is declared UNIQUE in 001_init.sql; databases created
-- before that migration may be missing the constraint. Add it when absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'achievements_name_key' AND conrelid = 'achievements'::regclass
  ) THEN
    -- Keep the single earliest row when a pre-constraint database accumulated
    -- duplicates; matching rows are keyed by name during seeding.
    DELETE FROM "achievements" a
    USING "achievements" b
    WHERE a."name" = b."name" AND a."id" > b."id";
    ALTER TABLE "achievements" ADD CONSTRAINT "achievements_name_key" UNIQUE ("name");
  END IF;
END
$$;

-- challenges.title is the natural key used by the seed; enforce uniqueness.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'challenges_title_key' AND conrelid = 'challenges'::regclass
  ) THEN
    DELETE FROM "challenges" a
    USING "challenges" b
    WHERE a."title" = b."title" AND a."id" > b."id";
    ALTER TABLE "challenges" ADD CONSTRAINT "challenges_title_key" UNIQUE ("title");
  END IF;
END
$$;

-- Exactly one career profile per participant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'career_profiles_participantProfileId_key' AND conrelid = 'career_profiles'::regclass
  ) THEN
    DELETE FROM "career_profiles" a
    USING "career_profiles" b
    WHERE a."participantProfileId" = b."participantProfileId" AND a."id" > b."id";
    ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_participantProfileId_key" UNIQUE ("participantProfileId");
  END IF;
END
$$;