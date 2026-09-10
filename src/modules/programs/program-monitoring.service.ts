import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { roundScore } from '../../lib/scoring/ai-impact.js';
import { hasRecentActivity, type ParticipantStatus } from '../../lib/scoring/participant-status.js';
import { isProgramParticipant } from '../../models/program.model.js';
import { getPool } from '../../lib/db.js';
import { buildOneParticipantMonitor, buildParticipantMonitors, type ParticipantMonitor } from './program-monitor.js';
import type { ProgramService } from './program.service.js';
import type { MonitorContext } from './program-monitor.js';

/**
 * Program monitoring, analytics and reports (docs/PRODUCT_SPEC.md §28–§30,
 * docs/SCORING_LOGIC.md §36–§47, docs/API_CONTRACT.md §39–§41).
 *
 * Every metric is derived from persisted source records using the same scoring
 * functions as the participant dashboard. Aggregate numbers are computed here
 * in the service layer with documented empty-data rules (zero participants →
 * zero percentages, never a division-by-zero).
 */

export interface ParticipantMonitorDetail {
  id: string;
  name: string;
  joinedAt: Date;
  lastActivityAt: Date;
  status: ParticipantStatus;
  currentCareerGoal: string | null;
  readinessScore: number;
  readinessLabel: string;
  roadmapProgress: number;
  challengeProgress: number;
  assessmentCompleted: boolean;
  skillsDeveloped: number;
  evidenceCount: number;
  hasPassport: boolean;
}

export interface ProgramAnalytics {
  totalParticipants: number;
  activeParticipants: number;
  assessmentCompletion: number;
  averageReadiness: number;
  averageRoadmapProgress: number;
  challengesCompleted: number;
  evidenceCreated: number;
  passportsCreated: number;
}

export interface ProgramReport {
  program: { id: string; name: string };
  participants: number;
  participationRate: number;
  assessmentCompletion: number;
  averageReadiness: number;
  averageRoadmapProgress: number;
  skillsDeveloped: number;
  challengesCompleted: number;
  evidenceCreated: number;
  passportsCreated: number;
  statusDistribution: Record<ParticipantStatus, number>;
}

export class ProgramMonitoringService {
  constructor(private readonly programs: ProgramService) {}

  /** Detailed progress for one participant in a program (docs/API_CONTRACT.md §39). */
  async getParticipantDetail(
    userId: string,
    programId: string,
    participantId: string,
  ): Promise<ParticipantMonitorDetail> {
    const context = await this.programs.loadMonitorContext(userId, programId);
    if (!(await isProgramParticipant(getPool(), programId, participantId))) {
      throw new AppError(
        errorCodes.RESOURCE_NOT_FOUND,
        'Participant not found in this program.',
        404,
      );
    }
    const view = context.views.find((row) => row.userId === participantId);
    if (view === undefined) {
      throw new AppError(
        errorCodes.RESOURCE_NOT_FOUND,
        'Participant not found in this program.',
        404,
      );
    }
    const monitor = await buildOneParticipantMonitor(context, view);
    return toDetail(monitor);
  }

  /** Aggregate program analytics (docs/SCORING_LOGIC.md §42–§47, docs/API_CONTRACT.md §40). */
  async getAnalytics(userId: string, programId: string): Promise<ProgramAnalytics> {
    const context = await this.programs.loadMonitorContext(userId, programId);
    const monitors = await buildParticipantMonitors(context);
    return aggregateAnalytics(monitors, context);
  }

  /** Program impact report (docs/PRODUCT_SPEC.md §30, docs/API_CONTRACT.md §41). */
  async getReport(userId: string, programId: string): Promise<ProgramReport> {
    const context = await this.programs.loadMonitorContext(userId, programId);
    const monitors = await buildParticipantMonitors(context);
    const analytics = aggregateAnalytics(monitors, context);

    const skillIds = new Set<string>();
    for (const monitor of monitors) {
      for (const id of monitor.skillIds) {
        skillIds.add(id);
      }
    }

    const statusDistribution: Record<ParticipantStatus, number> = {
      ON_TRACK: 0,
      NEEDS_ATTENTION: 0,
      AT_RISK: 0,
    };
    for (const monitor of monitors) {
      statusDistribution[monitor.status] += 1;
    }

    return {
      program: { id: context.program.id, name: context.program.name },
      participants: analytics.totalParticipants,
      participationRate: percentage(analytics.activeParticipants, analytics.totalParticipants),
      assessmentCompletion: analytics.assessmentCompletion,
      averageReadiness: analytics.averageReadiness,
      averageRoadmapProgress: analytics.averageRoadmapProgress,
      skillsDeveloped: skillIds.size,
      challengesCompleted: analytics.challengesCompleted,
      evidenceCreated: analytics.evidenceCreated,
      passportsCreated: analytics.passportsCreated,
      statusDistribution,
    };
  }
}

function toDetail(monitor: ParticipantMonitor): ParticipantMonitorDetail {
  return {
    id: monitor.id,
    name: monitor.name,
    joinedAt: monitor.joinedAt,
    lastActivityAt: monitor.lastActivityAt,
    status: monitor.status,
    currentCareerGoal: monitor.currentCareerGoal,
    readinessScore: monitor.readinessScore,
    readinessLabel: monitor.readinessLabel,
    roadmapProgress: monitor.roadmapProgress,
    challengeProgress: monitor.challengeProgress,
    assessmentCompleted: monitor.assessmentCompleted,
    skillsDeveloped: monitor.skillsDeveloped,
    evidenceCount: monitor.evidenceCount,
    hasPassport: monitor.hasPassport,
  };
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return roundScore((numerator / denominator) * 100);
}

/**
 * Aggregates participant monitors into the documented analytics shape
 * (docs/SCORING_LOGIC.md §42–§47). Empty-data rules:
 *  - zero participants → every percentage is 0
 *  - average readiness is only over participants with a completed AI assessment
 *    (a readiness score is not treated as an implicit zero, §45)
 *  - average roadmap progress is only over participants with an active roadmap
 *    (no roadmap is not treated as 0%, §46)
 */
export function aggregateAnalytics(
  monitors: readonly ParticipantMonitor[],
  context: Pick<MonitorContext, 'now'>,
): ProgramAnalytics {
  const total = monitors.length;

  const active = monitors.filter((m) => hasRecentActivity(m.lastActivityAt, context.now)).length;
  const withAssessment = monitors.filter((m) => m.assessmentCompleted).length;
  const scored = monitors.filter((m) => m.assessmentCompleted);
  const withRoadmap = monitors.filter((m) => m.hasRoadmap);

  const averageReadiness = scored.length === 0
    ? 0
    : roundScore(scored.reduce((sum, m) => sum + m.readinessScore, 0) / scored.length);
  const averageRoadmapProgress = withRoadmap.length === 0
    ? 0
    : roundScore(withRoadmap.reduce((sum, m) => sum + m.roadmapProgress, 0) / withRoadmap.length);

  return {
    totalParticipants: total,
    activeParticipants: active,
    assessmentCompletion: percentage(withAssessment, total),
    averageReadiness,
    averageRoadmapProgress,
    challengesCompleted: monitors.reduce((sum, m) => sum + m.challengesCompleted, 0),
    evidenceCreated: monitors.reduce((sum, m) => sum + m.evidenceCount, 0),
    passportsCreated: monitors.filter((m) => m.hasPassport).length,
  };
}