import { describe, expect, it } from 'vitest';
import { selectNextAction, type NextActionState } from '../src/lib/scoring/next-action.js';

function emptyState(): NextActionState {
  return {
    hasCareerProfile: false,
    experienceCount: 0,
    assessmentCount: 0,
    transferableSkillCount: 0,
    hasTargetCareer: false,
    targetSkillGapCount: 0,
    firstIncompleteTask: null,
    recommendedChallenge: null,
    evidenceCount: 0,
    hasPassport: false,
  };
}

describe('selectNextAction', () => {
  it('starts with COMPLETE_PROFILE', () => {
    expect(selectNextAction(emptyState()).type).toBe('COMPLETE_PROFILE');
  });

  it('adds experience once the profile exists', () => {
    const state = { ...emptyState(), hasCareerProfile: true };
    expect(selectNextAction(state).type).toBe('ADD_EXPERIENCE');
  });

  it('requests the AI assessment once experience exists', () => {
    const state = { ...emptyState(), hasCareerProfile: true, experienceCount: 1 };
    expect(selectNextAction(state).type).toBe('COMPLETE_ASSESSMENT');
  });

  it('asks to discover skills once the assessment is done', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
    };
    expect(selectNextAction(state).type).toBe('DISCOVER_SKILLS');
  });

  it('asks to select a target career once skills are discovered', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
    };
    expect(selectNextAction(state).type).toBe('SELECT_CAREER');
  });

  it('asks to review skill gaps once a target career is set', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
      hasTargetCareer: true,
    };
    expect(selectNextAction(state).type).toBe('REVIEW_SKILL_GAPS');
  });

  it('returns the next roadmap task once gaps exist', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
      hasTargetCareer: true,
      targetSkillGapCount: 3,
      firstIncompleteTask: { id: 'task-1', title: 'Excel basics' },
    };
    const action = selectNextAction(state);
    expect(action.type).toBe('COMPLETE_ROADMAP_TASK');
    expect(action.resourceId).toBe('task-1');
    expect(action.action).toContain('Excel basics');
  });

  it('suggests an unpassed challenge when the roadmap is complete', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
      hasTargetCareer: true,
      targetSkillGapCount: 3,
      firstIncompleteTask: null,
      recommendedChallenge: { id: 'challenge-1', title: 'Financial Reconciliation Challenge' },
    };
    const action = selectNextAction(state);
    expect(action.type).toBe('COMPLETE_CHALLENGE');
    expect(action.resourceId).toBe('challenge-1');
    expect(action.action).toContain('Financial Reconciliation Challenge');
  });

  it('asks for evidence once challenges are passed', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
      hasTargetCareer: true,
      targetSkillGapCount: 3,
      firstIncompleteTask: null,
      recommendedChallenge: null,
    };
    expect(selectNextAction(state).type).toBe('CREATE_EVIDENCE');
  });

  it('asks to generate a passport once evidence exists', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
      hasTargetCareer: true,
      targetSkillGapCount: 3,
      firstIncompleteTask: null,
      recommendedChallenge: null,
      evidenceCount: 1,
    };
    expect(selectNextAction(state).type).toBe('GENERATE_PASSPORT');
  });

  it('returns the terminal journey-complete action when everything is done', () => {
    const state = {
      ...emptyState(),
      hasCareerProfile: true,
      experienceCount: 1,
      assessmentCount: 1,
      transferableSkillCount: 1,
      hasTargetCareer: true,
      targetSkillGapCount: 3,
      firstIncompleteTask: null,
      recommendedChallenge: null,
      evidenceCount: 1,
      hasPassport: true,
    };
    expect(selectNextAction(state).type).toBe('JOURNEY_COMPLETE');
  });
});