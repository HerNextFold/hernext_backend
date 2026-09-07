import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import { taskStatusSchema, taskIdParamsSchema } from './progress.schemas.js';
import type { ProgressService } from './progress.service.js';

export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  async get(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.getProgress(request.user.id);
    return sendOk(reply, data);
  }

  async getSummary(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.getSummary(request.user.id);
    return sendOk(reply, data);
  }

  async getNextAction(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.getNextAction(request.user.id);
    return sendOk(reply, data);
  }

  async updateTask(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { taskId } = parseOrThrow(taskIdParamsSchema, request.params);
    const { status } = parseOrThrow(taskStatusSchema, request.body);
    const data = await this.service.updateTask(request.user.id, taskId, status);
    return sendOk(reply, data);
  }
}