/**
 * Progress calculations (docs/SCORING_LOGIC.md §19–§22, §31).
 *
 * All progress values are derived from persisted source records. The backend
 * never trusts frontend-supplied percentages. Every function handles empty data
 * safely (returning 0 rather than dividing by zero or inventing progress).
 */

import { roundScore } from './ai-impact.js';

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Completed Tasks / Total Tasks × 100 (docs/SCORING_LOGIC.md §19). */
export function calculateRoadmapProgress(input: { completedTasks: number; totalTasks: number }): number {
  if (input.totalTasks <= 0) {
    return 0;
  }
  return roundScore(clamp((input.completedTasks / input.totalTasks) * 100));
}

/** Per-phase completion (docs/SCORING_LOGIC.md §20). 0 when a phase has no tasks. */
export function calculatePhaseProgress(input: { completedTasks: number; totalTasks: number }): number {
  return calculateRoadmapProgress(input);
}

/**
 * Passed Challenges / Available Challenges × 100 (docs/SCORING_LOGIC.md §21).
 * With no available challenges the score is 0 - never 100 - so the system does
 * not claim progress when no activity exists.
 */
export function calculateChallengeProgress(input: {
  passedChallenges: number;
  availableChallenges: number;
}): number {
  if (input.availableChallenges <= 0) {
    return 0;
  }
  return roundScore(clamp((input.passedChallenges / input.availableChallenges) * 100));
}

/** Overall journey completion (docs/SCORING_LOGIC.md §31) - equal-weighted stages. */
export function calculateOverallProgress(input: {
  completedStages: number;
  totalStages: number;
}): number {
  if (input.totalStages <= 0) {
    return 0;
  }
  return roundScore(clamp((input.completedStages / input.totalStages) * 100));
}