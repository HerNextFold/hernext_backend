import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool, withTransaction } from '../../lib/db.js';
import { calculateAiImpactScore, impactLevelForScore } from '../../lib/scoring/ai-impact.js';
import {
  calculateSkillMatchScore,
  calculateExperienceMatchScore,
  calculateCareerMatchScore,
  calculateAiReadinessScore,
  calculateCareerInterestScore,
} from '../../lib/scoring/career-match.js';
import { computeSkillGaps, missingSkills } from '../../lib/scoring/skill-gap.js';
import { findOwnedExperience, listExperiences } from '../../models/experience.model.js';
import { findCareerProfileByUserId } from '../../models/career-profile.model.js';
import {
  assertCareerExists,
  findCareerWithSkills,
  listCareers,
  listSkills,
} from '../../models/catalogue.model.js';
import {
  insertCareerAnalysis,
  replaceTransferableSkills,
  listTransferableSkills,
  findLatestAnalysis,
  type CareerAnalysisRow,
} from '../../models/ai.model.js';
import {
  replaceCareerRecommendations,
  replaceSkillGaps,
  listCareerRecommendationsWithName,
  listSkillGapsWithNames,
} from '../../models/careers.model.js';
import { upsertUserSkill, listUserSkillsWithNames } from '../../models/user-skill.model.js';
import {
  findCurrentRoadmapWithTasks,
  groupTasksByPhase,
  insertRoadmap,
  insertRoadmapTask,
  type RoadmapPhase,
  type RoadmapWithTasks,
} from '../../models/roadmap.model.js';
import { LLMProviderError, type LLMProvider } from './providers/llm.provider.js';
import { buildCareerImpactPrompt } from './prompts/career-impact.prompt.js';
import { buildTransferableSkillsPrompt } from './prompts/transferable-skills.prompt.js';
import { buildRoadmapPrompt } from './prompts/roadmap.prompt.js';
import {
  careerImpactOutputSchema,
  transferableSkillsOutputSchema,
  roadmapOutputSchema,
  type CareerImpactOutput,
  type TransferableSkillsOutput,
  type RoadmapOutput,
} from './ai.schemas.js';
import { connectProfileWithExperience } from './ai.util.js';

const MAX_AI_RETRIES = 1;

export interface CareerImpactResponse {
  id: string;
  experienceId: string;
  aiImpactScore: number;
  impactLevel: string;
  automationTasks: string[];
  augmentedTasks: string[];
  humanStrengths: string[];
  emergingSkills: string[];
  explanation: string;
  createdAt: Date;
}

export interface TransferableSkillResponse {
  skillId: string;
  skillName: string | null;
  reason: string;
  confidence: number;
}

export interface CareerRecommendationResponse {
  careerId: string;
  careerName: string;
  matchScore: number;
  rank: number;
  reason: string;
}

export interface RoadmapResponse {
  roadmap: {
    id: string;
    careerPathId: string;
    title: string;
    description: string;
    createdAt: Date;
  };
  phases: Record<RoadmapPhase, Array<Record<string, unknown>>>;
}

function aiFailure(_error: LLMProviderError): never {
  // Every call site classifies AppError before delegating here, so the failure
  // is always a provider error. We map it to a safe 503 and deliberately do
  // not surface provider internals or API keys (docs/SECURITY_SPEC.md §24).
  throw new AppError(
    errorCodes.AI_SERVICE_ERROR,
    'AI intelligence is temporarily unavailable. Please try again shortly.',
    503,
  );
}

export class AiService {
  constructor(private readonly provider: LLMProvider) {}

  async runCareerImpact(userId: string, experienceId: string): Promise<CareerImpactResponse> {
    const existing = await findLatestAnalysis(getPool(), userId, experienceId);
    if (existing) {
      return toCareerImpactResponse(existing);
    }

    const experience = await findOwnedExperience(getPool(), experienceId, userId);
    if (experience === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Experience not found', 404);
    }
    const profile = await findCareerProfileByUserId(getPool(), userId);
    const context = await connectProfileWithExperience(profile, experience);

    let output: CareerImpactOutput;
    try {
      const { system, user } = buildCareerImpactPrompt(context);
      const raw = await this.callWithRetry({ system, user });
      output = careerImpactOutputSchema.parse(raw);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof LLMProviderError) throw aiFailure(error);
      throw new AppError(errorCodes.AI_OUTPUT_INVALID, 'The AI returned an unreadable response. Please try again.', 422);
    }

