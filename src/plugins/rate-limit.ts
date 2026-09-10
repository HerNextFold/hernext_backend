import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
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
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: errorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded. Please try again later.',
        details: [],
      },
    }),
  });
}