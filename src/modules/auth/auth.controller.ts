import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendCreated, sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  async register(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(registerSchema, request.body);
    const data = await this.service.register(body);
    return sendCreated(reply, data);
  }

  async login(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(loginSchema, request.body);
    const data = await this.service.login(body);
    return sendOk(reply, data);
  }

  async me(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.me(request.user.id);
    return sendOk(reply, data);
  }

  async logout(_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    this.service.logout();
    return sendOk(reply, {}, 'Logged out successfully');
  }
}