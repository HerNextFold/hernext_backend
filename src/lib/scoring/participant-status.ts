/**
 * Organization participant status (docs/SCORING_LOGIC.md §36–§41).
 *
 * Organization dashboards classify participants deterministically:
 *
 *   ON_TRACK          recently active AND roadmap progress aligned with expected
 *   NEEDS_ATTENTION   behind expected progress OR moderately inactive
 *   AT_RISK           significantly behind expected progress OR 30+ days inactive
 *
 * The backend owns this classification. No LLM is involved and the frontend
 * never submits a status. The clock (`now`) is injectable so tests can freeze
 * time and assert stable, deterministic outcomes.
 */

import { roundScore } from './ai-impact.js';

export type ParticipantStatus = 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK';

export const PARTICIPANT_STATUSES: readonly ParticipantStatus[] = [
  'ON_TRACK',
  'NEEDS_ATTENTION',
  'AT_RISK',
];

/** "Meaningful activity within N days" counts as active (docs/SCORING_LOGIC.md §44). */
export const ACTIVE_WINDOW_DAYS = 14;
/** Moderate inactivity window (docs/SCORING_LOGIC.md §38). */
export const INACTIVITY_ATTENTION_DAYS = 15;
/** No meaningful activity for this many days (docs/SCORING_LOGIC.md §39). */
export const INACTIVITY_RISK_DAYS = 30;
/** Progress is behind expected by more than this many points (docs/SCORING_LOGIC.md §41). */
export const BEHIND_ATTENTION_POINTS = 10;
/** Progress is significantly behind expected by more than this many points (docs/SCORING_LOGIC.md §41). */
export const BEHIND_RISK_POINTS = 25;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Expected roadmap progress (%) based on the program timeline
 * (docs/SCORING_LOGIC.md §40):
 *
 *   elapsed / total × 100
 *
 * Returns null when the timeline is missing or invalid (no start/end date, or
 * an end date not after the start date), in which case progress alignment
 * cannot be judged and status falls back to activity alone.
 */
export function calculateExpectedProgress(input: {
  startDate: Date | null;
  endDate: Date | null;
  now: Date;
}): number | null {
  const { startDate, endDate, now } = input;
  if (startDate === null || endDate === null) {
    return null;
  }
  const totalMs = endDate.getTime() - startDate.getTime();
  if (totalMs <= 0) {
    return null;
  }
  const elapsedMs = now.getTime() - startDate.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }
  if (elapsedMs >= totalMs) {
    return 100;
  }
  return roundScore(clamp((elapsedMs / totalMs) * 100));
}

function daysSince(timestamp: Date | null, now: Date): number | null {
  if (timestamp === null) {
    return null;
  }
  return Math.floor((now.getTime() - timestamp.getTime()) / MS_PER_DAY);
}

/** True when meaningful activity exists within the last 14 days (docs/SCORING_LOGIC.md §44). */
export function hasRecentActivity(lastActivityAt: Date | null, now: Date): boolean {
  if (lastActivityAt === null) {
    return false;
  }
  const days = daysSince(lastActivityAt, now);
  return days !== null && days < ACTIVE_WINDOW_DAYS;
}

/**
 * Deterministically classifies a participant (docs/SCORING_LOGIC.md §36–§41).
 *
 * Precedence:
 *   1. significantly behind expected progress          → AT_RISK
 *   2. moderately behind expected progress             → NEEDS_ATTENTION
 *   3. 30+ days without meaningful activity            → AT_RISK
 *   4. 15–29 days without meaningful activity          → NEEDS_ATTENTION
 *   5. no activity record at all                       → NEEDS_ATTENTION
 *   6. otherwise                                       → ON_TRACK
 */
export function determineParticipantStatus(input: {
  lastActivityAt: Date | null;
  expectedProgress: number | null;
  roadmapProgress: number;
  now: Date;
}): ParticipantStatus {
  const { lastActivityAt, expectedProgress, now } = input;
  const roadmapProgress = clamp(input.roadmapProgress);

  if (expectedProgress !== null) {
    const deficit = expectedProgress - roadmapProgress;
    if (deficit > BEHIND_RISK_POINTS) {
      return 'AT_RISK';
    }
    if (deficit > BEHIND_ATTENTION_POINTS) {
      return 'NEEDS_ATTENTION';
    }
  }

  const inactiveDays = daysSince(lastActivityAt, now);
  if (inactiveDays !== null && inactiveDays >= INACTIVITY_RISK_DAYS) {
    return 'AT_RISK';
  }
  if (inactiveDays !== null && inactiveDays >= INACTIVITY_ATTENTION_DAYS) {
    return 'NEEDS_ATTENTION';
  }
  if (inactiveDays === null) {
    return 'NEEDS_ATTENTION';
  }

  return 'ON_TRACK';
}