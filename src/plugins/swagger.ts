import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * OpenAPI docs served at /docs. Documented endpoints added by future modules
 * are picked up automatically through the Fastify schema metadata.
 */
export function registerSwagger(app: FastifyInstance): void {
  void app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'HerNext API',
        description: 'HerNext backend API - AI-powered career transition and evidence platform',
        version: '1.0.0',
      },
      servers: [{ url: '/api/v1' }],
    },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });
}