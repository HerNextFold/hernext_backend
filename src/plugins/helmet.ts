import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

/**
 * Security headers via Helmet. CSP is disabled so Swagger UI's inline assets
 * keep working during development; resource policy is opened to cross-origin
 * so the docs are fetchable when served from a different port.
 */
export function registerHelmet(app: FastifyInstance): void {
  void app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}