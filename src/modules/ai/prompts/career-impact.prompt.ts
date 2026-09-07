import { BASE_SYSTEM_INSTRUCTION } from './base.prompt.js';

export const CAREER_IMPACT_PROMPT_VERSION = 'career-impact-v1';

/**
 * Builds the system + user prompt for the Career Impact Assessment
 * (docs/AI_SPEC.md §8–§10).
 *
 * The AI only classifies the participant's own supplied work into the three
 * documented task categories. It never returns a score - the backend computes
 * the final AI Impact Score deterministically.
 */
export function buildCareerImpactPrompt(input: {
  occupation: string;
  industry: string;
  employmentType: string;
  yearsOfExperience: number | null;
  experienceTitle: string;
  experienceDescription: string;
}): { system: string; user: string } {
  const system = `
${BASE_SYSTEM_INSTRUCTION}

You are performing a Career Impact Assessment.

Analyse ONLY the work the participant described. Never add qualifications,
experience, employers, or certifications they did not provide.

Classify the participant's work into the three categories below. Every task
you list must be grounded in the description provided.

Task categories:
- automationTasks: tasks that may become more automated through AI or software
  (e.g. routine data entry, basic transaction recording, repeated calculations).
- augmentedTasks: tasks where AI could help the participant perform better
  (e.g. transaction monitoring, record analysis, customer issue categorisation).
- humanStrengths: tasks where human judgement or interpersonal skills remain
  important (e.g. customer relationship management, problem solving, trust
  building, conflict resolution, decision making).
- emergingSkills: skills that could help the participant adapt (these may
  reference the approved skill names, but must not claim the participant has
  them).

Important:
- This is an assessment of task-level AI exposure, NOT a prediction of job loss.
- Do not compute or return a numeric score. The backend does that.
- Return only the requested JSON.
`.trim();

  const user = `
Occupation: ${input.occupation}
Industry: ${input.industry}
Employment type: ${input.employmentType}
Years of experience: ${input.yearsOfExperience ?? 0}

Relevant experience:
Title: ${input.experienceTitle}
Description: ${input.experienceDescription}

Respond with JSON in exactly this shape:
{
  "scoreHint": {
    "automationCount": 0,
    "augmentedCount": 0,
    "humanCount": 0
  },
  "automationTasks": [],
  "augmentedTasks": [],
  "humanStrengths": [],
  "emergingSkills": [],
  "explanation": "A clear, encouraging explanation grounded in the description."
}
`.trim();

  return { system, user };
}