    const score = calculateAiImpactScore({
      automationCount: output.automationTasks.length,
      augmentedCount: output.augmentedTasks.length,
      humanCount: output.humanStrengths.length,
    });
    const impactLevel = impactLevelForScore(score);

    const saved = await withTransaction((client) =>
      insertCareerAnalysis(client, {
        userId,
        experienceId,
        aiImpactScore: score,
        impactLevel,
        automationTasks: output.automationTasks,
        augmentedTasks: output.augmentedTasks,
        humanStrengths: output.humanStrengths,
        emergingSkills: output.emergingSkills,
        explanation: output.explanation,
      }),
    );

    return toCareerImpactResponse(saved);
  }

  async runTransferableSkills(userId: string, experienceId: string): Promise<TransferableSkillResponse[]> {
    const experience = await findOwnedExperience(getPool(), experienceId, userId);
    if (experience === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Experience not found', 404);
    }
    const profile = await findCareerProfileByUserId(getPool(), userId);
    const context = await connectProfileWithExperience(profile, experience);

    const skills = await listSkills(getPool());
    const byId = new Map(skills.map((s) => [s.id, s.name]));
    const idsBySkillName = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));

    let parsed: TransferableSkillsOutput;
    try {
      const { system, user } = buildTransferableSkillsPrompt({
        ...context,
        skillCatalogue: [...new Set(skills.map((s) => s.name))],
      });
      const raw = await this.callWithRetry({ system, user });
      parsed = transferableSkillsOutputSchema.parse(raw);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof LLMProviderError) throw aiFailure(error);
      throw new AppError(errorCodes.AI_OUTPUT_INVALID, 'The AI returned an unreadable response. Please try again.', 422);
    }

    const resolved = parsed.skills
      .map((item) => ({
        skillId: idsBySkillName.get(item.skillName.toLowerCase()) ?? null,
        skillName: item.skillName,
        reason: item.reason,
        confidence: item.confidence,
      }))
      .filter((item): item is { skillId: string; skillName: string; reason: string; confidence: number } => item.skillId !== null);

    await withTransaction(async (client) => {
      await replaceTransferableSkills(
        client,
        userId,
        experienceId,
        resolved.map((item) => ({ skillId: item.skillId, reason: item.reason, confidence: item.confidence })),
      );
      for (const item of resolved) {
        await upsertUserSkill(client, {
          userId,
          skillId: item.skillId,
          source: 'AI_DERIVED',
          confidence: item.confidence,
          proficiency: item.confidence,
        });
      }
    });

    return resolved.map((item) => ({
      skillId: item.skillId,
      skillName: byId.get(item.skillId) ?? null,
      reason: item.reason,
      confidence: item.confidence,
    }));
  }

  async runCareerRecommendations(userId: string): Promise<CareerRecommendationResponse[]> {
    const userSkills = await listUserSkillsWithNames(getPool(), userId);
    const userSkillIds = new Set(userSkills.map((s) => s.skillId));
    const profile = await findCareerProfileByUserId(getPool(), userId);
    const experiences = await listExperiences(getPool(), userId);

    // Relevant experience duration comes from real user-provided records: the
    // declared years on each experience plus the career profile's total. We
    // prefer actual user-provided values over any heuristic (docs/AI_SPEC.md §18).
    const relevantYears = totalExperienceYears(profile?.yearsOfExperience ?? null, experiences);

    const careers = await listCareers(getPool());
    const results: Array<{ careerPathId: string; matchScore: number; reason: string }> = [];
    for (const career of careers) {
      const withSkills = await findCareerWithSkills(getPool(), career.id);
      if (withSkills === null || withSkills.skills.length === 0) {
        continue;
      }
      const skillMatch = calculateSkillMatchScore({
        careerSkills: withSkills.skills.map((s) => ({ skillId: s.skillId, importance: s.importance })),
        userSkillIds,
      });
      const experienceMatch = calculateExperienceMatchScore({
        hasRelevantExperience: relevantYears > 0,
        relevantYears,
      });
      const interest = calculateCareerInterestScore(profile?.targetCareerId === career.id ? 100 : 0);
      const aiReadiness = calculateAiReadinessScore({
        relevantSkillCoverage: skillMatch,
        aiRoadmapCompletion: undefined,
      });
      const matchScore = calculateCareerMatchScore({
        skillMatch,
        experienceMatch,
        careerInterest: interest,
        aiReadiness,
      });
      results.push({
        careerPathId: career.id,
        matchScore,
        reason: this.buildRecommendationReason(career.name, skillMatch, experienceMatch),
      });
    }

    const ranked = results
      .sort((a, b) => b.matchScore - a.matchScore)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    await replaceCareerRecommendations(getPool(), userId, ranked);

    const stored = await listCareerRecommendationsWithName(getPool(), userId);
    return stored.map((item) => ({
      careerId: item.careerId,
      careerName: item.careerName,
      matchScore: item.matchScore,
      rank: item.rank,
      reason: item.reason,
    }));
  }

  async runSkillGaps(userId: string, careerPathId: string): Promise<unknown> {
    await assertCareerExists(getPool(), careerPathId);
    const withSkills = await findCareerWithSkills(getPool(), careerPathId);
    if (withSkills === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Career not found', 404);
    }
    const userSkills = await listUserSkillsWithNames(getPool(), userId);
    const userSkillIds = new Set(userSkills.map((s) => s.skillId));

    const gaps = computeSkillGaps({
      careerSkills: withSkills.skills.map((s) => ({
        skillId: s.skillId,
        skillName: s.skillName,
        importance: s.importance,
      })),
      userSkillIds,
    });

    await replaceSkillGaps(
      getPool(),
      userId,
      careerPathId,
      gaps.map((g) => ({ skillId: g.skillId, status: g.status, priority: g.priority, reason: null })),
    );

    const stored = await listSkillGapsWithNames(getPool(), userId, careerPathId);
    return {
      careerId: careerPathId,
      careerName: withSkills.career.name,
      gaps: stored,
    };
  }

  async runRoadmap(userId: string, careerPathId: string): Promise<RoadmapResponse> {
    const withSkills = await findCareerWithSkills(getPool(), careerPathId);
    if (withSkills === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Career not found', 404);
    }
    const userSkills = await listUserSkillsWithNames(getPool(), userId);
    const userSkillIds = new Set(userSkills.map((s) => s.skillId));

    const gaps = missingSkills(
      computeSkillGaps({
        careerSkills: withSkills.skills.map((s) => ({
          skillId: s.skillId,
          skillName: s.skillName,
          importance: s.importance,
        })),
        userSkillIds,
      }),
    );
    if (gaps.length === 0) {
      throw new AppError(errorCodes.RESOURCE_ALREADY_EXISTS, 'You already have all the skills for this career.', 409);
    }

    const profile = await findCareerProfileByUserId(getPool(), userId);
    const skills = await listSkills(getPool());
    const idByName = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));

    let parsed: RoadmapOutput;
    try {
      const { system, user } = buildRoadmapPrompt({
        careerName: withSkills.career.name,
        careerDescription: withSkills.career.description,
        missingSkills: gaps.map((g) => ({ name: g.skillName, priority: g.priority })),
        currentSkills: userSkills.map((s) => s.skillName),
        occupation: profile?.currentOccupation ?? '',
      });
      const raw = await this.callWithRetry({ system, user });
      parsed = roadmapOutputSchema.parse(raw);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof LLMProviderError) throw aiFailure(error);
      throw new AppError(errorCodes.AI_OUTPUT_INVALID, 'The AI returned an unreadable response. Please try again.', 422);
    }

    const phaseMap: Record<'30' | '60' | '90', RoadmapPhase> = { 30: 'DAY_30', 60: 'DAY_60', 90: 'DAY_90' };

    const roadmap = await withTransaction(async (client) => {
      const created = await insertRoadmap(client, {
        userId,
        careerPathId,
        title: parsed.title,
        description: parsed.description,
      });
      for (const phase of ['30', '60', '90'] as const) {
        const tasks = parsed.phases[phase] ?? [];
        let order = 1;
        for (const task of tasks) {
          await insertRoadmapTask(client, {
            roadmapId: created.id,
            phase: phaseMap[phase],
            title: task.title,
            description: task.description,
            skillId: idByName.get(task.skillName.toLowerCase()) ?? null,
            estimatedMinutes: task.estimatedMinutes ?? null,
            order,
          });
          order += 1;
        }
      }
      return created;
    });

    const full = await findCurrentRoadmapWithTasks(getPool(), userId);
    return buildRoadmapResponse(roadmap.id, full);
  }

  async getRoadmap(userId: string): Promise<RoadmapResponse> {
    const full = await findCurrentRoadmapWithTasks(getPool(), userId);
    return buildRoadmapResponse(full.roadmap.id, full);
  }

  async getCareerImpact(userId: string, experienceId: string): Promise<CareerImpactResponse> {
    const latest = await findLatestAnalysis(getPool(), userId, experienceId);
    if (latest === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'No assessment found for this experience.', 404);
    }
    return toCareerImpactResponse(latest);
  }

  async getTransferableSkills(userId: string): Promise<TransferableSkillResponse[]> {
    const skills = await listSkills(getPool());
    const byId = new Map(skills.map((s) => [s.id, s.name]));
    const stored = await listTransferableSkills(getPool(), userId);
    return stored.map((item) => ({
      skillId: item.skillId,
      skillName: byId.get(item.skillId) ?? null,
      reason: item.reason,
      confidence: item.confidence,
    }));
  }

  private async callWithRetry(input: { system: string; user: string }): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_AI_RETRIES; attempt++) {
      try {
        return await this.provider.completeStructured(input);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof LLMProviderError && error.retryable && attempt < MAX_AI_RETRIES;
        if (!retryable) {
          break;
        }
      }
    }
    throw lastError;
  }

  private buildRecommendationReason(name: string, skillMatch: number, experienceMatch: number): string {
    if (skillMatch >= 60) {
      return `You already have many of the core skills needed for ${name}.`;
    }
    if (experienceMatch >= 40) {
      return `Your experience is relevant to ${name}; developing a few more skills will strengthen your fit.`;
    }
    return `These are the next best-fit careers based on your current skills.`;
  }
}

