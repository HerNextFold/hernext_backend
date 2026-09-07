import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendCreated, sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import {
  createExperienceSchema,
  experienceIdParamsSchema,
  updateExperienceSchema,
} from './experiences.schemas.js';
import type { ExperienceService } from './experiences.service.js';

export class ExperienceController {
  constructor(private readonly service: ExperienceService) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(createExperienceSchema, request.body);
    const data = await this.service.create(request.user.id, body);
    return sendCreated(reply, data);
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.listOwn(request.user.id);
    return sendOk(reply, { experiences: data });
  }

  async getOne(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = parseOrThrow(experienceIdParamsSchema, request.params);
    const data = await this.service.getOwn(request.user.id, id);
    return sendOk(reply, data);
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = parseOrThrow(experienceIdParamsSchema, request.params);
    const body = parseOrThrow(updateExperienceSchema, request.body);
    const data = await this.service.update(request.user.id, id, body);
    return sendOk(reply, data);
  }

  async remove(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = parseOrThrow(experienceIdParamsSchema, request.params);
    await this.service.remove(request.user.id, id);
    return sendOk(reply, { id }, 'Experience deleted successfully');
  }
}
