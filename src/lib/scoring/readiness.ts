/**
 * Career Readiness Score (docs/SCORING_LOGIC.md §23–§30).
 *
 * Readiness is a backend-calculated score that summarises how prepared a
 * participant currently appears to be for their target career. The backend owns
 * every component; the AI may explain the result but never determines it.
 *
 * Weights (docs/SCORING_LOGIC.md §24):
 *   Experience   25%
 *   Skills       30%
 *   AI Readiness 20%
 *   Evidence     25%
 */

import { roundScore } from './ai-impact.js';
import { calculateSkillMatchScore, type SkillImportance } from './career-match.js';

export const READINESS_WEIGHTS = {
  experience: 0.25,
  skills: 0.3,
  aiReadiness: 0.2,
  evidence: 0.25,
} as const;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Experience Score (docs/SCORING_LOGIC.md §25).
 *
 * MVP ladder mapped from the documented 0/50/75/100 scale, driven by the
 * participant's years of experience (career profile + experience records):
 *
 *   >= 5 years            → 100 (substantial)
 *   >= 3 years            → 75  (strong)
 *   >= 1 year             → 50  (some transferable)
 *   records but 0 years   → 25  (context exists, duration unknown)
 *   no profile/experience → 0
 */
export function calculateExperienceScore(input: { relevantYears: number; hasAnyRecords: boolean }): number {
  if (!input.hasAnyRecords) {
    return 0;
  }
  if (input.relevantYears >= 5) return 100;
  if (input.relevantYears >= 3) return 75;
  if (input.relevantYears > 0) return 50;
  return 25;
}

/**
 * Evidence Score (docs/SCORING_LOGIC.md §28).
 *
 *   No evidence              → 0
 *   One valid evidence item  → 50
 *   Two or more evidence     → 75
 *   Strong verified coverage → 100
 *
 * "Strong verified coverage" means at least two evidence items and at least one
 * verified item.
 */
export function calculateEvidenceScore(input: {
  evidenceCount: number;
  verifiedEvidenceCount: number;
}): number {
  if (input.evidenceCount <= 0) {
    return 0;
  }
  if (input.evidenceCount === 1) {
    return 50;
  }
  if (input.evidenceCount >= 2 && input.verifiedEvidenceCount > 0) {
    return 100;
  }
  return 75;
}

/**
 * Skills Score (docs/SCORING_LOGIC.md §26).
 *
 * Reuses the weighted career-skill match formula (REQUIRED=3, IMPORTANT=2,
 * NICE_TO_HAVE=1) against the participant's target career. Without a target
 * career the score is 0: readiness must stay connected to an actual target.
 */
export function calculateReadinessSkillsScore(input: {
  careerSkills: Array<{ skillId: string; importance: SkillImportance }>;
  userSkillIds: ReadonlySet<string>;
}): number {
  if (input.careerSkills.length === 0) {
    return 0;
  }
  return calculateSkillMatchScore(input);
}

/** Final Readiness Score (docs/SCORING_LOGIC.md §29). */
export function calculateCareerReadinessScore(input: {
  experience: number;
  skills: number;
  aiReadiness: number;
  evidence: number;
}): number {
  const raw =
    clamp(input.experience) * READINESS_WEIGHTS.experience +
    clamp(input.skills) * READINESS_WEIGHTS.skills +
    clamp(input.aiReadiness) * READINESS_WEIGHTS.aiReadiness +
    clamp(input.evidence) * READINESS_WEIGHTS.evidence;
  return roundScore(clamp(raw));
}

export type ReadinessLabel = 'Opportunity Ready' | 'Developing' | 'Building Foundations' | 'Early Stage';

/** Readiness label (docs/SCORING_LOGIC.md §30). */
export function readinessLabel(score: number): ReadinessLabel {
  const clamped = clamp(score);
  if (clamped >= 80) return 'Opportunity Ready';
  if (clamped >= 60) return 'Developing';
  if (clamped >= 40) return 'Building Foundations';
  return 'Early Stage';
}