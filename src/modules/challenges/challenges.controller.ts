import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import type { ChallengeDifficulty } from '../../models/challenge.model.js';
import {
  challengeIdParamsSchema,
  challengesQuerySchema,
  submitBodySchema,
} from './challenges.schemas.js';
import type { ChallengeService } from './challenges.service.js';

export class ChallengeController {
  constructor(private readonly service: ChallengeService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = parseOrThrow(challengesQuerySchema, request.query);
    const filters: { skillId?: string; difficulty?: ChallengeDifficulty } = {};
    if (query.skillId !== undefined) {
      filters.skillId = query.skillId;
    }
    if (query.difficulty !== undefined) {
      filters.difficulty = query.difficulty;
    }
    const data = await this.service.list(request.user.id, filters);
    return sendOk(reply, { challenges: data });
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = parseOrThrow(challengeIdParamsSchema, request.params);
    const data = await this.service.getById(request.user.id, id);
    return sendOk(reply, { challenge: data });
  }

  async submit(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = parseOrThrow(challengeIdParamsSchema, request.params);
    const { answer } = parseOrThrow(submitBodySchema, request.body ?? {});
    const data = await this.service.submit(request.user.id, id, answer);
    return sendOk(reply, data);
  }
}