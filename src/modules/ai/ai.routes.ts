import type { FastifyInstance } from 'fastify';
import { AiController } from './ai.controller.js';
import type { AiService } from './ai.service.js';

const AI_RATE_LIMIT = { max: 20, timeWindow: 60 * 1000 };

export function registerAiModule(app: FastifyInstance, service: AiService): void {
  const controller = new AiController(service);

  void app.register(
    async (scope) => {
      scope.post(
        '/ai/career-impact/:experienceId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.runCareerImpact(request, reply),
      );
      scope.get(
        '/ai/career-impact/:experienceId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.getCareerImpact(request, reply),
      );

      scope.post(
        '/ai/transferable-skills/:experienceId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.runTransferableSkills(request, reply),
      );
      scope.get(
        '/ai/transferable-skills',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.getTransferableSkills(request, reply),
      );

      scope.post(
        '/ai/career-recommendations',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.runCareerRecommendations(request, reply),
      );

      scope.post(
        '/ai/skill-gaps/:careerId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.runSkillGaps(request, reply),
      );

      scope.post(
        '/ai/roadmap/:careerId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.runRoadmap(request, reply),
      );
      scope.get(
        '/ai/roadmap',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
        },
        (request, reply) => controller.getRoadmap(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}