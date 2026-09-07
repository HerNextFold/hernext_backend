import type { CareerProfileRow } from '../../models/career-profile.model.js';
import type { ExperienceRow } from '../../models/experience.model.js';
import type { EmploymentType } from '../../models/experience.model.js';

/** Context shape consumed by the Career Impact + Transferable Skills prompts. */
export interface ProfileExperienceContext {
  occupation: string;
  industry: string;
  employmentType: EmploymentType | 'NOT_SPECIFIED';
  yearsOfExperience: number | null;
  experienceTitle: string;
  experienceDescription: string;
}

/**
 * Joins a participant's career profile (when present) with a single experience
 * into the prompt context. Values are always strings/null so the prompt builder
 * never receives raw database enums.
 */
export async function connectProfileWithExperience(
  profile: CareerProfileRow | null,
  experience: ExperienceRow,
): Promise<ProfileExperienceContext> {
  return {
    occupation: profile?.currentOccupation ?? 'Not specified',
    industry: profile?.industry ?? 'Not specified',
    employmentType: profile?.employmentType ?? experience.employmentType,
    yearsOfExperience: profile?.yearsOfExperience ?? experience.years ?? null,
    experienceTitle: experience.title,
    experienceDescription: experience.description,
  };
}
