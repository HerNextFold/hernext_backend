-- HerNext initial schema (docs/DATABASE_SCHEMA.md)
-- Applied by db/migrate.ts through the schema_migrations ledger.

-- Enums --------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('PARTICIPANT', 'ORGANIZATION_ADMIN', 'ORGANIZATION_MEMBER');
CREATE TYPE employment_type AS ENUM ('EMPLOYED', 'SELF_EMPLOYED', 'FREELANCER', 'STUDENT', 'UNEMPLOYED', 'INFORMAL_WORKER');

-- SkillCategory values are not enumerated in DATABASE_SCHEMA.md; the values
-- below cover the initial MVP catalogue and can grow with the catalogue.
CREATE TYPE skill_category AS ENUM ('FINANCIAL', 'OPERATIONS', 'CUSTOMER_SERVICE', 'DATA_ANALYTICS', 'DIGITAL', 'SOFT_SKILLS');

CREATE TYPE skill_source AS ENUM ('SELF_REPORTED', 'AI_DERIVED', 'CHALLENGE', 'VERIFIED');
CREATE TYPE skill_importance AS ENUM ('REQUIRED', 'IMPORTANT', 'NICE_TO_HAVE');
CREATE TYPE impact_level AS ENUM ('LOW', 'MODERATE', 'HIGH');
CREATE TYPE skill_gap_status AS ENUM ('HAS_SKILL', 'NEEDS_DEVELOPMENT');
CREATE TYPE priority AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE roadmap_phase AS ENUM ('DAY_30', 'DAY_60', 'DAY_90');
CREATE TYPE task_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- ChallengeDifficulty values are not enumerated in DATABASE_SCHEMA.md; the
-- three levels below are the MVP difficulty scale.
CREATE TYPE challenge_difficulty AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

CREATE TYPE submission_status AS ENUM ('PENDING', 'PASSED', 'FAILED');
CREATE TYPE evidence_status AS ENUM ('PENDING', 'VERIFIED');
CREATE TYPE program_status AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE organization_role AS ENUM ('ADMIN', 'MEMBER');

-- Users --------------------------------------------------------------------

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "passwordHash" text NOT NULL,
  "firstName" text NOT NULL,
  "lastName" text NOT NULL,
  "role" user_role NOT NULL,
  "country" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "users_email_not_empty" CHECK (length(btrim("email")) > 0),
  CONSTRAINT "users_passwordHash_not_empty" CHECK (length(btrim("passwordHash")) > 0)
);

CREATE INDEX idx_users_email ON "users" ("email");

-- Participant profiles ------------------------------------------------------

CREATE TABLE "participant_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Careers / skills catalogue ------------------------------------------------

CREATE TABLE "career_paths" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL UNIQUE,
  "industry" text NOT NULL,
  "description" text NOT NULL,
  "level" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL UNIQUE,
  "category" skill_category NOT NULL,
  "description" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "career_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "careerPathId" uuid NOT NULL REFERENCES "career_paths"("id") ON DELETE CASCADE,
  "skillId" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "importance" skill_importance NOT NULL,
  CONSTRAINT "career_skills_unique" UNIQUE ("careerPathId", "skillId")
);

CREATE TABLE "achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL UNIQUE,
  "description" text NOT NULL,
  "criteria" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Career profiles / experiences ---------------------------------------------

CREATE TABLE "career_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantProfileId" uuid NOT NULL REFERENCES "participant_profiles"("id") ON DELETE CASCADE,
  "currentOccupation" text NOT NULL,
  "industry" text NOT NULL,
  "yearsOfExperience" double precision NOT NULL,
  "education" text,
  "employmentType" employment_type NOT NULL,
  "careerInterests" text[],
  "targetCareerId" uuid REFERENCES "career_paths"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_profiles_participantProfileId ON "career_profiles" ("participantProfileId");

CREATE TABLE "experiences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "organization" text,
  "years" double precision,
  "employmentType" employment_type NOT NULL,
  "startDate" timestamptz,
  "endDate" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_experiences_userId ON "experiences" ("userId");

-- Skills / analyses / recommendations ---------------------------------------

CREATE TABLE "user_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skillId" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "source" skill_source NOT NULL,
  "confidence" double precision NOT NULL DEFAULT 0 CHECK ("confidence" >= 0 AND "confidence" <= 1),
  "proficiency" double precision NOT NULL DEFAULT 0 CHECK ("proficiency" >= 0 AND "proficiency" <= 1),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_skills_userId ON "user_skills" ("userId");
CREATE INDEX idx_user_skills_skillId ON "user_skills" ("skillId");

