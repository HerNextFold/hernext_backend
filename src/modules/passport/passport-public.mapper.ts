/**
 * Public Career Passport mapper (docs/PRODUCT_SPEC.md §25,
 * docs/SECURITY_SPEC.md §35–§36).
 *
 * The public passport is a dedicated response shape built by explicit field
 * allowlisting. The full participant database object is never returned - no
 * email, no password/hash, no internal database IDs, no private profile or
 * analytics fields.
 */

import type { PassportView } from './passport.service.js';

export interface PublicPassport {
  name: string;
  country: string | null;
  headline: string | null;
  experience: Array<{ title: string; organization: string | null; years: number | null }>;
  skills: Array<{ name: string; category: string; source: string; proficiency: number }>;
  careerGoal: string | null;
  readiness: number;
  readinessLabel: string;
  aiImpact: { score: number; level: string } | null;
  roadmapProgress: number;
  phaseProgress: Record<string, number>;
  challenges: Array<{ title: string }>;
  evidence: Array<{
    title: string;
    description: string;
    result: string;
    status: string;
    skillName: string | null;
    createdAt: Date;
  }>;
  achievements: Array<{ name: string; earnedAt: Date }>;
  updatedAt: Date;
}

/** Maps the full passport view to the intentionally public subset. */
export function toPublicPassport(view: PassportView): PublicPassport {
  return {
    name: view.name,
    country: view.country,
    headline: view.headline,
    experience: view.experience.map((e) => ({
      title: e.title,
      organization: e.organization,
      years: e.years,
    })),
    skills: view.skills.map((s) => ({
      name: s.name,
      category: s.category,
      source: s.source,
      proficiency: s.proficiency,
    })),
    careerGoal: view.careerGoal,
    readiness: view.readiness.score,
    readinessLabel: view.readiness.label,
    aiImpact: view.aiImpact,
    roadmapProgress: view.roadmapProgress,
    phaseProgress: view.phaseProgress,
    challenges: view.challenges.map((c) => ({ title: c.title })),
    evidence: view.evidence.map((e) => ({
      title: e.title,
      description: e.description,
      result: e.result,
      status: e.status,
      skillName: e.skillName,
      createdAt: e.createdAt,
    })),
    achievements: view.achievements.map((a) => ({ name: a.name, earnedAt: a.earnedAt })),
    updatedAt: view.updatedAt,
  };
}