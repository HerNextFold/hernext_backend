import { BASE_SYSTEM_INSTRUCTION } from './base.prompt.js';

export const TRANSFERABLE_SKILLS_PROMPT_VERSION = 'transferable-skills-v1';

/**
 * Builds the system + user prompt for Transferable Skills extraction
 * (docs/AI_SPEC.md §11–§13).
 *
 * The AI only infers skills, never claims verification. It references skills
 * by name; the backend validates names against the approved skill catalogue
 * and stores them as AI_DERIVED.
 */
export function buildTransferableSkillsPrompt(input: {
  occupation: string;
  industry: string;
  yearsOfExperience: number | null;
  experienceTitle: string;
  experienceDescription: string;
  skillCatalogue: string[];
}): { system: string; user: string } {
  const system = `
${BASE_SYSTEM_INSTRUCTION}

You are identifying transferable skills.

Use ONLY the work the participant described. Infer skills from the actions they
take; never claim a skill the description does not support.

All inferred skills remain unverified (candidate skills), never verified.

Skills must be a subset of the approved catalogue. Do not invent skill names.

Additional skills beyond the obvious ones are welcome when the description
supports them, provided they appear in the catalogue.
`.trim();

  const user = `
Occupation: ${input.occupation}
Industry: ${input.industry}
Years of experience: ${input.yearsOfExperience ?? 0}

Relevant experience:
Title: ${input.experienceTitle}
Description: ${input.experienceDescription}

Approved skill catalogue (use only these names):
${input.skillCatalogue.map((skill) => `- ${skill}`).join('\n')}

Respond with JSON in exactly this shape:
{
  "skills": [
    {
      "skillName": "Skill name from the catalogue",
      "reason": "Explain which part of the description supports this inference.",
      "confidence": 0.0
    }
  ]
}
Confidence must be a number between 0 and 1.
`.trim();

  return { system, user };
}
