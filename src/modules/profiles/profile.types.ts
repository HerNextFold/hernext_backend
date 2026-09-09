import type { CareerPathRow } from '../../models/catalogue.model.js';
import type { CareerProfileRow } from '../../models/career-profile.model.js';
import type { SkillSource, UserSkillWithName } from '../../models/user-skill.model.js';

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

export interface CareerProfileView {
  id: string;
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
 * (docs/API_CONTRACT.md §11).
 */
export function toProfileView(
  profile: CareerProfileRow,
  targetCareer: CareerPathRow | null,
  skills: UserSkillWithName[],
): CareerProfileView {
  return {
    id: profile.id,
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
