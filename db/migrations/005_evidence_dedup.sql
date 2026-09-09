-- Evidence de-duplication for challenge-derived evidence
-- (docs/DATABASE_SCHEMA.md §20, docs/AGENTS.md §25, docs/PRODUCT_SPEC.md §22).
--
-- A passed challenge may be submitted repeatedly; each pass creates evidence,
-- but a user must never end up with duplicate rows for the same
-- (challenge, skill) pair. The unique constraint makes evidence creation
-- idempotent and deterministic - ON CONFLICT DO NOTHING in the persistence
-- layer prevents duplicate 'challenge → skill' evidence on re-processing.

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_user_challenge_skill_unique"
  UNIQUE ("userId", "challengeId", "skillId");