import type { FastifyInstance } from 'fastify';

export interface RegisteredRoute {
  method: string;
  url: string;
}

/**
 * Root-scope route introspection for API documentation tasks (Phase 5C).
 *
 * @fastify/swagger only captures routes registered inside its own plugin scope,
 * so root-level routes such as `/health` are invisible to the generated OpenAPI
 * document. Registering a root `onRoute` hook collects every schema-carrying
 * route in the whole application (root + all child scopes) so tests can assert
 * that the documented surface matches what is actually registered.
 */
export function registerRouteRegistry(app: FastifyInstance): void {
  const routes: RegisteredRoute[] = [];
  app.decorate('hernextRoutes', routes);

  app.addHook('onRoute', (routeOptions) => {
    const methods = typeof routeOptions.method === 'string' ? [routeOptions.method] : routeOptions.method;
    for (const method of methods) {
      if (method.toUpperCase() === 'HEAD') continue;
      if (routeOptions.url === '*') continue;
      if (!routeOptions.schema) continue;
      routes.push({ method: method.toUpperCase(), url: routeOptions.url });
    }
  });
}