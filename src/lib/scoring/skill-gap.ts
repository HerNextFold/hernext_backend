/**
 * Skill Gap Logic (docs/SCORING_LOGIC.md §17–§18, docs/AI_SPEC.md §18).
 *
 * The backend determines the actual gap by comparing the participant's skills
 * against the career's required skills. The AI may explain a gap but never
 * changes its status or priority.
 */

import type { SkillImportance } from './career-match.js';

export type SkillGapStatus = 'HAS_SKILL' | 'NEEDS_DEVELOPMENT';
export type GapPriority = 'HIGH' | 'MEDIUM' | 'LOW';

const IMPORTANCE_TO_PRIORITY: Record<SkillImportance, GapPriority> = {
  REQUIRED: 'HIGH',
  IMPORTANT: 'MEDIUM',
  NICE_TO_HAVE: 'LOW',
};

export interface SkillGapResult {
  skillId: string;
  skillName: string;
  status: SkillGapStatus;
  priority: GapPriority;
  importance: SkillImportance;
}

/**
 * Computes the skill gap for a single career. `userSkillIds` is the set of
 * skills the participant posseses (any source). Priority is derived from
 * career-skill importance; the status never gets overridden by AI.
 */
export function computeSkillGaps(input: {
  careerSkills: Array<{ skillId: string; skillName: string; importance: SkillImportance }>;
  userSkillIds: ReadonlySet<string>;
}): SkillGapResult[] {
  return input.careerSkills.map((cs) => ({
    skillId: cs.skillId,
    skillName: cs.skillName,
    status: input.userSkillIds.has(cs.skillId) ? 'HAS_SKILL' : 'NEEDS_DEVELOPMENT',
    priority: IMPORTANCE_TO_PRIORITY[cs.importance],
    importance: cs.importance,
  }));
}

/** Convenience: only the missing skills (NEEDS_DEVELOPMENT), sorted by priority. */
export function missingSkills(results: SkillGapResult[]): SkillGapResult[] {
  const order: Record<GapPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return results
    .filter((r) => r.status === 'NEEDS_DEVELOPMENT')
    .sort((a, b) => order[a.priority] - order[b.priority]);
}
