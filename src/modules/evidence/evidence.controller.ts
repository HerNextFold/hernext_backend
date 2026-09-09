import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import { evidenceIdParamsSchema } from './evidence.schemas.js';
import type { EvidenceService } from './evidence.service.js';

export class EvidenceController {
  constructor(private readonly service: EvidenceService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.list(request.user.id);
    return sendOk(reply, { evidence: data });
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = parseOrThrow(evidenceIdParamsSchema, request.params);
    const data = await this.service.getById(request.user.id, id);
    return sendOk(reply, { evidence: data });
  }
}