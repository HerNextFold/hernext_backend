import { getPool, withTransaction } from '../../lib/db.js';
import { evaluateAchievementCodes, type AchievementEvaluationState } from '../../lib/scoring/achievements.js';
import {
  listAchievementCodes,
  listAchievementsWithEarned,
  grantAchievementIfNotEarned,
} from '../../models/achievement.model.js';
import {
  loadJourneyMetrics,
  phaseStats,
  type JourneyMetrics,
} from '../../models/progress.model.js';

function buildEvaluationState(metrics: JourneyMetrics): AchievementEvaluationState {
  const latest = metrics.currentRoadmap?.tasks ?? [];
  const day30 = phaseStats(latest, 'DAY_30');
  return {
    hasCareerProfile: metrics.hasCareerProfile,
    assessmentCount: metrics.assessmentCount,
    userSkillCount: metrics.userSkills.length,
    passedChallengeCount: metrics.passedChallengeIds.size,
    evidenceCount: metrics.evidenceCount,
    day30TotalTasks: day30.total,
    day30CompletedTasks: day30.completed,
    roadmapTotalTasks: latest.length,
    roadmapCompletedTasks: latest.filter((t) => t.status === 'COMPLETED').length,
    hasPassport: metrics.hasPassport,
  };
}

/** Maps a stable code to a human "milestone" name for newly-awarded results. */
const CODE_TO_NAME: Record<string, string> = {
  PROFILE_COMPLETED: 'Profile Completed',
  ASSESSMENT_COMPLETED: 'Career Impact Assessment Completed',
  FIRST_SKILL_DISCOVERED: 'First Skill Discovered',
  FIRST_CHALLENGE_COMPLETED: 'First Challenge Completed',
  FIRST_EVIDENCE_CREATED: 'First Evidence Added',
  '30_DAY_GOAL_COMPLETED': '30-Day Goal Completed',
  ROADMAP_COMPLETED: 'Roadmap Completed',
  PASSPORT_READY: 'Career Passport Ready',
};

export interface AchievementsResponse {
  achievements: Array<{
    name: string;
    description: string;
    earned: boolean;
    earnedAt: Date | null;
  }>;
  newlyEarned: string[];
}

export class AchievementService {
  /**
   * Evaluates the documented achievement criteria against the participant's
   * real records and awards any newly-satisfied achievements. Awarding runs in
   * a transaction keyed by the unique (userId, achievementId) constraint, so it
   * is deterministic and idempotent - re-running never creates duplicates
   * (docs/SCORING_LOGIC.md §33).
   */
  async evaluateAndAward(userId: string): Promise<string[]> {
    return withTransaction(async (client) => {
      const codes = await listAchievementCodes(client);
      // Read journey metrics from the pool, not the transaction client.
      // loadJourneyMetrics fires ~11 queries concurrently (progress.model.ts),
      // which would overlap on a single transaction client and serialise badly.
      // Achievement awarding itself stays transactional and idempotent.
      const metrics = await loadJourneyMetrics(getPool(), userId);
      const earnedCodes = evaluateAchievementCodes({
        codes,
        state: buildEvaluationState(metrics),
      });
      if (earnedCodes.length === 0) {
        return [];
      }

      const catalogue = await listAchievementsWithEarned(client, userId);
      const newlyEarned: string[] = [];
      for (const achievement of catalogue) {
        if (
          achievement.code !== null &&
          !achievement.earned &&
          earnedCodes.includes(achievement.code)
        ) {
          const inserted = await grantAchievementIfNotEarned(client, userId, achievement.id);
          if (inserted) {
            newlyEarned.push(CODE_TO_NAME[achievement.code] ?? achievement.name);
          }
        }
      }
      return newlyEarned;
    });
  }

  /** Returns every catalogue achievement with the user's earn state. */
  async listForUser(userId: string): Promise<AchievementsResponse['achievements']> {
    const rows = await listAchievementsWithEarned(getPool(), userId);
    return rows.map((a) => ({
      name: a.name,
      description: a.description,
      earned: a.earned,
      earnedAt: a.earnedAt,
    }));
  }
}