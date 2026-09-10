import { describe, expect, it } from 'vitest';
import { aggregateAnalytics } from '../src/modules/programs/program-monitoring.service.js';
import type { ParticipantMonitor } from '../src/modules/programs/program-monitor.js';

// These tests exercise the documented empty/missing-data rules for program
// analytics (docs/SCORING_LOGIC.md §42–§47): zero participants never divide by
// zero, and participants without a readiness score or roadmap do not count as
// implicit zeros in an average.

const NOW = new Date('2026-09-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function activity(daysAgo: number | null): Date | null {
  return daysAgo === null ? null : new Date(NOW.getTime() - daysAgo * DAY_MS);
}

function monitor(overrides: Partial<ParticipantMonitor>): ParticipantMonitor {
  return {
    id: 'user',
    name: 'Test User',
    joinedAt: activity(60) as Date,
    lastActivityAt: activity(2) as Date,
    status: 'ON_TRACK',
    currentCareerGoal: null,
    readinessScore: 0,
    readinessLabel: 'Early Stage',
    roadmapProgress: 0,
    hasRoadmap: false,
    challengeProgress: 0,
    assessmentCompleted: false,
    skillsDeveloped: 0,
    skillIds: [],
    evidenceCount: 0,
    hasPassport: false,
    challengesCompleted: 0,
    ...overrides,
  };
}

describe('aggregateAnalytics', () => {
  it('returns safe zeros for a program with no participants', () => {
    const result = aggregateAnalytics([], { now: NOW });
    expect(result).toEqual({
      totalParticipants: 0,
      activeParticipants: 0,
      assessmentCompletion: 0,
      averageReadiness: 0,
      averageRoadmapProgress: 0,
      challengesCompleted: 0,
      evidenceCreated: 0,
      passportsCreated: 0,
    });
  });

  it('counts active participants by meaningful activity within 14 days (docs/SCORING_LOGIC.md §44)', () => {
    const monitors = [
      monitor({ lastActivityAt: activity(3) as Date }),
      monitor({ lastActivityAt: activity(14) as Date }),
      monitor({ lastActivityAt: activity(40) as Date }),
      monitor({ lastActivityAt: activity(60) as Date }),
    ];
    const result = aggregateAnalytics(monitors, { now: NOW });
    expect(result.totalParticipants).toBe(4);
    expect(result.activeParticipants).toBe(1);
  });

  it('averages readiness only over participants with a completed assessment', () => {
    const monitors = [
      monitor({ assessmentCompleted: true, readinessScore: 80 }),
      monitor({ assessmentCompleted: true, readinessScore: 60 }),
      monitor({ assessmentCompleted: false, readinessScore: 0 }),
    ];
    const result = aggregateAnalytics(monitors, { now: NOW });
    expect(result.assessmentCompletion).toBe(67);
    expect(result.averageReadiness).toBe(70);
  });

  it('returns zero average readiness when nobody has a readiness score', () => {
    const result = aggregateAnalytics(
      [monitor({ assessmentCompleted: false }), monitor({ assessmentCompleted: false })],
      { now: NOW },
    );
    expect(result.averageReadiness).toBe(0);
  });

  it('averages roadmap progress only over participants with an active roadmap', () => {
    const monitors = [
      monitor({ hasRoadmap: true, roadmapProgress: 50 }),
      monitor({ hasRoadmap: true, roadmapProgress: 100 }),
      monitor({ hasRoadmap: false, roadmapProgress: 0 }),
    ];
    const result = aggregateAnalytics(monitors, { now: NOW });
    expect(result.averageRoadmapProgress).toBe(75);
  });

  it('returns zero average roadmap progress when nobody has a roadmap', () => {
    const result = aggregateAnalytics([monitor({}), monitor({})], { now: NOW });
    expect(result.averageRoadmapProgress).toBe(0);
  });

  it('sums challenges, evidence and counts passports from source records', () => {
    const monitors = [
      monitor({ challengesCompleted: 2, evidenceCount: 3, hasPassport: true }),
      monitor({ challengesCompleted: 1, evidenceCount: 1, hasPassport: false }),
    ];
    const result = aggregateAnalytics(monitors, { now: NOW });
    expect(result.challengesCompleted).toBe(3);
    expect(result.evidenceCreated).toBe(4);
    expect(result.passportsCreated).toBe(1);
  });
});