import { getPool } from '../../lib/db.js';
import { calculateChallengeProgress, calculateRoadmapProgress } from '../../lib/scoring/progress.js';
import {
  calculateExpectedProgress,
  determineParticipantStatus,
  type ParticipantStatus,
} from '../../lib/scoring/participant-status.js';
import { computeReadinessFromMetrics, type ReadinessSnapshot } from '../../lib/scoring/readiness-orchestrator.js';
import { loadJourneyMetrics } from '../../models/progress.model.js';
import type { ParticipantViewRow } from '../../models/program.model.js';
import type { ProgramRow } from '../../models/program.model.js';

/**
 * Organization-facing monitoring view for one participant
 * (docs/PRODUCT_SPEC.md §28, docs/API_CONTRACT.md §38–§39).
 *
 * All values are derived from the same persisted source records and scoring
 * functions the participant-facing dashboard uses, so program monitoring and
 * participant progress can never disagree (docs/SCORING_LOGIC.md §49). The
 * participant status is deterministic backend logic (docs/SCORING_LOGIC.md
 * §36–§41) - never an LLM.
 */
export interface ParticipantMonitor {
  id: string;
  name: string;
  joinedAt: Date;
  lastActivityAt: Date;
  status: ParticipantStatus;
  currentCareerGoal: string | null;
  readinessScore: number;
  readinessLabel: string;
  roadmapProgress: number;
  hasRoadmap: boolean;
  challengeProgress: number;
  assessmentCompleted: boolean;
  skillsDeveloped: number;
  skillIds: string[];
  evidenceCount: number;
  hasPassport: boolean;
  challengesCompleted: number;
}

export interface MonitorContext {
  program: ProgramRow;
  views: ParticipantViewRow[];
  now: Date;
}

/** Loads every participant monitor for a program, reusing the journey metrics pipeline. */
export async function buildParticipantMonitors(context: MonitorContext): Promise<ParticipantMonitor[]> {
  return Promise.all(context.views.map((view) => buildOneParticipantMonitor(context, view)));
}

export async function buildOneParticipantMonitor(
  context: MonitorContext,
  view: ParticipantViewRow,
): Promise<ParticipantMonitor> {
  const pool = getPool();
  const metrics = await loadJourneyMetrics(pool, view.userId);
  const readiness: ReadinessSnapshot = await computeReadinessFromMetrics(pool, metrics);

  const tasks = metrics.currentRoadmap?.tasks ?? [];
  const roadmapProgress = calculateRoadmapProgress({
    completedTasks: tasks.filter((t) => t.status === 'COMPLETED').length,
    totalTasks: tasks.length,
  });

  const challengeProgress = calculateChallengeProgress({
    passedChallenges: metrics.passedChallengeIds.size,
    availableChallenges: metrics.availableChallenges.length,
  });

  const expectedProgress = calculateExpectedProgress({
    startDate: context.program.startDate,
    endDate: context.program.endDate,
    now: context.now,
  });

  const status = determineParticipantStatus({
    lastActivityAt: view.lastActivityAt,
    expectedProgress,
    roadmapProgress,
    now: context.now,
  });

  return {
    id: view.userId,
    name: `${view.firstName} ${view.lastName}`.trim(),
    joinedAt: view.joinedAt,
    lastActivityAt: view.lastActivityAt,
    status,
    currentCareerGoal: metrics.targetCareerName,
    readinessScore: readiness.score,
    readinessLabel: readiness.label,
    roadmapProgress,
    hasRoadmap: metrics.currentRoadmap !== null,
    challengeProgress,
    assessmentCompleted: metrics.assessmentCount >= 1,
    skillsDeveloped: metrics.userSkills.length,
    skillIds: metrics.userSkills.map((s) => s.skillId),
    evidenceCount: metrics.evidenceCount,
    hasPassport: metrics.hasPassport,
    challengesCompleted: metrics.passedChallengeIds.size,
  };
}