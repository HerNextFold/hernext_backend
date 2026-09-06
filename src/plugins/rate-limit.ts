import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { errorCodes } from '../common/errors/error-codes.js';

/**
 * Per-IP request rate limiting. Responds with the documented error envelope so
 * the frontend always receives a consistent error shape.
 */
export function registerRateLimit(app: FastifyInstance): void {
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