function toCareerImpactResponse(row: CareerAnalysisRow): CareerImpactResponse {
  return {
    id: row.id,
    experienceId: row.experienceId,
    aiImpactScore: row.aiImpactScore,
    impactLevel: row.impactLevel,
    automationTasks: row.automationTasks,
    augmentedTasks: row.augmentedTasks,
    humanStrengths: row.humanStrengths,
    emergingSkills: row.emergingSkills,
    explanation: row.explanation,
    createdAt: row.createdAt,
  };
}

/**
 * Total years of relevant experience derived solely from user-provided data:
 * the career profile's declared years plus the sum of the declared `years` on
 * each experience record. When a user gives no numbers, this returns 0 rather
 * than guessing (docs/AI_SPEC.md §18 - no fabricated history).
 */
function totalExperienceYears(
  profileYears: number | null,
  experiences: Array<{ years: number | null }>,
): number {
  let total = profileYears ?? 0;
  for (const experience of experiences) {
    total += experience.years ?? 0;
  }
  return total;
}

function buildRoadmapResponse(
  roadmapId: string,
  full: RoadmapWithTasks,
): RoadmapResponse {
  const byPhase = groupTasksByPhase(full.tasks);
  const brief = (t: RoadmapWithTasks['tasks'][number]) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    skillId: t.skillId,
    estimatedMinutes: t.estimatedMinutes,
    order: t.order,
    status: t.status,
    completedAt: t.completedAt,
  });
  return {
    roadmap: {
      id: roadmapId,
      careerPathId: full.roadmap.careerPathId,
      title: full.roadmap.title,
      description: full.roadmap.description,
      createdAt: full.roadmap.createdAt,
    },
    phases: {
      DAY_30: byPhase.DAY_30.map(brief),
      DAY_60: byPhase.DAY_60.map(brief),
      DAY_90: byPhase.DAY_90.map(brief),
    },
  };
}
