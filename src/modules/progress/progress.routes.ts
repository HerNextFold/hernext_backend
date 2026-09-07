import type { FastifyInstance } from 'fastify';
import { ProgressController } from './progress.controller.js';
import type { ProgressService } from './progress.service.js';

/**
 * Registers the progress module including the roadmap task-completion endpoint.
 * Task updates belong here with progress because the response recomputes
 * roadmap/phase progress from the underlying tasks (docs/DEVELOPMENT_PLAN.md §23).
 */
export function registerProgressModule(app: FastifyInstance, service: ProgressService): void {
  const controller = new ProgressController(service);

  void app.register(
    async (scope) => {
      scope.get('/progress', { preHandler: scope.authenticate }, (request, reply) =>
        controller.get(request, reply),
      );
      scope.get('/progress/summary', { preHandler: scope.authenticate }, (request, reply) =>
        controller.getSummary(request, reply),
      );
      scope.get('/progress/next-action', { preHandler: scope.authenticate }, (request, reply) =>
        controller.getNextAction(request, reply),
      );
      scope.patch('/roadmaps/tasks/:taskId', { preHandler: scope.authenticate }, (request, reply) =>
        controller.updateTask(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}