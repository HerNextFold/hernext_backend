import { describe, expect, it } from 'vitest';
import {
  calculateAiReadinessScore,
  calculateCareerInterestScore,
  calculateCareerMatchScore,
  calculateExperienceMatchScore,
  calculateSkillMatchScore,
  matchLabel,
} from '../src/lib/scoring/career-match.js';

describe('calculateSkillMatchScore', () => {
  const careerSkills: Array<{ skillId: string; importance: 'REQUIRED' | 'IMPORTANT' | 'NICE_TO_HAVE' }> = [
    { skillId: 'a', importance: 'REQUIRED' },
    { skillId: 'b', importance: 'REQUIRED' },
    { skillId: 'c', importance: 'IMPORTANT' },
  ];

  it('scores 0 with no matching skills', () => {
    expect(calculateSkillMatchScore({ careerSkills, userSkillIds: new Set(['x']) })).toBe(0);
  });

  it('scores partial based on weighted importance', () => {
    // matched = REQUIRED(a) weight 3 of total 8 → 100 * 3/8 = 37.5 → 38
    expect(calculateSkillMatchScore({ careerSkills, userSkillIds: new Set(['a']) })).toBe(38);
  });

  it('scores 100 with all skills matched', () => {
    expect(calculateSkillMatchScore({ careerSkills, userSkillIds: new Set(['a', 'b', 'c']) })).toBe(100);
  });

  it('returns 0 when a career has no skills', () => {
    expect(calculateSkillMatchScore({ careerSkills: [], userSkillIds: new Set(['a']) })).toBe(0);
  });
});

describe('calculateExperienceMatchScore', () => {
  it('scores 0 with no relevant experience', () => {
    expect(calculateExperienceMatchScore({ hasRelevantExperience: false, relevantYears: 0 })).toBe(0);
  });

  it('gives 50 for relevant experience presence', () => {
    expect(calculateExperienceMatchScore({ hasRelevantExperience: true, relevantYears: 0 })).toBe(50);
  });

  it('clamps duration to 4 years', () => {
    const capped = calculateExperienceMatchScore({ hasRelevantExperience: true, relevantYears: 10 });
    const fourYears = calculateExperienceMatchScore({ hasRelevantExperience: true, relevantYears: 4 });
    expect(capped).toBe(100);
    expect(fourYears).toBe(100);
  });

  it('combines presence and duration', () => {
    // 50 presence + (2/4)*50 = 25 → 75
    expect(calculateExperienceMatchScore({ hasRelevantExperience: true, relevantYears: 2 })).toBe(75);
  });
});

describe('calculateCareerInterestScore', () => {
  it('maps the four documented levels', () => {
    expect(calculateCareerInterestScore(0)).toBe(0);
    expect(calculateCareerInterestScore(40)).toBe(40);
    expect(calculateCareerInterestScore(70)).toBe(70);
    expect(calculateCareerInterestScore(100)).toBe(100);
  });
});

describe('calculateAiReadinessScore', () => {
  it('falls back to skill coverage when no roadmap exists', () => {
    expect(calculateAiReadinessScore({ relevantSkillCoverage: 40, aiRoadmapCompletion: undefined })).toBe(40);
  });
  it('averages skill coverage and roadmap completion', () => {
    expect(
      calculateAiReadinessScore({ relevantSkillCoverage: 50, aiRoadmapCompletion: 90 }),
    ).toBe(70);
  });
});

describe('calculateCareerMatchScore', () => {
  it('computes the documented weighted formula', () => {
    const score = calculateCareerMatchScore({
      skillMatch: 50,
      experienceMatch: 50,
      careerInterest: 100,
      aiReadiness: 50,
    });
    // 50*.45 + 50*.25 + 100*.15 + 50*.15 = 22.5 + 12.5 + 15 + 7.5 = 57.5 → 58 (Math.round)
    expect(score).toBe(58);
  });

  it('clamps each component to 0-100', () => {
    const score = calculateCareerMatchScore({
      skillMatch: 500,
      experienceMatch: 500,
      careerInterest: 100,
      aiReadiness: 500,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('matchLabel', () => {
  it('classifies score bands', () => {
    expect(matchLabel(85)).toBe('Strong Match');
    expect(matchLabel(70)).toBe('Good Match');
    expect(matchLabel(45)).toBe('Emerging Match');
    expect(matchLabel(30)).toBe('Low Match');
  });
});