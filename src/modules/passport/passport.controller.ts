import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import { passportGenerateSchema, passportSlugParamsSchema } from './passport.schemas.js';
import { toPublicPassport } from './passport-public.mapper.js';
import type { PassportService } from './passport.service.js';

export class PassportController {
  constructor(private readonly service: PassportService) {}

  async get(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const passport = await this.service.get(request.user.id);
    return sendOk(reply, { passport });
  }

  async generate(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { isPublic } = parseOrThrow(passportGenerateSchema, request.body ?? {});
    const options = isPublic === undefined ? {} : { isPublic };
    const passport = await this.service.generate(request.user.id, options);
    return sendOk(reply, { passport });
  }

  async getPublic(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { slug } = parseOrThrow(passportSlugParamsSchema, request.params);
    const { view } = await this.service.getPublic(slug);
    return sendOk(reply, { passport: toPublicPassport(view) });
  }
}