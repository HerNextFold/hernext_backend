import type { FastifyInstance } from 'fastify';
import { ExperienceController } from './experiences.controller.js';
import type { ExperienceService } from './experiences.service.js';

export function registerExperienceModule(app: FastifyInstance, service: ExperienceService): void {
  const controller = new ExperienceController(service);

  void app.register(
    async (scope) => {
      scope.post('/experiences', { preHandler: scope.authenticate }, (request, reply) =>
        controller.create(request, reply),
      );
      scope.get('/experiences', { preHandler: scope.authenticate }, (request, reply) =>
        controller.list(request, reply),
      );
      scope.get('/experiences/:id', { preHandler: scope.authenticate }, (request, reply) =>
        controller.getOne(request, reply),
      );
      scope.put('/experiences/:id', { preHandler: scope.authenticate }, (request, reply) =>
        controller.update(request, reply),
      );
      scope.delete('/experiences/:id', { preHandler: scope.authenticate }, (request, reply) =>
        controller.remove(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}
