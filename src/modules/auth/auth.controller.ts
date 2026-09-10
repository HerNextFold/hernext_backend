import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendCreated, sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyCodeSchema,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  async register(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(registerSchema, request.body);
    const data = await this.service.register(body);
    return sendCreated(reply, data, 'Account created. A verification code has been sent to your email.');
  }

  async verifyEmailOtp(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(verifyCodeSchema, request.body);
    const data = await this.service.verifyEmailOtp(body);
    return sendOk(reply, data, 'Email verified successfully');
  }

  async resendEmailVerification(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(forgotPasswordSchema, request.body);
    const data = await this.service.resendEmailVerification(body);
    return sendOk(reply, data, 'If the account exists and is unverified, a new code has been sent.');
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

  async forgotPassword(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(forgotPasswordSchema, request.body);
    const data = await this.service.requestPasswordReset(body);
    return sendOk(reply, data, 'If an account exists, password reset instructions have been sent.');
  }

  async verifyResetOtp(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(verifyCodeSchema, request.body);
    const data = await this.service.verifyResetOtp(body);
    return sendOk(reply, data, 'Code verified successfully');
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = parseOrThrow(resetPasswordSchema, request.body);
    await this.service.resetPassword(body);
    return sendOk(reply, {}, 'Password reset successfully');
  }
}