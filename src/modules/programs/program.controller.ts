import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendCreated, sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import {
  addParticipantBodySchema,
  createProgramBodySchema,
  organizationIdParamsSchema,
  participantParamsSchema,
  programIdParamsSchema,
} from './program.schemas.js';
import type { ProgramMonitoringService } from './program-monitoring.service.js';
import type { ProgramService } from './program.service.js';

export class ProgramController {
  constructor(
    private readonly programs: ProgramService,
    private readonly monitoring: ProgramMonitoringService,
  ) {}

  async createProgram(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { organizationId } = parseOrThrow(organizationIdParamsSchema, request.params);
    const body = parseOrThrow(createProgramBodySchema, request.body);
    const program = await this.programs.createProgram(request.user.id, organizationId, body);
    return sendCreated(reply, { program });
  }

  async listPrograms(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { organizationId } = parseOrThrow(organizationIdParamsSchema, request.params);
    const programs = await this.programs.listPrograms(request.user.id, organizationId);
    return sendOk(reply, { programs });
  }

  async addParticipant(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { programId } = parseOrThrow(programIdParamsSchema, request.params);
    const { userId } = parseOrThrow(addParticipantBodySchema, request.body);
    const participant = await this.programs.addParticipant(request.user.id, programId, userId);
    return sendCreated(reply, { participant });
  }

  async listParticipants(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { programId } = parseOrThrow(programIdParamsSchema, request.params);
    const participants = await this.programs.listParticipants(request.user.id, programId);
    return sendOk(reply, { participants });
  }

  async getParticipantDetail(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { programId, participantId } = parseOrThrow(participantParamsSchema, request.params);
    const participant = await this.monitoring.getParticipantDetail(
      request.user.id,
      programId,
      participantId,
    );
    return sendOk(reply, { participant });
  }

  async getAnalytics(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { programId } = parseOrThrow(programIdParamsSchema, request.params);
    const analytics = await this.monitoring.getAnalytics(request.user.id, programId);
    return sendOk(reply, { analytics });
  }

  async getReport(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { programId } = parseOrThrow(programIdParamsSchema, request.params);
    const report = await this.monitoring.getReport(request.user.id, programId);
    return sendOk(reply, { report });
  }
}