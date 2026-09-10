import type { FastifyInstance } from 'fastify';
import rateLimit, { type errorResponseBuilderContext } from '@fastify/rate-limit';
import { errorCodes } from '../common/errors/error-codes.js';
import type { AppConfig } from '../config/env.js';

/**
 * Per-IP request rate limiting. Responds with the documented error envelope so
 * the frontend always receives a consistent error shape.
 *
 * Rate limiting is disabled under `NODE_ENV=test` so integration suites are
 * not throttled by their own aggregate request volume; production and
 * development keep the production limits.
 */
export function registerRateLimit(app: FastifyInstance, config: AppConfig): void {
  if (config.nodeEnv === 'test') {
    return;
  }
  void app.register(rateLimit, {
    max: 100,
    timeWindow: 60_000,
    // The plugin THROWS whatever the builder returns into the error handler, so
    // this must be a real Error carrying the 429 statusCode. Without it the
    // central handler would classify the failure as a 500 (docs/AGENTS.md §14).
    errorResponseBuilder: (_request, context: errorResponseBuilderContext) => {
      const error = new Error('Rate limit exceeded. Please try again later.') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = context.statusCode;
      error.code = errorCodes.RATE_LIMIT_EXCEEDED;
      return error;
    },
  });
}