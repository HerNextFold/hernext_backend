import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { AppError } from '../common/errors/app-error.js';
import { errorCodes } from '../common/errors/error-codes.js';
import type { AuthUser } from '../common/types/auth.js';
import type { AppConfig } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/**
 * Registers JWT authentication. The `authenticate` preHandler verifies the
 * bearer token and surfaces `request.user`. Verified payloads carry only the
 * authenticated user's id, role and email - never secrets.
 */
export function registerAuth(app: FastifyInstance, config: Pick<AppConfig, 'jwtSecret'>): void {
  void app.register(fastifyJwt, { secret: config.jwtSecret });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(errorCodes.INVALID_TOKEN, 'Authentication token is invalid or expired', 401);
    }
  });
}