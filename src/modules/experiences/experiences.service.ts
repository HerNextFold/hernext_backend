import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool, withTransaction } from '../../lib/db.js';
import {
  assertExperienceOwned,
  deleteExperience,
  findOwnedExperience,
  insertExperience,
  listExperiences,
  updateExperience,
  type CreateExperienceInput,
  type ExperienceRow,
  type UpdateExperienceInput,
} from '../../models/experience.model.js';
import type { CreateExperienceBody, UpdateExperienceBody } from './experiences.schemas.js';

function toResponse(experience: ExperienceRow) {
  return {
    id: experience.id,
    title: experience.title,
    description: experience.description,
    organization: experience.organization,
    years: experience.years,
    employmentType: experience.employmentType,
    startDate: experience.startDate,
    endDate: experience.endDate,
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt,
  };
}

function createInput(userId: string, input: CreateExperienceBody): CreateExperienceInput {
  const record: CreateExperienceInput = {
    userId,
    title: input.title,
    description: input.description,
    employmentType: input.employmentType,
  };
  if (input.organization !== undefined) record.organization = input.organization;
  if (input.years !== undefined) record.years = input.years;
  if (input.startDate !== undefined) record.startDate = input.startDate;
  if (input.endDate !== undefined) record.endDate = input.endDate;
  return record;
}

function updateInput(input: UpdateExperienceBody): UpdateExperienceInput {
  const record: UpdateExperienceInput = {};
  if (input.title !== undefined) record.title = input.title;
  if (input.description !== undefined) record.description = input.description;
  if (input.organization !== undefined) record.organization = input.organization;
  if (input.years !== undefined) record.years = input.years;
  if (input.employmentType !== undefined) record.employmentType = input.employmentType;
  if (input.startDate !== undefined) record.startDate = input.startDate;
  if (input.endDate !== undefined) record.endDate = input.endDate;
  return record;
}

export class ExperienceService {
  async create(userId: string, input: CreateExperienceBody): Promise<ReturnType<typeof toResponse>> {
    const experience = await withTransaction((client) =>
      insertExperience(client, createInput(userId, input)),
    );
    return toResponse(experience);
  }

  async listOwn(userId: string): Promise<ReturnType<typeof toResponse>[]> {
    const experiences = await listExperiences(getPool(), userId);
    return experiences.map(toResponse);
  }

  async getOwn(userId: string, id: string): Promise<ReturnType<typeof toResponse>> {
    const experience = assertExperienceOwned(await findOwnedExperience(getPool(), id, userId), id);
    return toResponse(experience);
  }

  async update(userId: string, id: string, input: UpdateExperienceBody): Promise<ReturnType<typeof toResponse>> {
    const updated = await withTransaction((client) =>
      updateExperience(client, id, userId, updateInput(input)),
    );
    if (updated === null) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Experience not found', 404);
    }
    return toResponse(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await deleteExperience(getPool(), id, userId);
    if (!deleted) {
      throw new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Experience not found', 404);
    }
  }
}
