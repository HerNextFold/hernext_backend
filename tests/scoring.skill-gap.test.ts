import { describe, expect, it } from 'vitest';
import { computeSkillGaps, missingSkills } from '../src/lib/scoring/skill-gap.js';
import type { SkillImportance } from '../src/lib/scoring/career-match.js';

type CareerSkillFixture = { skillId: string; skillName: string; importance: SkillImportance };

const careerSkills: CareerSkillFixture[] = [
  { skillId: 'a', skillName: 'Excel', importance: 'REQUIRED' },
  { skillId: 'b', skillName: 'Reconciliation', importance: 'IMPORTANT' },
  { skillId: 'c', skillName: 'Communication', importance: 'NICE_TO_HAVE' },
];

describe('computeSkillGaps', () => {
  it('marks a skill as HAS_SKILL when the user has it', () => {
    const gaps = computeSkillGaps({ careerSkills, userSkillIds: new Set(['a']) });
    const excel = gaps.find((g) => g.skillId === 'a');
    expect(excel?.status).toBe('HAS_SKILL');
  });

  it('marks missing skills as NEEDS_DEVELOPMENT', () => {
    const gaps = computeSkillGaps({ careerSkills, userSkillIds: new Set(['a']) });
    const reconciliation = gaps.find((g) => g.skillId === 'b');
    expect(reconciliation?.status).toBe('NEEDS_DEVELOPMENT');
  });

  it('derives priority from importance', () => {
    const gaps = computeSkillGaps({ careerSkills, userSkillIds: new Set() });
    const byId = Object.fromEntries(gaps.map((g) => [g.skillId, g.priority]));
    expect(byId.a).toBe('HIGH');
    expect(byId.b).toBe('MEDIUM');
    expect(byId.c).toBe('LOW');
  });

  it('does not let the AI change the status or priority', () => {
    // Even if a caller tries to pass a userSkillIds set that gives a skill
    // HAS_SKILL, the priority stays derived from importance only.
    const gaps = computeSkillGaps({ careerSkills, userSkillIds: new Set(['a', 'b', 'c']) });
    expect(gaps.every((g) => g.status === 'HAS_SKILL')).toBe(true);
    expect(gaps.find((g) => g.skillId === 'a')?.priority).toBe('HIGH');
  });
});

describe('missingSkills', () => {
  it('returns only NEEDS_DEVELOPMENT skills sorted by priority', () => {
    const gaps = computeSkillGaps({
      careerSkills: [
        { skillId: 'a', skillName: 'Excel', importance: 'REQUIRED' },
        { skillId: 'b', skillName: 'Reconciliation', importance: 'IMPORTANT' },
        { skillId: 'c', skillName: 'Communication', importance: 'NICE_TO_HAVE' },
      ] satisfies CareerSkillFixture[],
      userSkillIds: new Set(['b']),
    });
    const missing = missingSkills(gaps);
    expect(missing.map((g) => g.skillId)).toEqual(['a', 'c']);
  });

  it('returns an empty list when nothing is missing', () => {
    const gaps = computeSkillGaps({
      careerSkills: [
        { skillId: 'a', skillName: 'Excel', importance: 'REQUIRED' },
      ] satisfies CareerSkillFixture[],
      userSkillIds: new Set(['a']),
    });
    expect(missingSkills(gaps)).toEqual([]);
  });
});