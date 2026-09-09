import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import { upsertProfileSchema } from './profile.schemas.js';
import type { ProfileService } from './profile.service.js';

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  async get(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.getProfile(request.user.id);
    return sendOk(reply, data);
  }

  async upsert(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(upsertProfileSchema, request.body);
    const data = await this.service.saveProfile(request.user.id, body);
    return sendOk(reply, data);
  }
}