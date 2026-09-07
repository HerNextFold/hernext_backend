import { describe, expect, it } from 'vitest';
import {
  evaluateAchievementCodes,
  type AchievementCode,
  type AchievementEvaluationState,
} from '../src/lib/scoring/achievements.js';

const ALL_CODES: AchievementCode[] = [
  'PROFILE_COMPLETED',
  'ASSESSMENT_COMPLETED',
  'FIRST_SKILL_DISCOVERED',
  'FIRST_CHALLENGE_COMPLETED',
  'FIRST_EVIDENCE_CREATED',
  '30_DAY_GOAL_COMPLETED',
  'ROADMAP_COMPLETED',
  'PASSPORT_READY',
];

function emptyState(): AchievementEvaluationState {
  return {
    hasCareerProfile: false,
    assessmentCount: 0,
    userSkillCount: 0,
    passedChallengeCount: 0,
    evidenceCount: 0,
    day30TotalTasks: 0,
    day30CompletedTasks: 0,
    roadmapTotalTasks: 0,
    roadmapCompletedTasks: 0,
    hasPassport: false,
  };
}

describe('evaluateAchievementCodes', () => {
  it('grants nothing for an empty journey', () => {
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state: emptyState() })).toEqual([]);
  });

  it('grants PROFILE_COMPLETED when a career profile exists', () => {
    const state = { ...emptyState(), hasCareerProfile: true };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual(['PROFILE_COMPLETED']);
  });

  it('grants ASSESSMENT_COMPLETED when at least one assessment exists', () => {
    const state = { ...emptyState(), assessmentCount: 1 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual(['ASSESSMENT_COMPLETED']);
  });

  it('grants FIRST_SKILL_DISCOVERED when the user has a skill', () => {
    const state = { ...emptyState(), userSkillCount: 1 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual(['FIRST_SKILL_DISCOVERED']);
  });

  it('grants FIRST_CHALLENGE_COMPLETED when a submission passed', () => {
    const state = { ...emptyState(), passedChallengeCount: 1 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual([
      'FIRST_CHALLENGE_COMPLETED',
    ]);
  });

  it('grants FIRST_EVIDENCE_CREATED when evidence exists', () => {
    const state = { ...emptyState(), evidenceCount: 1 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual([
      'FIRST_EVIDENCE_CREATED',
    ]);
  });

  it('grants 30_DAY_GOAL_COMPLETED only when all DAY_30 tasks are done', () => {
    const partial = { ...emptyState(), day30TotalTasks: 3, day30CompletedTasks: 2 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state: partial })).toEqual([]);

    const complete = { ...emptyState(), day30TotalTasks: 3, day30CompletedTasks: 3 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state: complete })).toEqual([
      '30_DAY_GOAL_COMPLETED',
    ]);
  });

  it('does not grant 30_DAY_GOAL when the phase is empty', () => {
    const state = { ...emptyState(), day30CompletedTasks: 0, day30TotalTasks: 0 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual([]);
  });

  it('grants ROADMAP_COMPLETED only when the whole roadmap is done', () => {
    const state = { ...emptyState(), roadmapTotalTasks: 6, roadmapCompletedTasks: 6 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual(['ROADMAP_COMPLETED']);
  });

  it('does not grant ROADMAP_COMPLETED when tasks remain', () => {
    const state = { ...emptyState(), roadmapTotalTasks: 6, roadmapCompletedTasks: 3 };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual([]);
  });

  it('grants PASSPORT_READY when a passport exists', () => {
    const state = { ...emptyState(), hasPassport: true };
    expect(evaluateAchievementCodes({ codes: ALL_CODES, state })).toEqual(['PASSPORT_READY']);
  });

  it('ignores unknown codes and never grants them', () => {
    const state = { ...emptyState(), hasCareerProfile: true };
    const codes = [...ALL_CODES, 'NOT_A_REAL_ACHIEVEMENT' as AchievementCode];
    expect(evaluateAchievementCodes({ codes, state })).toEqual(['PROFILE_COMPLETED']);
  });

  it('is idempotent - repeated evaluation returns the same set', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      assessmentCount: 1,
      userSkillCount: 2,
      roadmapTotalTasks: 2,
      roadmapCompletedTasks: 2,
      hasPassport: true,
    };
    const first = evaluateAchievementCodes({ codes: ALL_CODES, state });
    const second = evaluateAchievementCodes({ codes: ALL_CODES, state });
    expect(second).toEqual(first);
  });
});