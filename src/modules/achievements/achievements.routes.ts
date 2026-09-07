import type { FastifyInstance } from 'fastify';
import { AchievementController } from './achievements.controller.js';
import type { AchievementService } from './achievements.service.js';

export function registerAchievementModule(app: FastifyInstance, service: AchievementService): void {
  const controller = new AchievementController(service);

  void app.register(
    async (scope) => {
      scope.get('/achievements', { preHandler: scope.authenticate }, (request, reply) =>
        controller.list(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}