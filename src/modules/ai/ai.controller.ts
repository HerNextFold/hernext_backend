import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendOk } from '../../common/utils/api-response.js';
import { parseOrThrow } from '../../common/utils/validate.js';
import {
  aiCareerIdParamsSchema,
  aiExperienceIdParamsSchema,
  limitQuerySchema,
  regenerateQuerySchema,
  roadmapGenerateSchema,
} from './ai.schemas.js';
import type { AiService } from './ai.service.js';

/**
 * Thin controller for the Career Intelligence endpoints (docs/API_CONTRACT.md
 * §Table). Never mutates business logic; delegates to the service. Identity is
 * always taken from the authenticated `request.user`, never the body.
 */
export class AiController {
  constructor(private readonly service: AiService) {}

  async runCareerImpact(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { experienceId } = parseOrThrow(aiExperienceIdParamsSchema, request.params);
    const { regenerate } = parseOrThrow(regenerateQuerySchema, request.query);
    const data = await this.service.runCareerImpact(request.user.id, experienceId, regenerate);
    return sendOk(reply, data);
  }

  async getCareerImpact(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { experienceId } = parseOrThrow(aiExperienceIdParamsSchema, request.params);
    const data = await this.service.getCareerImpact(request.user.id, experienceId);
    return sendOk(reply, data);
  }

  async runTransferableSkills(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { experienceId } = parseOrThrow(aiExperienceIdParamsSchema, request.params);
    const { regenerate } = parseOrThrow(regenerateQuerySchema, request.query);
    const data = await this.service.runTransferableSkills(request.user.id, experienceId, regenerate);
    return sendOk(reply, { skills: data });
  }

  async getTransferableSkills(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.getTransferableSkills(request.user.id);
    return sendOk(reply, { skills: data });
  }

  async runCareerRecommendations(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.runCareerRecommendations(request.user.id);
    return sendOk(reply, { recommendations: data });
  }

  async getCareerRecommendations(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { limit } = parseOrThrow(limitQuerySchema, request.query);
    const data = await this.service.getCareerRecommendations(request.user.id, limit);
    return sendOk(reply, { recommendations: data });
  }

  async runSkillGaps(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { careerId } = parseOrThrow(aiCareerIdParamsSchema, request.params);
    const data = await this.service.runSkillGaps(request.user.id, careerId);
    return sendOk(reply, data);
  }

  async getSkillGaps(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { careerId } = parseOrThrow(aiCareerIdParamsSchema, request.params);
    const data = await this.service.getSkillGaps(request.user.id, careerId);
    return sendOk(reply, data);
  }

  async runRoadmap(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { careerId } = parseOrThrow(aiCareerIdParamsSchema, request.params);
    const { regenerate } = parseOrThrow(regenerateQuerySchema, request.query);
    const data = await this.service.runRoadmap(request.user.id, careerId, regenerate);
    return sendOk(reply, data);
  }

  async generateRoadmap(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { careerPathId } = parseOrThrow(roadmapGenerateSchema, request.body);
    const data = await this.service.runRoadmap(request.user.id, careerPathId);
    return sendOk(reply, data);
  }

  async getRoadmap(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const data = await this.service.getRoadmap(request.user.id);
    return sendOk(reply, data);
  }
}