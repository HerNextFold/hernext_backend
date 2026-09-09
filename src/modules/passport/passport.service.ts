import { randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool } from '../../lib/db.js';
import { calculatePhaseProgress, calculateRoadmapProgress } from '../../lib/scoring/progress.js';
import { computeReadinessFromMetrics } from '../../lib/scoring/readiness-orchestrator.js';
import { findCareerProfileByUserId } from '../../models/career-profile.model.js';
import { findCareerById } from '../../models/catalogue.model.js';
import { listPassedChallengesForUser } from '../../models/challenge-submission.model.js';
import { listEvidenceForUser } from '../../models/evidence.model.js';
import { listExperiences } from '../../models/experience.model.js';
import { findPassportBySlug, findPassportByUserId, upsertPassport, type PassportRow } from '../../models/passport.model.js';
import { loadJourneyMetrics, phaseStats } from '../../models/progress.model.js';
import { findUserById } from '../../models/user.model.js';
import { listAchievementsWithEarned } from '../../models/achievement.model.js';
import type { AchievementService } from '../achievements/achievements.service.js';

export interface PassportEvidenceItem {
  id: string;
  title: string;
  description: string;
  result: string;
  status: string;
  skillName: string | null;
  createdAt: Date;
}

export interface PassportView {
  name: string;
  country: string | null;
  headline: string | null;
  profile: {
    currentOccupation: string;
    industry: string;
    yearsOfExperience: number;
    education: string | null;
    employmentType: string;
  } | null;
  experience: Array<{
    title: string;
    organization: string | null;
    years: number | null;
    employmentType: string;
  }>;
  skills: Array<{ name: string; category: string; source: string; proficiency: number }>;
  careerGoal: string | null;
  readiness: { score: number; label: string; breakdown: Record<string, number> };
  aiImpact: { score: number; level: string } | null;
  challenges: Array<{ challengeId: string; title: string }>;
  evidence: PassportEvidenceItem[];
  achievements: Array<{ name: string; earnedAt: Date }>;
  roadmapProgress: number;
  phaseProgress: Record<string, number>;
  updatedAt: Date;
}

