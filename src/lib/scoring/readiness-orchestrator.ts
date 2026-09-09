/**
 * Readiness orchestration: turns persisted journey metrics into the final
 * Career Readiness score and label (docs/SCORING_LOGIC.md §23–§30).
 *
 * Shared by the Progress dashboard and the Career Passport so both surfaces
 * always compute readiness the same way from the same source records.
 */

import { type Db } from '../db.js';
import { findCareerWithSkills, listSkillsInCategories } from '../../models/catalogue.model.js';
import type { JourneyMetrics } from '../../models/progress.model.js';
import { roundScore } from './ai-impact.js';
import {
  AI_RELEVANT_CATEGORIES,
  calculateAiReadinessScore,
  calculateAiSkillCoverage,
  calculateEvidenceScore,
  calculateExperienceScore,
  calculateReadinessSkillsScore,
  isAiRelevantCategory,
  readinessLabel,
} from './readiness.js';

export interface ReadinessSnapshot {
  score: number;
  label: string;
  breakdown: {
    experience: number;
    skills: number;
    aiReadiness: number;
    evidence: number;
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

async function deriveAiReadiness(db: Db, metrics: JourneyMetrics): Promise<number> {
  const catalogueAiSkills = await listSkillsInCategories(db, AI_RELEVANT_CATEGORIES);
  const catalogueAiSkillIds = new Set(catalogueAiSkills.map((s) => s.id));

  const ownedAiSkillIds = new Set(
    metrics.userSkills.filter((s) => isAiRelevantCategory(s.skillCategory)).map((s) => s.skillId),
  );

  let aiRelevantReference: string[] = [...catalogueAiSkillIds];
  if (metrics.targetCareerId !== null) {
    const withSkills = await findCareerWithSkills(db, metrics.targetCareerId);
    if (withSkills !== null) {
      const careerAiSkills = withSkills.skills
        .map((s) => s.skillId)
        .filter((id) => catalogueAiSkillIds.has(id));
      if (careerAiSkills.length > 0) {
        aiRelevantReference = careerAiSkills;
      }
    }
  }

  const aiSkillCoverage = calculateAiSkillCoverage({
    ownedSkillIds: ownedAiSkillIds,
    aiRelevantSkillIds: aiRelevantReference,
  });

  const tasks = metrics.currentRoadmap?.tasks ?? [];
  const aiTasks = tasks.filter((t) => t.skillId !== null && catalogueAiSkillIds.has(t.skillId));
  const aiRoadmapCompletion =
    aiTasks.length === 0
      ? undefined
      : (aiTasks.filter((t) => t.status === 'COMPLETED').length / aiTasks.length) * 100;

  return calculateAiReadinessScore({
    relevantSkillCoverage: aiSkillCoverage,
    aiRoadmapCompletion,
  });
}

/**
 * Computes the Career Readiness score, label and breakdown from persisted
 * journey metrics. Returns a 0/0/0/0 breakdown (Early Stage) for a participant
 * with no records - readiness never assumes progress that has not happened.
 */
export async function computeReadinessFromMetrics(
  db: Db,
  metrics: JourneyMetrics,
): Promise<ReadinessSnapshot> {
  const userSkillIds = new Set(metrics.userSkills.map((s) => s.skillId));
  let skillsScore = 0;
  if (metrics.targetCareerId !== null) {
    const withSkills = await findCareerWithSkills(db, metrics.targetCareerId);
    if (withSkills !== null) {
      skillsScore = calculateReadinessSkillsScore({
        careerSkills: withSkills.skills.map((s) => ({ skillId: s.skillId, importance: s.importance })),
        userSkillIds,
      });
    }
  }

  const breakdown = {
    experience: calculateExperienceScore({
      relevantYears: metrics.relevantYears,
      hasAnyRecords: metrics.hasCareerProfile || metrics.hasExperienceRecords,
    }),
    skills: skillsScore,
    aiReadiness: await deriveAiReadiness(db, metrics),
    evidence: calculateEvidenceScore({
      evidenceCount: metrics.evidenceCount,
      verifiedEvidenceCount: metrics.verifiedEvidenceCount,
    }),
  };

  const raw =
    clamp(breakdown.experience) * 0.25 +
    clamp(breakdown.skills) * 0.3 +
    clamp(breakdown.aiReadiness) * 0.2 +
    clamp(breakdown.evidence) * 0.25;

  const score = roundScore(clamp(raw));
  return {
    score,
    label: readinessLabel(score),
    breakdown,
  };
}