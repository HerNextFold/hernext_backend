/**
 * Career Match Score (docs/SCORING_LOGIC.md §8–§16).
 *
 * The backend calculates the match between a participant's profile and an
 * approved HerNext career. The AI may explain the recommendation but never
 * invents the score.
 */

import { roundScore } from './ai-impact.js';

export const CAREER_MATCH_WEIGHTS = {
  skill: 0.45,
  experience: 0.25,
  interest: 0.15,
  aiReadiness: 0.15,
} as const;

/** Weights for career-skill importance within a career (docs/SCORING_LOGIC.md §9). */
export const SKILL_IMPORTANCE_WEIGHTS = {
  REQUIRED: 3,
  IMPORTANT: 2,
  NICE_TO_HAVE: 1,
} as const;

export type SkillImportance = keyof typeof SKILL_IMPORTANCE_WEIGHTS;
export type CareerInterestScore = 0 | 40 | 70 | 100;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Skill Match = matched career-skill weight / total career-skill weight × 100.
 * A skill counts as matched when the user possesses a corresponding UserSkill.
 */
export function calculateSkillMatchScore(input: {
  careerSkills: Array<{ skillId: string; importance: SkillImportance }>;
  userSkillIds: ReadonlySet<string>;
}): number {
  if (input.careerSkills.length === 0) {
    return 0;
  }
  const totalWeight = input.careerSkills.reduce(
    (sum, cs) => sum + SKILL_IMPORTANCE_WEIGHTS[cs.importance],
    0,
  );
  const matchedWeight = input.careerSkills.reduce((sum, cs) => {
    if (!input.userSkillIds.has(cs.skillId)) {
      return sum;
    }
    return sum + SKILL_IMPORTANCE_WEIGHTS[cs.importance];
  }, 0);
  return roundScore(clamp((matchedWeight / totalWeight) * 100));
}

/**
 * Experience Match (docs/SCORING_LOGIC.md §11).
 *
 * MVP: 50% from relevant experience presence, 50% from relevant duration.
 * `relevantExperience` is a boolean provided by the caller via structured
 * career/industry metadata or skill overlap. When the data is unavailable the
 * caller should pass `false` rather than inventing precision.
 */
export function calculateExperienceMatchScore(input: {
  hasRelevantExperience: boolean;
  relevantYears: number;
}): number {
  const presence = input.hasRelevantExperience ? 50 : 0;
  const duration = clamp(Math.min(input.relevantYears / 4, 1) * 50);
  return roundScore(clamp(presence + duration));
}

/**
 * Career Interest Score (docs/SCORING_LOGIC.md §12).
 *
 * 100 = direct match, 70 = closely related, 40 = somewhat related, 0 = none.
 */
export function calculateCareerInterestScore(score: CareerInterestScore): number {
  return roundScore(clamp(score));
}

/**
 * AI Readiness Score (docs/SCORING_LOGIC.md §13, §27).
 *
 * MVP: average of the relevant digital/AI skill coverage and AI roadmap
 * completion. Each component is normalized to 0–100. When no data exists, the
 * fallback is the available skill component (never an invented value).
 */
export function calculateAiReadinessScore(input: {
  relevantSkillCoverage: number; // 0–100
  aiRoadmapCompletion: number | undefined; // 0–100, undefined when no AI tasks
}): number {
  const skillComponent = clamp(input.relevantSkillCoverage);
  if (input.aiRoadmapCompletion === undefined) {
    return roundScore(skillComponent);
  }
  const roadmapComponent = clamp(input.aiRoadmapCompletion);
  return roundScore(clamp((skillComponent + roadmapComponent) / 2));
}

/** Final career match (docs/SCORING_LOGIC.md §14). */
export function calculateCareerMatchScore(input: {
  skillMatch: number;
  experienceMatch: number;
  careerInterest: number;
  aiReadiness: number;
}): number {
  const raw =
    clamp(input.skillMatch) * CAREER_MATCH_WEIGHTS.skill +
    clamp(input.experienceMatch) * CAREER_MATCH_WEIGHTS.experience +
    clamp(input.careerInterest) * CAREER_MATCH_WEIGHTS.interest +
    clamp(input.aiReadiness) * CAREER_MATCH_WEIGHTS.aiReadiness;
  return roundScore(clamp(raw));
}

export function matchLabel(score: number): 'Strong Match' | 'Good Match' | 'Emerging Match' | 'Low Match' {
  const clamped = clamp(score);
  if (clamped >= 80) return 'Strong Match';
  if (clamped >= 60) return 'Good Match';
  if (clamped >= 40) return 'Emerging Match';
  return 'Low Match';
}
