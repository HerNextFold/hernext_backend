import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool, withTransaction } from '../../lib/db.js';
import {
  calculateChallengeProgress,
  calculateOverallProgress,
  calculatePhaseProgress,
  calculateRoadmapProgress,
} from '../../lib/scoring/progress.js';
import { computeReadinessFromMetrics } from '../../lib/scoring/readiness-orchestrator.js';
import { selectNextAction, type NextAction } from '../../lib/scoring/next-action.js';
import {
  findOwnedTask,
  findTasksForTask,
  updateTaskStatus,
  type RoadmapTaskStatus,
} from '../../models/roadmap.model.js';
import {
  loadJourneyMetrics,
  phaseStats,
  type JourneyMetrics,
} from '../../models/progress.model.js';
import type { AchievementService } from '../achievements/achievements.service.js';

const TOTAL_JOURNEY_STAGES = 9;

export interface UpdateTaskResult {
  taskId: string;
  status: RoadmapTaskStatus;
  completedAt: Date | null;
  roadmapProgress: number;
  phaseProgress: Record<string, number>;
}

export interface ProgressResponse {
  overallProgress: number;
  roadmapProgress: number;
  challengeProgress: number;
  evidenceCount: number;
  skillsDeveloped: number;
  skillsRemaining: number;
  readinessScore: number;
  readinessLabel: string;
}

export interface ProgressSummaryResponse {
  currentCareerGoal: string | null;
  careerReadiness: number;
  readinessLabel: string;
  readinessBreakdown: {
    experience: number;
    skills: number;
    aiReadiness: number;
    evidence: number;
  };
  roadmapProgress: number;
  aiImpact: { score: number; level: string } | null;
  skillsDeveloped: number;
  skillsRemaining: number;
  challengesCompleted: number;
  evidenceCreated: number;
}

export class ProgressService {
  constructor(private readonly achievements: AchievementService) {}

  async getProgress(userId: string): Promise<ProgressResponse> {
    const metrics = await loadJourneyMetrics(getPool(), userId);
    const progress = this.deriveProgress(metrics);
    const readiness = await computeReadinessFromMetrics(getPool(), metrics);
    return {
      overallProgress: progress.overallProgress,
      roadmapProgress: progress.roadmapProgress,
      challengeProgress: progress.challengeProgress,
      evidenceCount: metrics.evidenceCount,
      skillsDeveloped: metrics.userSkills.length,
      skillsRemaining: metrics.skillGapCountForTarget,
      readinessScore: readiness.score,
      readinessLabel: readiness.label,
    };
  }

  async getSummary(userId: string): Promise<ProgressSummaryResponse> {
    const metrics = await loadJourneyMetrics(getPool(), userId);
    const progress = this.deriveProgress(metrics);
    const readiness = await computeReadinessFromMetrics(getPool(), metrics);
    return {
      currentCareerGoal: metrics.targetCareerName,
      careerReadiness: readiness.score,
      readinessLabel: readiness.label,
      readinessBreakdown: {
        experience: readiness.breakdown.experience,
        skills: readiness.breakdown.skills,
        aiReadiness: readiness.breakdown.aiReadiness,
        evidence: readiness.breakdown.evidence,
      },
      roadmapProgress: progress.roadmapProgress,
      aiImpact: metrics.latestAiImpact
        ? { score: metrics.latestAiImpact.score, level: metrics.latestAiImpact.level }
        : null,
      skillsDeveloped: metrics.userSkills.length,
      skillsRemaining: metrics.skillGapCountForTarget,
      challengesCompleted: metrics.passedChallengeIds.size,
      evidenceCreated: metrics.evidenceCount,
    };
  }

  async getNextAction(userId: string): Promise<NextAction> {
    const metrics = await loadJourneyMetrics(getPool(), userId);
    return selectNextAction(this.buildNextActionState(metrics));
  }

  /**
   * Updates a roadmap task's status (ownership enforced), then recomputes
   * roadmap and phase progress from the underlying tasks, so the response is
   * always derived from source records (docs/API_CONTRACT.md §21).
   */
  async updateTask(userId: string, taskId: string, status: RoadmapTaskStatus): Promise<UpdateTaskResult> {
    return withTransaction(async (client) => {
      const task = await findOwnedTask(client, taskId, userId);
      if (task === null) {
        throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Roadmap task not found', 404);
      }

      const updated = await updateTaskStatus(client, taskId, userId, status);
      if (updated === null) {
        throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Roadmap task not found', 404);
      }

      const tasks = await findTasksForTask(client, taskId, userId);
      const all = tasks ?? [];
      const roadmapProgress = calculateRoadmapProgress({
        completedTasks: all.filter((t) => t.status === 'COMPLETED').length,
        totalTasks: all.length,
      });

      const phaseProgress: Record<string, number> = {};
      for (const phase of ['DAY_30', 'DAY_60', 'DAY_90'] as const) {
        const stats = phaseStats(all, phase);
        phaseProgress[phase] = calculatePhaseProgress({
          completedTasks: stats.completed,
          totalTasks: stats.total,
        });
      }

      return {
        taskId: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
        roadmapProgress,
        phaseProgress,
      };
    }).then(async (result) => {
      await this.achievements.evaluateAndAward(userId);
      return result;
    });
  }

  private deriveProgress(metrics: JourneyMetrics): {
    overallProgress: number;
    roadmapProgress: number;
    challengeProgress: number;
  } {
    const tasks = metrics.currentRoadmap?.tasks ?? [];
    const roadmapProgress = calculateRoadmapProgress({
      completedTasks: tasks.filter((t) => t.status === 'COMPLETED').length,
      totalTasks: tasks.length,
    });
    const challengeProgress = calculateChallengeProgress({
      passedChallenges: metrics.passedChallengeIds.size,
      availableChallenges: metrics.availableChallenges.length,
    });

    const completedStages = [
      metrics.hasCareerProfile,
      metrics.assessmentCount >= 1,
      metrics.transferableSkillCount >= 1,
      metrics.targetCareerId !== null,
      metrics.skillGapCountForTarget > 0,
      metrics.currentRoadmap !== null,
      metrics.passedChallengeIds.size > 0,
      metrics.evidenceCount > 0,
      metrics.hasPassport,
    ].filter(Boolean).length;

    const overallProgress = calculateOverallProgress({
      completedStages,
      totalStages: TOTAL_JOURNEY_STAGES,
    });
    return { overallProgress, roadmapProgress, challengeProgress };
  }

  private buildNextActionState(metrics: JourneyMetrics) {
    const tasks = metrics.currentRoadmap?.tasks ?? [];
    const firstIncomplete = tasks.find((t) => t.status !== 'COMPLETED') ?? null;
    const passed = new Set(metrics.passedChallengeIds);
    const recommendedChallenge =
      metrics.availableChallenges.find((c) => !passed.has(c.id)) ?? null;

    return {
      hasCareerProfile: metrics.hasCareerProfile,
      experienceCount: metrics.experienceCount,
      assessmentCount: metrics.assessmentCount,
      transferableSkillCount: metrics.transferableSkillCount,
      hasTargetCareer: metrics.targetCareerId !== null,
      targetSkillGapCount: metrics.skillGapCountForTarget,
      firstIncompleteTask: firstIncomplete
        ? { id: firstIncomplete.id, title: firstIncomplete.title }
        : null,
      recommendedChallenge: recommendedChallenge
        ? { id: recommendedChallenge.id, title: recommendedChallenge.title }
        : null,
      evidenceCount: metrics.evidenceCount,
      hasPassport: metrics.hasPassport,
    };
  }
}