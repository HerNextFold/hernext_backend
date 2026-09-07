/**
 * Next Best Action (docs/SCORING_LOGIC.md §34–§35).
 *
 * The backend decides the single next action by evaluating incomplete journey
 * steps in documented priority order. An LLM is never used to select the
 * action; AI may only personalise the wording afterwards.
 */

export type NextActionType =
  | 'COMPLETE_PROFILE'
  | 'ADD_EXPERIENCE'
  | 'COMPLETE_ASSESSMENT'
  | 'DISCOVER_SKILLS'
  | 'SELECT_CAREER'
  | 'REVIEW_SKILL_GAPS'
  | 'COMPLETE_ROADMAP_TASK'
  | 'COMPLETE_CHALLENGE'
  | 'CREATE_EVIDENCE'
  | 'GENERATE_PASSPORT'
  | 'JOURNEY_COMPLETE';

export interface NextAction {
  type: NextActionType;
  action: string;
  reason: string;
  resourceId?: string;
}

export interface NextActionState {
  hasCareerProfile: boolean;
  experienceCount: number;
  assessmentCount: number;
  transferableSkillCount: number;
  hasTargetCareer: boolean;
  targetSkillGapCount: number;
  firstIncompleteTask: { id: string; title: string } | null;
  recommendedChallenge: { id: string; title: string } | null;
  evidenceCount: number;
  hasPassport: boolean;
}

/**
 * Evaluates incomplete journey steps in priority order and returns exactly one
 * next action (docs/SCORING_LOGIC.md §34). When every documented step is
 * complete the journey itself is the terminal "action" - a friendly terminal
 * state so the response shape stays consistent.
 */
export function selectNextAction(state: NextActionState): NextAction {
  if (!state.hasCareerProfile) {
    return {
      type: 'COMPLETE_PROFILE',
      action: 'Complete your career profile',
      reason: 'Your career profile is the foundation for personalised career recommendations.',
    };
  }

  if (state.experienceCount === 0) {
    return {
      type: 'ADD_EXPERIENCE',
      action: 'Tell us about your experience',
      reason: 'We need your work story to identify your transferable skills.',
    };
  }

  if (state.assessmentCount === 0) {
    return {
      type: 'COMPLETE_ASSESSMENT',
      action: 'Complete your AI Career Impact Assessment',
      reason: 'Understand how AI may affect your current work.',
    };
  }

  if (state.transferableSkillCount === 0) {
    return {
      type: 'DISCOVER_SKILLS',
      action: 'Discover your transferable skills',
      reason: 'Turn your real experience into professional skills.',
    };
  }

  if (!state.hasTargetCareer) {
    return {
      type: 'SELECT_CAREER',
      action: 'Select your target career',
      reason: 'Choosing a target career unlocks your roadmap and skill gap analysis.',
    };
  }

  if (state.targetSkillGapCount === 0) {
    return {
      type: 'REVIEW_SKILL_GAPS',
      action: 'Review your skill gaps',
      reason: "Understand what you need to learn for your target career.",
    };
  }

  if (state.firstIncompleteTask !== null) {
    return {
      type: 'COMPLETE_ROADMAP_TASK',
      action: `Complete "${state.firstIncompleteTask.title}"`,
      reason: 'Stay on track towards your target career.',
      resourceId: state.firstIncompleteTask.id,
    };
  }

  if (state.recommendedChallenge !== null) {
    return {
      type: 'COMPLETE_CHALLENGE',
      action: `Complete the "${state.recommendedChallenge.title}"`,
      reason: 'This will build evidence for your target career.',
      resourceId: state.recommendedChallenge.id,
    };
  }

  if (state.evidenceCount === 0) {
    return {
      type: 'CREATE_EVIDENCE',
      action: 'Create your first evidence',
      reason: 'Show proof of the skills you have built.',
    };
  }

  if (!state.hasPassport) {
    return {
      type: 'GENERATE_PASSPORT',
      action: 'Generate your Career Passport',
      reason: 'Share your professional journey with confidence.',
    };
  }

  return {
    type: 'JOURNEY_COMPLETE',
    action: 'Keep building evidence and sharing your Career Passport',
    reason: 'You have completed the major steps of your HerNext journey.',
  };
}