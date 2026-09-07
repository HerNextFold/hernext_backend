import { describe, expect, it } from 'vitest';
import {
  calculateChallengeProgress,
  calculateOverallProgress,
  calculatePhaseProgress,
  calculateRoadmapProgress,
} from '../src/lib/scoring/progress.js';

describe('calculateRoadmapProgress', () => {
  it('matches the documented example (6/8 → 75)', () => {
    expect(calculateRoadmapProgress({ completedTasks: 6, totalTasks: 8 })).toBe(75);
  });

  it('returns 0 when there are no tasks', () => {
    expect(calculateRoadmapProgress({ completedTasks: 0, totalTasks: 0 })).toBe(0);
    expect(calculateRoadmapProgress({ completedTasks: 3, totalTasks: 0 })).toBe(0);
  });

  it('returns 100 when all tasks are completed', () => {
    expect(calculateRoadmapProgress({ completedTasks: 4, totalTasks: 4 })).toBe(100);
  });

  it('never exceeds 100', () => {
    expect(calculateRoadmapProgress({ completedTasks: 9, totalTasks: 4 })).toBe(100);
  });
});

describe('calculatePhaseProgress', () => {
  it('scores per-phase completion', () => {
    expect(calculatePhaseProgress({ completedTasks: 3, totalTasks: 4 })).toBe(75);
    expect(calculatePhaseProgress({ completedTasks: 0, totalTasks: 3 })).toBe(0);
  });

  it('returns 0 for an empty phase', () => {
    expect(calculatePhaseProgress({ completedTasks: 0, totalTasks: 0 })).toBe(0);
  });
});

describe('calculateChallengeProgress', () => {
  it('returns 0 when no challenges are available (never 100)', () => {
    expect(calculateChallengeProgress({ passedChallenges: 0, availableChallenges: 0 })).toBe(0);
    expect(calculateChallengeProgress({ passedChallenges: 5, availableChallenges: 0 })).toBe(0);
  });

  it('returns 0 when nothing is passed', () => {
    expect(calculateChallengeProgress({ passedChallenges: 0, availableChallenges: 2 })).toBe(0);
  });

  it('computes passed / available', () => {
    expect(calculateChallengeProgress({ passedChallenges: 1, availableChallenges: 2 })).toBe(50);
    expect(calculateChallengeProgress({ passedChallenges: 2, availableChallenges: 2 })).toBe(100);
  });
});

describe('calculateOverallProgress', () => {
  it('matches the documented example (7/9 → 78)', () => {
    expect(calculateOverallProgress({ completedStages: 7, totalStages: 9 })).toBe(78);
  });

  it('returns 0 when nothing is completed', () => {
    expect(calculateOverallProgress({ completedStages: 0, totalStages: 9 })).toBe(0);
  });

  it('returns 100 when every stage is complete', () => {
    expect(calculateOverallProgress({ completedStages: 9, totalStages: 9 })).toBe(100);
  });

  it('returns 0 when there are no stages', () => {
    expect(calculateOverallProgress({ completedStages: 0, totalStages: 0 })).toBe(0);
  });
});