CREATE TABLE "career_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "experienceId" uuid NOT NULL REFERENCES "experiences"("id") ON DELETE CASCADE,
  "aiImpactScore" integer NOT NULL CHECK ("aiImpactScore" >= 0 AND "aiImpactScore" <= 100),
  "impactLevel" impact_level NOT NULL,
  "automationTasks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "augmentedTasks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "humanStrengths" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "emergingSkills" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "explanation" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_analyses_userId ON "career_analyses" ("userId");

CREATE TABLE "transferable_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skillId" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "sourceExperienceId" uuid REFERENCES "experiences"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "confidence" double precision NOT NULL DEFAULT 0 CHECK ("confidence" >= 0 AND "confidence" <= 1),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transferable_skills_userId ON "transferable_skills" ("userId");
CREATE INDEX idx_transferable_skills_skillId ON "transferable_skills" ("skillId");

CREATE TABLE "career_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "careerPathId" uuid NOT NULL REFERENCES "career_paths"("id") ON DELETE CASCADE,
  "matchScore" integer NOT NULL CHECK ("matchScore" >= 0 AND "matchScore" <= 100),
  "reason" text NOT NULL,
  "rank" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_recommendations_userId ON "career_recommendations" ("userId");
CREATE INDEX idx_career_recommendations_careerPathId ON "career_recommendations" ("careerPathId");

CREATE TABLE "skill_gaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "careerPathId" uuid NOT NULL REFERENCES "career_paths"("id") ON DELETE CASCADE,
  "skillId" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "status" skill_gap_status NOT NULL,
  "priority" priority NOT NULL,
  "reason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_gaps_userId ON "skill_gaps" ("userId");
CREATE INDEX idx_skill_gaps_careerPathId ON "skill_gaps" ("careerPathId");

-- Roadmaps ------------------------------------------------------------------

CREATE TABLE "roadmaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "careerPathId" uuid NOT NULL REFERENCES "career_paths"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roadmaps_userId ON "roadmaps" ("userId");

CREATE TABLE "roadmap_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "roadmapId" uuid NOT NULL REFERENCES "roadmaps"("id") ON DELETE CASCADE,
  "phase" roadmap_phase NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "skillId" uuid REFERENCES "skills"("id") ON DELETE SET NULL,
  "estimatedMinutes" integer,
  "order" integer NOT NULL,
  "status" task_status NOT NULL DEFAULT 'NOT_STARTED',
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roadmap_tasks_roadmapId ON "roadmap_tasks" ("roadmapId");

-- Challenges / evidence ------------------------------------------------------

CREATE TABLE "challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text NOT NULL,
  "difficulty" challenge_difficulty NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "challenge_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challengeId" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
  "skillId" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  CONSTRAINT "challenge_skills_unique" UNIQUE ("challengeId", "skillId")
);

CREATE TABLE "challenge_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challengeId" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "answer" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "score" integer,
  "status" submission_status NOT NULL DEFAULT 'PENDING',
  "feedback" text,
  "submittedAt" timestamptz NOT NULL DEFAULT now(),
  "evaluatedAt" timestamptz
);

CREATE INDEX idx_challenge_submissions_userId ON "challenge_submissions" ("userId");
CREATE INDEX idx_challenge_submissions_challengeId ON "challenge_submissions" ("challengeId");

CREATE TABLE "evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "challengeId" uuid REFERENCES "challenges"("id") ON DELETE SET NULL,
  "skillId" uuid REFERENCES "skills"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "result" text NOT NULL,
  "status" evidence_status NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_userId ON "evidence" ("userId");

-- Achievements / passport ---------------------------------------------------

CREATE TABLE "user_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "achievementId" uuid NOT NULL REFERENCES "achievements"("id") ON DELETE CASCADE,
  "earnedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_achievements_unique" UNIQUE ("userId", "achievementId")
);

CREATE TABLE "career_passports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" text NOT NULL UNIQUE,
  "isPublic" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_passports_slug ON "career_passports" ("slug");

-- Organizations -------------------------------------------------------------

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text NOT NULL,
  "country" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "organization_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" organization_role NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "organization_members_unique" UNIQUE ("organizationId", "userId")
);

CREATE INDEX idx_organization_members_userId ON "organization_members" ("userId");
CREATE INDEX idx_organization_members_organizationId ON "organization_members" ("organizationId");

CREATE TABLE "programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "startDate" timestamptz,
  "endDate" timestamptz,
  "status" program_status NOT NULL DEFAULT 'DRAFT',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_programs_organizationId ON "programs" ("organizationId");

CREATE TABLE "program_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "programId" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joinedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "program_participants_unique" UNIQUE ("programId", "userId")
);

CREATE INDEX idx_program_participants_programId ON "program_participants" ("programId");
CREATE INDEX idx_program_participants_userId ON "program_participants" ("userId");

-- Auth sessions (persisted refresh-token/session strategy, when enabled) ----

CREATE TABLE "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz
);

CREATE INDEX idx_auth_sessions_userId ON "auth_sessions" ("userId");