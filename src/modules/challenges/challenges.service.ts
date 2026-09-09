import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool, withTransaction } from '../../lib/db.js';
import { evaluateChallengeSubmission, findChallengeSpec } from '../../lib/challenges/challenge-evaluator.js';
import {
  attachSkills,
  findChallengeById,
  listChallenges as listChallengesInDb,
  listChallengeSkills,
  type ChallengeDifficulty,
} from '../../models/challenge.model.js';
import {
  insertSubmission,
  listLatestSubmissions,
  type SubmissionStatus,
} from '../../models/challenge-submission.model.js';
import { insertEvidence } from '../../models/evidence.model.js';
import { upsertUserSkill } from '../../models/user-skill.model.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import type { AchievementService } from '../achievements/achievements.service.js';

export interface ChallengeListItem {
  id: string;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  skills: Array<{ skillId: string; skillName: string }>;
  latestAttempt: { status: SubmissionStatus; score: number | null; submittedAt: Date } | null;
}

export interface SubmitChallengeResult {
  submissionId: string;
  status: SubmissionStatus;
  score: number;
  feedback: string;
  evidenceCreated: number;
}

export class ChallengeService {
  constructor(private readonly achievements: AchievementService) {}

  async list(
    userId: string,
    filters: { skillId?: string; difficulty?: ChallengeDifficulty } = {},
  ): Promise<ChallengeListItem[]> {
    const challenges = await listChallengesInDb(getPool(), filters);
    if (challenges.length === 0) {
      return [];
    }
    const skillRows = await listChallengeSkills(getPool(), challenges.map((c) => c.id));
    const latestAttempts = await listLatestSubmissions(getPool(), userId);
    const byChallenge = new Map(latestAttempts.map((a) => [a.challengeId, a]));

    return attachSkills(challenges, skillRows).map((challenge) => {
      const attempt = byChallenge.get(challenge.id);
      return {
        ...challenge,
        latestAttempt:
          attempt === undefined
            ? null
            : { status: attempt.status, score: attempt.score, submittedAt: attempt.submittedAt },
      };
    });
  }

  async getById(userId: string, challengeId: string): Promise<ChallengeListItem> {
    const challenge = await findChallengeById(getPool(), challengeId);
    if (challenge === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Challenge not found', 404);
    }
    const skillRows = await listChallengeSkills(getPool(), [challenge.id]);
    const attempt = (await listLatestSubmissions(getPool(), userId)).find(
      (a) => a.challengeId === challenge.id,
    );
    const [item] = attachSkills([challenge], skillRows);
    if (item === undefined) {
      throw new AppError(errorCodes.INTERNAL_SERVER_ERROR, 'Could not load challenge.', 500);
    }
    return {
      ...item,
      latestAttempt:
        attempt === undefined
          ? null
          : { status: attempt.status, score: attempt.score, submittedAt: attempt.submittedAt },
    };
  }

  /**
   * Submits a challenge answer. Flow (docs/API_CONTRACT.md §27):
   * validate -> evaluate deterministically -> score -> pass/fail -> persist ->
   * create evidence when appropriate -> award achievements. The AI never
   * overrides the deterministic score (docs/AI_SPEC.md §22).
   */
  async submit(
    userId: string,
    challengeId: string,
    answer: Record<string, unknown>,
  ): Promise<SubmitChallengeResult> {
    const challenge = await findChallengeById(getPool(), challengeId);
    if (challenge === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Challenge not found', 404);
    }
    const spec = findChallengeSpec(challenge.title);
    if (spec === null) {
      throw new AppError(
        errorCodes.RESOURCE_NOT_FOUND,
        'This challenge does not support submissions yet.',
        404,
      );
    }
    const validatedAnswer = parseOrThrow(spec.answerSchema, answer);

    const result = evaluateChallengeSubmission(challenge, validatedAnswer);

    return withTransaction(async (client) => {
      const submission = await insertSubmission(client, {
        challengeId,
        userId,
        answer: validatedAnswer as Record<string, unknown>,
        score: result.score,
        status: result.passed ? 'PASSED' : 'FAILED',
        feedback: result.feedback,
      });

      let evidenceCreated = 0;
      if (result.passed) {
        const skills = await listChallengeSkills(client, [challenge.id]);
        for (const skill of skills) {
          await upsertUserSkill(client, {
            userId,
            skillId: skill.skillId,
            source: 'CHALLENGE',
            confidence: 1,
            proficiency: 0.8,
          });
          const evidence = await insertEvidence(client, {
            userId,
            challengeId: challenge.id,
            skillId: skill.skillId,
            title: challenge.title,
            description: challenge.description,
            result: `PASSED (${result.score}/100)`,
            status: 'PENDING',
          });
          if (evidence !== null) {
            evidenceCreated += 1;
          }
        }
      }

      return {
        submissionId: submission.id,
        status: submission.status,
        score: result.score,
        feedback: result.feedback,
        evidenceCreated,
      };
    }).then(async (outcome) => {
      await this.achievements.evaluateAndAward(userId);
      return outcome;
    });
  }
}