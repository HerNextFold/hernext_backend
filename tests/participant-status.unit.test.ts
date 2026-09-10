import { describe, expect, it } from 'vitest';
import {
  BEHIND_ATTENTION_POINTS,
  BEHIND_RISK_POINTS,
  INACTIVITY_ATTENTION_DAYS,
  INACTIVITY_RISK_DAYS,
  calculateExpectedProgress,
  determineParticipantStatus,
  hasRecentActivity,
} from '../src/lib/scoring/participant-status.js';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(count: number): Date {
  return new Date(NOW.getTime() - count * DAY_MS);
}

function future(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

describe('calculateExpectedProgress', () => {
  it('returns null when either timeline date is missing', () => {
    expect(calculateExpectedProgress({ startDate: null, endDate: null, now: NOW })).toBeNull();
    expect(calculateExpectedProgress({ startDate: new Date('2026-01-01'), endDate: null, now: NOW })).toBeNull();
    expect(calculateExpectedProgress({ startDate: null, endDate: new Date('2026-12-31'), now: NOW })).toBeNull();
  });

  it('returns null when the timeline is invalid (end not after start)', () => {
    expect(calculateExpectedProgress({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-08-01'),
      now: NOW,
    })).toBeNull();
    expect(calculateExpectedProgress({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
      now: NOW,
    })).toBeNull();
  });

  it('returns 0 before the program starts', () => {
    expect(calculateExpectedProgress({
      startDate: future(5),
      endDate: future(95),
      now: NOW,
    })).toBe(0);
  });

  it('returns 100 after the program ends', () => {
    expect(calculateExpectedProgress({
      startDate: daysAgo(200),
      endDate: daysAgo(100),
      now: NOW,
    })).toBe(100);
  });

  it('returns the elapsed/total percentage at the midpoint', () => {
    const result = calculateExpectedProgress({
      startDate: daysAgo(45),
      endDate: future(45),
      now: NOW,
    });
    expect(result).toBe(50);
  });

  it('clamps and rounds unusual splits to whole numbers', () => {
    const result = calculateExpectedProgress({
      startDate: daysAgo(10),
      endDate: future(90),
      now: NOW,
    });
    expect(result).toBe(10);
  });
});

describe('hasRecentActivity', () => {
  it('is false with no activity record', () => {
    expect(hasRecentActivity(null, NOW)).toBe(false);
  });

  it('is true within 14 days and false at or beyond 14 days', () => {
    expect(hasRecentActivity(daysAgo(0), NOW)).toBe(true);
    expect(hasRecentActivity(daysAgo(13), NOW)).toBe(true);
    expect(hasRecentActivity(daysAgo(14), NOW)).toBe(false);
    expect(hasRecentActivity(daysAgo(40), NOW)).toBe(false);
  });
});

describe('determineParticipantStatus', () => {
  it('marks a recently active participant with aligned progress ON_TRACK', () => {
    expect(determineParticipantStatus({
      lastActivityAt: daysAgo(2),
      expectedProgress: 50,
      roadmapProgress: 45,
      now: NOW,
    })).toBe('ON_TRACK');
  });

  it('marks recently active but significantly behind participants AT_RISK', () => {
    expect(determineParticipantStatus({
      lastActivityAt: daysAgo(1),
      expectedProgress: 50,
      roadmapProgress: 50 - BEHIND_RISK_POINTS - 1,
      now: NOW,
    })).toBe('AT_RISK');
  });

  it('marks moderately behind participants NEEDS_ATTENTION', () => {
    expect(determineParticipantStatus({
      lastActivityAt: daysAgo(1),
      expectedProgress: 50,
      roadmapProgress: 50 - BEHIND_ATTENTION_POINTS - 5,
      now: NOW,
    })).toBe('NEEDS_ATTENTION');
  });

  it('requires recent activity even when progress is aligned', () => {
    expect(determineParticipantStatus({
      lastActivityAt: daysAgo(INACTIVITY_ATTENTION_DAYS),
      expectedProgress: 50,
      roadmapProgress: 55,
      now: NOW,
    })).toBe('NEEDS_ATTENTION');
  });

  it('marks 30+ days inactive participants AT_RISK regardless of progress', () => {
    expect(determineParticipantStatus({
      lastActivityAt: daysAgo(INACTIVITY_RISK_DAYS),
      expectedProgress: 50,
      roadmapProgress: 60,
      now: NOW,
    })).toBe('AT_RISK');
  });

  it('uses activity-only rules when no timeline exists', () => {
    const recent = determineParticipantStatus({
      lastActivityAt: daysAgo(3),
      expectedProgress: null,
      roadmapProgress: 0,
      now: NOW,
    });
    expect(recent).toBe('ON_TRACK');

    const moderateInactivity = determineParticipantStatus({
      lastActivityAt: daysAgo(20),
      expectedProgress: null,
      roadmapProgress: 80,
      now: NOW,
    });
    expect(moderateInactivity).toBe('NEEDS_ATTENTION');
  });

  it('treats a participant with no activity record as NEEDS_ATTENTION', () => {
    expect(determineParticipantStatus({
      lastActivityAt: null,
      expectedProgress: null,
      roadmapProgress: 0,
      now: NOW,
    })).toBe('NEEDS_ATTENTION');
  });

  it('clamps an out-of-range roadmap progress input', () => {
    expect(determineParticipantStatus({
      lastActivityAt: daysAgo(1),
      expectedProgress: 50,
      roadmapProgress: 130,
      now: NOW,
    })).toBe('ON_TRACK');
  });
});