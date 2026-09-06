import Fastify, { type FastifyInstance } from 'fastify';
import { loadEnv, type AppConfig } from './config/env.js';
import { AppError } from './common/errors/app-error.js';
import { errorCodes } from './common/errors/error-codes.js';
import { errorToEnvelope, handleError } from './common/errors/error-handler.js';
import { sendOk } from './common/utils/api-response.js';
import { checkDatabaseConnection } from './lib/db.js';
import { registerAuth } from './plugins/auth.js';
import { registerCors } from './plugins/cors.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerSwagger } from './plugins/swagger.js';

export interface BuildAppOptions {
  config?: AppConfig;
  /** Override logger behaviour; defaults to silent in the test environment. */
  logger?: boolean;
}

/** Builds a fully-configured Fastify application without starting the server. */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadEnv();
  const logger = options.logger ?? config.nodeEnv !== 'test';

  const app = Fastify({ logger });

  registerHelmet(app);
  registerCors(app, config.frontendUrl);
  registerSwagger(app);
  registerAuth(app, config);
  registerRateLimit(app);

  // Liveness + database connectivity probe. The database result is advisory;
  // the endpoint never fails because of an unavailable database.
  app.get('/health', async (_request, reply) => {
    const database = await checkDatabaseConnection();
    return sendOk(reply, { status: 'ok', database: database ? 'connected' : 'disconnected' });
  });

  app.setErrorHandler(handleError);

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: errorToEnvelope(new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Route not found', 404)),
    });
  });

  return app;
}