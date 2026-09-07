import type { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const AUTH_RATE_LIMITS = {
  register: { max: 20, timeWindow: 15 * 60 * 1000 },
  login: { max: 10, timeWindow: 10 * 60 * 1000 },
} as const;

export function registerAuthModule(app: FastifyInstance, service: AuthService): void {
  const controller = new AuthController(service);

  void app.register(
    async (scope) => {
      scope.post(
        '/register',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.register },
          schema: {
            description: 'Create a new participant account',
            response: {
              201: { description: 'Account created' },
              400: { description: 'Invalid request data' },
              403: { description: 'Organization roles cannot be self-registered' },
              409: { description: 'Email already registered' },
            },
          },
        },
        (request, reply) => controller.register(request, reply),
      );

      scope.post(
        '/login',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.login },
          schema: {
            description: 'Authenticate with email and password',
            response: {
              200: { description: 'Authenticated' },
              400: { description: 'Invalid request data' },
              401: { description: 'Invalid email or password' },
              403: { description: 'Account disabled' },
            },
          },
        },
        (request, reply) => controller.login(request, reply),
      );

      scope.post(
        '/logout',
        {
          preHandler: scope.authenticate,
          schema: {
            description: 'Log out the authenticated user',
            response: {
              200: { description: 'Logged out successfully' },
              401: { description: 'Unauthenticated' },
            },
          },
        },
        (request, reply) => controller.logout(request, reply),
      );

      scope.get(
        '/me',
        {
          preHandler: scope.authenticate,
          schema: {
            description: 'Return the currently authenticated user',
            response: {
              200: { description: 'Current user' },
              401: { description: 'Unauthenticated' },
            },
          },
        },
        (request, reply) => controller.me(request, reply),
      );
    },
    { prefix: '/api/v1/auth' },
  );
}