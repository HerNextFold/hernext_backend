import { BASE_SYSTEM_INSTRUCTION } from './base.prompt.js';

export const ROADMAP_PROMPT_VERSION = 'roadmap-v1';

export const ROADMAP_PHASE_LABELS = ['30 days', '60 days', '90 days'] as const;

/**
 * Builds the system + user prompt for Roadmap generation
 * (docs/AI_SPEC.md §14, docs/PRODUCT_SPEC.md §15).
 *
 * The roadmap focuses on developing the skills the participant is currently
 * missing. Tasks reference approved skill names; the backend validates them and
 * derives progress from actual task completion.
 */
export function buildRoadmapPrompt(input: {
  careerName: string;
  careerDescription: string;
  missingSkills: Array<{ name: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }>;
  currentSkills: string[];
  occupation: string;
}): { system: string; user: string } {
  const system = `
${BASE_SYSTEM_INSTRUCTION}

You are building a 30/60/90-day career roadmap.

The roadmap helps the participant develop the skills they are currently missing
for a target career, while building on the skills they already have.

Follow these rules:
- Return exactly 3 to 5 tasks per phase (30, 60, 90 days). A phase with fewer
  than 3 or more than 5 tasks will be rejected by the backend.
- Reference only approved skill names from the "Skills to develop" list.
- Tasks must be practical, specific, and achievable by a busy working woman.
- Do not claim the participant will get a job or degree by a certain date.
- No fabricated qualifications, certifications, or guaranteed outcomes.
`.trim();

  const user = `
Target career: ${input.careerName}
Career description: ${input.careerDescription}

Participant current occupation: ${input.occupation}

Skills the participant already has:
${input.currentSkills.map((s) => `- ${s}`).join('\n')}

Skills to develop (with priority):
${input.missingSkills.map((s) => `- ${s.name} (${s.priority})`).join('\n')}

Respond with JSON in exactly this shape. Each phase must contain 3 to 5 tasks:
{
  "title": "A short title for the roadmap",
  "description": "One to two sentences summarising the roadmap.",
  "phases": {
    "30": [
      {
        "title": "Task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop",
        "estimatedMinutes": 30
      },
      {
        "title": "Second task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop",
        "estimatedMinutes": 45
      },
      {
        "title": "Third task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop"
      }
    ],
    "60": [
      {
        "title": "Task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop",
        "estimatedMinutes": 60
      },
      {
        "title": "Second task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop"
      },
      {
        "title": "Third task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop"
      }
    ],
    "90": [
      {
        "title": "Task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop"
      },
      {
        "title": "Second task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop"
      },
      {
        "title": "Third task title",
        "description": "Specific task instructions.",
        "skillName": "Skill name from the list to develop",
        "estimatedMinutes": 90
      }
    ]
  }
}
Do not include skills the participant already has as the sole focus; the roadmap
is about closing gaps. estimatedMinutes is optional.
`.trim();

  return { system, user };
}
