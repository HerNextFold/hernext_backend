import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import type { AchievementService } from './achievements.service.js';

export class AchievementController {
  constructor(private readonly service: AchievementService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const newlyEarned = await this.service.evaluateAndAward(request.user.id);
    const achievements = await this.service.listForUser(request.user.id);
    const message = newlyEarned.length > 0 ? `Achievement unlocked: ${newlyEarned.join(', ')}` : undefined;
    return sendOk(reply, { achievements }, message);
  }
}