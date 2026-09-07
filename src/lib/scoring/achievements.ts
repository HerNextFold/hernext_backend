/**
 * Achievement/milestone rules (docs/SCORING_LOGIC.md §32–§33).
 *
 * Achievements are awarded automatically when their criteria become true. The
 * rules below are deterministic and keyed by the stable codes documented in
 * docs/DATABASE_SCHEMA.md §21. Awarding itself is idempotent (a user never
 * receives the same achievement twice) - enforced by the unique constraint on
 * the UserAchievement row plus ON CONFLICT in the persistence layer.
 */

export type AchievementCode =
  | 'PROFILE_COMPLETED'
  | 'ASSESSMENT_COMPLETED'
  | 'FIRST_SKILL_DISCOVERED'
  | 'FIRST_CHALLENGE_COMPLETED'
  | 'FIRST_EVIDENCE_CREATED'
  | '30_DAY_GOAL_COMPLETED'
  | 'ROADMAP_COMPLETED'
  | 'PASSPORT_READY';

export interface AchievementEvaluationState {
  hasCareerProfile: boolean;
  assessmentCount: number;
  userSkillCount: number;
  passedChallengeCount: number;
  evidenceCount: number;
  day30TotalTasks: number;
  day30CompletedTasks: number;
  roadmapTotalTasks: number;
  roadmapCompletedTasks: number;
  hasPassport: boolean;
}

const RULES: Record<AchievementCode, (state: AchievementEvaluationState) => boolean> = {
  PROFILE_COMPLETED: (s) => s.hasCareerProfile,
  ASSESSMENT_COMPLETED: (s) => s.assessmentCount >= 1,
  FIRST_SKILL_DISCOVERED: (s) => s.userSkillCount >= 1,
  FIRST_CHALLENGE_COMPLETED: (s) => s.passedChallengeCount >= 1,
  FIRST_EVIDENCE_CREATED: (s) => s.evidenceCount >= 1,
  '30_DAY_GOAL_COMPLETED': (s) => s.day30TotalTasks > 0 && s.day30CompletedTasks === s.day30TotalTasks,
  ROADMAP_COMPLETED: (s) => s.roadmapTotalTasks > 0 && s.roadmapCompletedTasks === s.roadmapTotalTasks,
  PASSPORT_READY: (s) => s.hasPassport,
};

/**
 * Returns the achievement codes whose criteria are satisfied.
 *
 * The passed `codes` come from the achievements catalogue rows (their stored
 * criteria.code). Unknown codes are never granted - unknown criteria cannot
 * silently award an achievement.
 */
export function evaluateAchievementCodes(input: {
  codes: readonly AchievementCode[];
  state: AchievementEvaluationState;
}): AchievementCode[] {
  const unique = [...new Set(input.codes)];
  return unique.filter((code) => RULES[code]?.(input.state) ?? false);
}