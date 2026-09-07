import { describe, expect, it } from 'vitest';
import {
  careerImpactOutputSchema,
  transferableSkillsOutputSchema,
  roadmapOutputSchema,
} from '../src/modules/ai/ai.schemas.js';

describe('careerImpactOutputSchema', () => {
  it('accepts valid output and defaults empty arrays', () => {
    const parsed = careerImpactOutputSchema.parse({
      automationTasks: ['Data entry'],
      augmentedTasks: [],
      humanStrengths: ['Customer relationships'],
      emergingSkills: [],
      explanation: 'Grounded in the description.',
    });
    expect(parsed.automationTasks).toEqual(['Data entry']);
    expect(parsed.augmentedTasks).toEqual([]);
    expect(parsed.explanation.length).toBeGreaterThan(0);
  });

  it('rejects output missing the explanation', () => {
    expect(() =>
      careerImpactOutputSchema.parse({
        automationTasks: [],
        augmentedTasks: [],
        humanStrengths: [],
        emergingSkills: [],
      }),
    ).toThrow();
  });

  it('rejects non-array task lists', () => {
    expect(() =>
      careerImpactOutputSchema.parse({
        automationTasks: 'not-an-array',
        augmentedTasks: [],
        humanStrengths: [],
        emergingSkills: [],
        explanation: 'x',
      }),
    ).toThrow();
  });
});

describe('transferableSkillsOutputSchema', () => {
  it('accepts valid skills with in-range confidence', () => {
    const parsed = transferableSkillsOutputSchema.parse({
      skills: [
        { skillName: 'Excel', reason: 'Kept spreadsheets', confidence: 0.9 },
        { skillName: 'Reconciliation', reason: 'Matched daily totals', confidence: 0.7 },
      ],
    });
    expect(parsed.skills).toHaveLength(2);
  });

  it('rejects confidence outside 0-1', () => {
    expect(() =>
      transferableSkillsOutputSchema.parse({
        skills: [{ skillName: 'Excel', reason: 'x', confidence: 1.5 }],
      }),
    ).toThrow();
  });

  it('rejects a missing reason', () => {
    expect(() =>
      transferableSkillsOutputSchema.parse({
        skills: [{ skillName: 'Excel', confidence: 0.5 }],
      }),
    ).toThrow();
  });
});

describe('roadmapOutputSchema', () => {
  const valid = {
    title: 'Fintech Ops in 90 days',
    description: 'Close your skill gaps step by step.',
    phases: {
      30: [{ title: 'Learn Excel', description: 'Do a course', skillName: 'Excel', estimatedMinutes: 120 }],
      60: [{ title: 'Practice reconciliation', description: 'Daily totals', skillName: 'Reconciliation' }],
      90: [],
    },
  };

  it('accepts valid roadmap output', () => {
    const parsed = roadmapOutputSchema.parse(valid);
    expect(parsed.phases['30']).toHaveLength(1);
    expect(parsed.phases['90']).toEqual([]);
  });

  it('makes estimatedMinutes optional', () => {
    expect(() => roadmapOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects a phase with an unknown skill reference structure', () => {
    expect(() =>
      roadmapOutputSchema.parse({
        ...valid,
        phases: { ...valid.phases, 30: [{ description: 'no title' }] },
      }),
    ).toThrow();
  });
});