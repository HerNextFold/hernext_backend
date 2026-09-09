/**
 * Deterministic challenge evaluation (docs/AI_SPEC.md §22).
 *
 * Challenge evaluation is backend-owned: correct/incorrect, score and pass/fail
 * are computed from fixed rules against the seeded challenge specs. The AI never
 * decides challenge outcomes; at most it could phrase feedback afterwards, and
 * for the MVP the feedback strings below are already human-readable, so no LLM
 * call is made.
 */

import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { CHALLENGE_SPECS, type ChallengeSpec } from './challenge-specs.js';

/**
 * Minimum score (out of 100) required for a challenge to be marked PASSED.
 * Shared across every challenge spec so pass/fail semantics stay consistent.
 */
export const CHALLENGE_PASS_THRESHOLD = 70;

export interface ChallengeEvaluationResult {
  score: number;
  passed: boolean;
  feedback: string;
}

export function findChallengeSpec(title: string): ChallengeSpec | null {
  return CHALLENGE_SPECS[title] ?? null;
}

/**
 * Evaluates a participant answer against the challenge's deterministic spec.
 * Throws RESOURCE_NOT_FOUND for challenges that have no evaluation rules, so a
 * challenge without a spec can never be passed (or failed) by accident.
 */
export function evaluateChallengeSubmission(
  challenge: { title: string },
  answer: unknown,
): ChallengeEvaluationResult {
  const spec = findChallengeSpec(challenge.title);
  if (spec === null) {
    throw new AppError(
      errorCodes.RESOURCE_NOT_FOUND,
      'This challenge does not support submissions yet.',
      404,
    );
  }

  const outcome = spec.evaluate(answer);
  const score = outcome.components.reduce((sum, component) => sum + component.points, 0);
  const clamped = Math.max(0, Math.min(100, score));

  return {
    score: clamped,
    passed: clamped >= CHALLENGE_PASS_THRESHOLD,
    feedback: outcome.feedback,
  };
}