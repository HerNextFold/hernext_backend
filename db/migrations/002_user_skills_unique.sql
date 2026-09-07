-- Adds a unique constraint on user_skills(userId, skillId) so AI-derived skills
-- are stored once per participant. This enables idempotent upserts and prevents
-- duplicate UserSkill rows across repeated AI analyses (docs/SCORING_LOGIC.md §7).
CREATE UNIQUE INDEX idx_user_skills_user_skill_unique
  ON "user_skills" ("userId", "skillId");
