import { describe, expect, it } from 'vitest';
import {
  calculateAiImpactScore,
  impactLevelForScore,
  roundScore,
} from '../src/lib/scoring/ai-impact.js';

describe('calculateAiImpactScore', () => {
  it('returns 0 when there are no classified tasks', () => {
    expect(calculateAiImpactScore({ automationCount: 0, augmentedCount: 0, humanCount: 0 })).toBe(0);
  });

  it('returns 100 for a pure automation-exposed task set', () => {
    expect(calculateAiImpactScore({ automationCount: 5, augmentedCount: 0, humanCount: 0 })).toBe(100);
  });

  it('returns 0 for a pure human-value task set', () => {
    expect(calculateAiImpactScore({ automationCount: 0, augmentedCount: 0, humanCount: 4 })).toBe(0);
  });

  it('returns a high score for an automation-dominant mix', () => {
    const score = calculateAiImpactScore({ automationCount: 4, augmentedCount: 1, humanCount: 0 });
    expect(score).toBe(87);
  });

  it('returns a moderate score for an augmentation-only mix', () => {
    expect(calculateAiImpactScore({ automationCount: 0, augmentedCount: 100, humanCount: 0 })).toBe(33);
  });

  it('rewards human-valued tasks by lowering exposure', () => {
    const allAutomation = calculateAiImpactScore({ automationCount: 5, augmentedCount: 0, humanCount: 0 });
    const mixed = calculateAiImpactScore({ automationCount: 2, augmentedCount: 1, humanCount: 2 });
    expect(mixed).toBeLessThan(allAutomation);
    expect(mixed).toBe(47);
  });

  it('uses the documented category weights: automation > augmentation > human', () => {
    const automationDominant = calculateAiImpactScore({ automationCount: 2, augmentedCount: 1, humanCount: 0 });
    const augmentationDominant = calculateAiImpactScore({ automationCount: 1, augmentedCount: 2, humanCount: 0 });
    expect(automationDominant).toBeGreaterThan(augmentationDominant);
  });

  it('always returns a clamped 0-100 score', () => {
    const score = calculateAiImpactScore({ automationCount: 100, augmentedCount: 100, humanCount: 100 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('impactLevelForScore', () => {
  it('maps LOW', () => {
    expect(impactLevelForScore(10)).toBe('LOW');
    expect(impactLevelForScore(33)).toBe('LOW');
  });
  it('maps MODERATE', () => {
    expect(impactLevelForScore(34)).toBe('MODERATE');
    expect(impactLevelForScore(66)).toBe('MODERATE');
  });
  it('maps HIGH', () => {
    expect(impactLevelForScore(67)).toBe('HIGH');
    expect(impactLevelForScore(100)).toBe('HIGH');
  });
  it('is deterministic', () => {
    expect(impactLevelForScore(80.4)).toBe(impactLevelForScore(80));
  });
});

describe('roundScore', () => {
  it('rounds to nearest integer', () => {
    expect(roundScore(63.2)).toBe(63);
    expect(roundScore(63.8)).toBe(64);
  });
});