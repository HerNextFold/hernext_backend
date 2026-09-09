import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { withTransaction, type Db } from '../../lib/db.js';
import {
  findCareerProfileByUserId,
  upsertCareerProfile,
  type CareerProfileRow,
} from '../../models/career-profile.model.js';
import { assertCareerExists, findCareerById, findSkillsByIds } from '../../models/catalogue.model.js';
import { findParticipantProfileByUserId } from '../../models/user.model.js';
import { listUserSkillsWithNames, upsertUserSkill } from '../../models/user-skill.model.js';
import type { UpsertProfileBody } from './profile.schemas.js';
import { toProfileView, type CareerProfileView } from './profile.types.js';

/**
 * Career profile business logic. Ownership is always derived from the
 * authenticated user id passed in by the controller - never from the request
 * body (docs/AGENTS.md §8).
 */
export class ProfileService {
  async getProfile(userId: string): Promise<CareerProfileView> {
    const profile = await findCareerProfileByUserId(undefined, userId);
    if (profile === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Career profile not found', 404);
    }
    return this.buildView(userId, profile);
  }

  /**
   * Creates or updates the participant's career profile in one transaction.
   * The optional `skillIds` are validated against the approved skill catalogue
   * and stored as SELF_REPORTED user skills (docs/PRODUCT_SPEC.md §8).
   */
  async saveProfile(userId: string, input: UpsertProfileBody): Promise<CareerProfileView> {
    const profile = await withTransaction(async (client) => {
      const participantProfile = await findParticipantProfileByUserId(client, userId);
      if (participantProfile === null) {
        throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Participant profile not found', 404);
      }

      if (input.targetCareerId !== null && input.targetCareerId !== undefined) {
        await assertCareerExists(client, input.targetCareerId);
      }

      const saved = await upsertCareerProfile(client, {
        participantProfileId: participantProfile.id,
        currentOccupation: input.currentOccupation,
        industry: input.industry,
        yearsOfExperience: input.yearsOfExperience,
        education: input.education ?? null,
        employmentType: input.employmentType,
        careerInterests: input.careerInterests ?? null,
        targetCareerId: input.targetCareerId ?? null,
      });

      if (input.skillIds !== undefined && input.skillIds.length > 0) {
        await this.saveSelfReportedSkills(client, userId, input.skillIds);
      }

      return saved;
    });

    return this.buildView(userId, profile);
  }

  private async saveSelfReportedSkills(
    db: Db,
    userId: string,
    skillIds: string[],
  ): Promise<void> {
    const uniqueSkillIds = [...new Set(skillIds)];
    const found = await findSkillsByIds(db, uniqueSkillIds);
    const known = new Set(found.map((s) => s.id));
    const unknown = uniqueSkillIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new AppError(
        errorCodes.VALIDATION_ERROR,
        'One or more skills are not part of the approved skill catalogue.',
        400,
        { unknownSkillIds: unknown },
      );
    }
    for (const skillId of uniqueSkillIds) {
      await upsertUserSkill(db, {
        userId,
        skillId,
        source: 'SELF_REPORTED',
        confidence: 1,
        proficiency: 0,
      });
    }
  }

  private async buildView(userId: string, profile: CareerProfileRow): Promise<CareerProfileView> {
    const [targetCareer, skills] = await Promise.all([
      profile.targetCareerId === null ? null : findCareerById(undefined, profile.targetCareerId),
      listUserSkillsWithNames(undefined, userId),
    ]);
    return toProfileView(profile, targetCareer, skills);
  }
}