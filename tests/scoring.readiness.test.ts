import { describe, expect, it } from 'vitest';
import {
  calculateCareerReadinessScore,
  calculateEvidenceScore,
  calculateExperienceScore,
  calculateReadinessSkillsScore,
  readinessLabel,
  READINESS_WEIGHTS,
} from '../src/lib/scoring/readiness.js';

describe('calculateExperienceScore', () => {
  it('scores 0 when there are no profile/experience records', () => {
    expect(calculateExperienceScore({ relevantYears: 0, hasAnyRecords: false })).toBe(0);
    expect(calculateExperienceScore({ relevantYears: 4, hasAnyRecords: false })).toBe(0);
  });

  it('scores 50 for some transferable experience', () => {
    expect(calculateExperienceScore({ relevantYears: 1, hasAnyRecords: true })).toBe(50);
    expect(calculateExperienceScore({ relevantYears: 2.9, hasAnyRecords: true })).toBe(50);
  });

  it('scores 75 for strong experience', () => {
    expect(calculateExperienceScore({ relevantYears: 3, hasAnyRecords: true })).toBe(75);
    expect(calculateExperienceScore({ relevantYears: 4.9, hasAnyRecords: true })).toBe(75);
  });

  it('scores 100 for substantial experience', () => {
    expect(calculateExperienceScore({ relevantYears: 5, hasAnyRecords: true })).toBe(100);
    expect(calculateExperienceScore({ relevantYears: 20, hasAnyRecords: true })).toBe(100);
  });

  it('scores 25 when records exist but no years were declared', () => {
    expect(calculateExperienceScore({ relevantYears: 0, hasAnyRecords: true })).toBe(25);
  });
});

describe('calculateEvidenceScore', () => {
  it('scores 0 with no evidence', () => {
    expect(calculateEvidenceScore({ evidenceCount: 0, verifiedEvidenceCount: 0 })).toBe(0);
  });

  it('scores 50 with exactly one evidence item', () => {
    expect(calculateEvidenceScore({ evidenceCount: 1, verifiedEvidenceCount: 0 })).toBe(50);
    expect(calculateEvidenceScore({ evidenceCount: 1, verifiedEvidenceCount: 1 })).toBe(50);
  });

  it('scores 75 with two or more unverified evidence items', () => {
    expect(calculateEvidenceScore({ evidenceCount: 2, verifiedEvidenceCount: 0 })).toBe(75);
    expect(calculateEvidenceScore({ evidenceCount: 5, verifiedEvidenceCount: 0 })).toBe(75);
  });

  it('scores 100 for strong verified coverage', () => {
    expect(calculateEvidenceScore({ evidenceCount: 2, verifiedEvidenceCount: 1 })).toBe(100);
    expect(calculateEvidenceScore({ evidenceCount: 3, verifiedEvidenceCount: 2 })).toBe(100);
  });
});

describe('calculateReadinessSkillsScore', () => {
  const careerSkills = [
    { skillId: 'a', importance: 'REQUIRED' as const },
    { skillId: 'b', importance: 'IMPORTANT' as const },
  ];

  it('returns 0 when there is no target career (no skills to compare)', () => {
    expect(calculateReadinessSkillsScore({ careerSkills: [], userSkillIds: new Set() })).toBe(0);
  });

  it('uses the weighted skill match formula', () => {
    // matched REQUIRED (3) of total 5 → 60
    expect(calculateReadinessSkillsScore({ careerSkills, userSkillIds: new Set(['a']) })).toBe(60);
  });

  it('scores 100 when all target skills are possessed', () => {
    expect(
      calculateReadinessSkillsScore({ careerSkills, userSkillIds: new Set(['a', 'b']) }),
    ).toBe(100);
  });
});

describe('calculateCareerReadinessScore', () => {
  it('uses the documented weights (25/30/20/25)', () => {
    expect(READINESS_WEIGHTS.experience).toBe(0.25);
    expect(READINESS_WEIGHTS.skills).toBe(0.3);
    expect(READINESS_WEIGHTS.aiReadiness).toBe(0.2);
    expect(READINESS_WEIGHTS.evidence).toBe(0.25);
  });

  it('matches the documented worked example (80/75/70/90 → 79)', () => {
    expect(
      calculateCareerReadinessScore({
        experience: 80,
        skills: 75,
        aiReadiness: 70,
        evidence: 90,
      }),
    ).toBe(79);
  });

  it('returns 0 when every component is empty', () => {
    expect(
      calculateCareerReadinessScore({ experience: 0, skills: 0, aiReadiness: 0, evidence: 0 }),
    ).toBe(0);
  });

  it('returns 100 only when every component is at its maximum', () => {
    expect(
      calculateCareerReadinessScore({ experience: 100, skills: 100, aiReadiness: 100, evidence: 100 }),
    ).toBe(100);
  });

  it('is deterministic and clamped', () => {
    for (const input of [
      { experience: 5, skills: 10, aiReadiness: 3, evidence: 8 },
      { experience: 200, skills: -1, aiReadiness: 50, evidence: 50 },
    ]) {
      const score = calculateCareerReadinessScore(input);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBe(calculateCareerReadinessScore(input));
    }
  });
});

describe('readinessLabel', () => {
  it('maps the documented bands', () => {
    expect(readinessLabel(0)).toBe('Early Stage');
    expect(readinessLabel(39)).toBe('Early Stage');
    expect(readinessLabel(40)).toBe('Building Foundations');
    expect(readinessLabel(59)).toBe('Building Foundations');
    expect(readinessLabel(60)).toBe('Developing');
    expect(readinessLabel(79)).toBe('Developing');
    expect(readinessLabel(80)).toBe('Opportunity Ready');
    expect(readinessLabel(100)).toBe('Opportunity Ready');
  });
});