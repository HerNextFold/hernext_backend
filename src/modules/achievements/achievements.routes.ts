import type { FastifyInstance } from 'fastify';
import { AchievementController } from './achievements.controller.js';
import type { AchievementService } from './achievements.service.js';
import { bearerAuth, errResponse, okResponse } from '../../common/openapi/schemas.js';

const achievementsResponseSchema = {
  type: 'object',
  required: ['achievements'],
  additionalProperties: false,
  properties: {
    achievements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'description', 'earned', 'earnedAt'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          earned: { type: 'boolean' },
          earnedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
  },
} as const;

export function registerAchievementModule(app: FastifyInstance, service: AchievementService): void {
  const controller = new AchievementController(service);

  void app.register(
    async (scope) => {
      scope.get(
        '/achievements',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Achievements'],
            summary: 'List achievements with earn state',
            description: 'Evaluates and awards any newly-satisfied achievements, then returns the full catalogue with earn state.',
            operationId: 'achievementsList',
            security: bearerAuth,
            response: {
              200: okResponse('Achievements', achievementsResponseSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.list(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}