function slugBase(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * URL-safe, non-enumerable slug: name fragments plus a random short suffix
 * (docs/SECURITY_SPEC.md §37). Internal database IDs never appear in slugs.
 */
function freshSlug(firstName: string, lastName: string): string {
  const parts = [slugBase(firstName), slugBase(lastName), randomBytes(2).toString('hex')];
  return parts.filter((part) => part.length > 0).join('-').slice(0, 120);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

export class PassportService {
  constructor(private readonly achievements: AchievementService) {}

  /**
   * Creates/updates the participant's Career Passport. The passport row is a
   * lightweight pointer (slug + visibility); the payload is always assembled
   * live from source records, so it never grows stale
   * (docs/DATABASE_SCHEMA.md §23). PASSPORT_READY is awarded afterwards.
   */
  async generate(userId: string, options: { isPublic?: boolean }): Promise<PassportView & PassportPartyRow> {
    const user = await findUserById(getPool(), userId);
    if (user === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'User not found', 404);
    }
    const passport = await this.persistPassport(userId, user.firstName, user.lastName, options.isPublic === true);
    const view = await this.buildView(userId, passport.updatedAt);

    await this.achievements.evaluateAndAward(userId);

    return { ...view, id: passport.id, slug: passport.slug, isPublic: passport.isPublic, createdAt: passport.createdAt };
  }

  /**
   * Returns the authenticated user's passport. A 404 when no passport has been
   * generated yet keeps "generate your passport" as a real journey step
   * (docs/SCORING_LOGIC.md §35).
   */
  async get(userId: string): Promise<PassportView & PassportPartyRow> {
    const passport = await findPassportByUserId(getPool(), userId);
    if (passport === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Career Passport not found. Generate it first.', 404);
    }
    const view = await this.buildView(userId, passport.updatedAt);
    return { ...view, id: passport.id, slug: passport.slug, isPublic: passport.isPublic, createdAt: passport.createdAt };
  }

  /**
   * Uses the passport row to identify the owner, then checks visibility before
   * building the view. Missing and non-public passports return the same 404 so
   * the endpoint leaks nothing (docs/SECURITY_SPEC.md §35).
   */
  async getPublic(slug: string): Promise<{ passport: PassportRow; view: PassportView }> {
    const passport = await findPassportBySlug(getPool(), slug);
    if (passport === null || !passport.isPublic) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Public passport not found', 404);
    }
    const view = await this.buildView(passport.userId, passport.updatedAt);
    return { passport, view };
  }

  private async persistPassport(
    userId: string,
    firstName: string,
    lastName: string,
    isPublic: boolean,
  ): Promise<PassportRow> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await upsertPassport(getPool(), { userId, slug: freshSlug(firstName, lastName), isPublic });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(errorCodes.INTERNAL_SERVER_ERROR, 'Could not create a unique passport slug.', 500);
  }

  private async buildView(userId: string, updatedAt: Date): Promise<PassportView> {
    const [user, careerProfile, experiences, evidence, passedChallenges, achievements, metrics] =
      await Promise.all([
        findUserById(getPool(), userId),
        findCareerProfileByUserId(getPool(), userId),
        listExperiences(getPool(), userId),
        listEvidenceForUser(getPool(), userId),
        listPassedChallengesForUser(getPool(), userId),
        listAchievementsWithEarned(getPool(), userId),
        loadJourneyMetrics(getPool(), userId),
      ]);

    const targetCareer =
      metrics.targetCareerId === null ? null : await findCareerById(getPool(), metrics.targetCareerId);
    const readiness = await computeReadinessFromMetrics(getPool(), metrics);

    const tasks = metrics.currentRoadmap?.tasks ?? [];
    const roadmapProgress = calculateRoadmapProgress({
      completedTasks: tasks.filter((t) => t.status === 'COMPLETED').length,
      totalTasks: tasks.length,
    });
    const phaseProgress: Record<string, number> = {};
    for (const phase of ['DAY_30', 'DAY_60', 'DAY_90'] as const) {
      const stats = phaseStats(tasks, phase);
      phaseProgress[phase] = calculatePhaseProgress({
        completedTasks: stats.completed,
        totalTasks: stats.total,
      });
    }

    return {
      name: `${user?.firstName ?? 'Unknown'} ${user?.lastName ?? 'Participant'}`.trim(),
      country: user?.country ?? null,
      headline:
        targetCareer !== null
          ? `Aspiring ${targetCareer.name}`
          : (careerProfile?.currentOccupation ?? null),
      profile:
        careerProfile === null
          ? null
          : {
              currentOccupation: careerProfile.currentOccupation,
              industry: careerProfile.industry,
              yearsOfExperience: careerProfile.yearsOfExperience,
              education: careerProfile.education,
              employmentType: careerProfile.employmentType,
            },
      experience: experiences.map((e) => ({
        title: e.title,
        organization: e.organization,
        years: e.years,
        employmentType: e.employmentType,
      })),
      skills: metrics.userSkills.map((s) => ({
        name: s.skillName,
        category: s.skillCategory ?? 'UNCATEGORISED',
        source: s.source,
        proficiency: s.proficiency,
      })),
      careerGoal: targetCareer?.name ?? null,
      readiness,
      aiImpact: metrics.latestAiImpact
        ? { score: metrics.latestAiImpact.score, level: metrics.latestAiImpact.level }
        : null,
      challenges: passedChallenges.map((c) => ({ challengeId: c.challengeId, title: c.title })),
      evidence: evidence.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        result: e.result,
        status: e.status,
        skillName: e.skillName,
        createdAt: e.createdAt,
      })),
      achievements: achievements.filter((a) => a.earned).map((a) => ({ name: a.name, earnedAt: a.earnedAt ?? new Date() })),
      roadmapProgress,
      phaseProgress,
      updatedAt,
    };
  }
}

/** Passport row fields merged into private passport responses. */
export interface PassportPartyRow {
  id: string;
  slug: string;
  isPublic: boolean;
  createdAt: Date;
}