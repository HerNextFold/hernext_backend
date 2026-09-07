/**
 * AI Impact Score (docs/SCORING_LOGIC.md §3–§6).
 *
 * The AI returns task-level classifications; the backend converts them into a
 * deterministic 0–100 score using the documented category weights. This score
 * is an assessment of task-level AI/automation exposure - never a prediction
 * of job loss, income loss, employability or career success.
 */

export const AI_IMPACT_WEIGHTS = {
  automation: 0.5,
  augmentation: 0.3,
  human: 0.2,
} as const;

const LEVEL_BOUNDARIES = [
  { max: 33, level: 'LOW' },
  { max: 66, level: 'MODERATE' },
  { max: 100, level: 'HIGH' },
] as const;

export type ImpactLevel = 'LOW' | 'MODERATE' | 'HIGH';

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Rounds to a whole number using Math.round (docs/SCORING_LOGIC.md §47). */
export function roundScore(value: number): number {
  return Math.round(value);
}

/**
 * Converts task-level analysis into a normalized AI impact score.
 *
 *   automationCount   - tasks exposed to automation
 *   augmentedCount    - tasks that AI can augment
 *   humanCount        - tasks that rely on human value
 *
 * The documented weights (docs/SCORING_LOGIC.md §5) are 50% automation,
 * 30% augmentation, 20% human-value. These weights form a weighted average of
 * the task mix. Because the weights sum to 1.0, a raw weighted average only
 * ever spans 0.20 (all human) to 0.50 (all automation). The MVP normalizes
 * that weighted average across the achievable range so the documented 0-100
 * scale and the 67-100 HIGH band are actually reachable:
 *
 *   score = (weightedAverage - 0.20) / (0.50 - 0.20) * 100
 *
 * This preserves the documented category weights (automation dominates,
 * human-value tasks lower exposure) while mapping the documented poles
 * (all-human = 0 = LOW, all-automation = 100 = HIGH) onto the 0-100 scale.
 */
export function calculateAiImpactScore(input: {
  automationCount: number;
  augmentedCount: number;
  humanCount: number;
}): number {
  const totalTasks = input.automationCount + input.augmentedCount + input.humanCount;

  // With no classified tasks, there is no evidence of either exposure or
  // human resilience, so we report the documented neutral/handled case as 0
  // rather than inventing a score (docs/SCORING_LOGIC.md §48).
  if (totalTasks === 0) {
    return 0;
  }

  const weightedAverage =
    (input.automationCount * AI_IMPACT_WEIGHTS.automation +
      input.augmentedCount * AI_IMPACT_WEIGHTS.augmentation +
      input.humanCount * AI_IMPACT_WEIGHTS.human) / totalTasks;

  const minWeighted = AI_IMPACT_WEIGHTS.human; // all tasks are human-value
  const maxWeighted = AI_IMPACT_WEIGHTS.automation; // all tasks are automated
  const raw = ((weightedAverage - minWeighted) / (maxWeighted - minWeighted)) * 100;

  return roundScore(clamp(raw));
}

/** Maps a 0–100 score to the documented impact level. */
export function impactLevelForScore(score: number): ImpactLevel {
  const clamped = clamp(roundScore(score));
  for (const boundary of LEVEL_BOUNDARIES) {
    if (clamped <= boundary.max) {
      return boundary.level;
    }
  }
  return 'HIGH';
}
