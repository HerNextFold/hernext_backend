import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendCreated, sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import {
  createOrganizationBodySchema,
  organizationIdParamsSchema,
} from './organization.schemas.js';
import type { OrganizationService } from './organization.service.js';

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(createOrganizationBodySchema, request.body);
    const data = await this.service.createOrganization(request.user.id, body);
    return sendCreated(reply, { organization: data });
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { organizationId } = parseOrThrow(organizationIdParamsSchema, request.params);
    const data = await this.service.getOrganization(request.user.id, organizationId);
    return sendOk(reply, { organization: data });
  }
}