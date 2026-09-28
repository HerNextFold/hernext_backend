import type { CareerPathRow } from '../../models/catalogue.model.js';
import type { CareerProfileRow } from '../../models/career-profile.model.js';
import type { SkillSource, UserSkillWithName } from '../../models/user-skill.model.js';
import type { UserRow } from '../../models/user.model.js';

export interface TargetCareerView {
  id: string;
  name: string;
  industry: string;
  level: string;
}

export interface ExistingSkillView {
  skillId: string;
  skillName: string;
  category: string | null;
  source: SkillSource;
}

/** The authenticated user's own location, owned by the "users" row. */
export type UserLocation = Pick<UserRow, 'country' | 'state'>;

export interface CareerProfileView {
  id: string;
  country: string;
  state: string | null;
  currentOccupation: string;
  industry: string;
  yearsOfExperience: number;
  education: string | null;
  employmentType: string;
  careerInterests: string[] | null;
  targetCareerId: string | null;
  targetCareer: TargetCareerView | null;
  existingSkills: ExistingSkillView[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Converts raw database rows into the documented GET /profile response shape
 * (docs/API_CONTRACT.md §11). Location comes from the "users" row rather than
 * the career profile, so it is never duplicated in "career_profiles".
 */
export function toProfileView(
  profile: CareerProfileRow,
  targetCareer: CareerPathRow | null,
  skills: UserSkillWithName[],
  location: UserLocation,
): CareerProfileView {
  return {
    id: profile.id,
    country: location.country,
    state: location.state,
    currentOccupation: profile.currentOccupation,
    industry: profile.industry,
    yearsOfExperience: profile.yearsOfExperience,
    education: profile.education,
    employmentType: profile.employmentType,
    careerInterests: profile.careerInterests,
    targetCareerId: profile.targetCareerId,
    targetCareer: targetCareer === null
      ? null
      : { id: targetCareer.id, name: targetCareer.name, industry: targetCareer.industry, level: targetCareer.level },
    existingSkills: skills.map((s) => ({
      skillId: s.skillId,
      skillName: s.skillName,
      category: s.skillCategory ?? null,
      source: s.source,
    })),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
