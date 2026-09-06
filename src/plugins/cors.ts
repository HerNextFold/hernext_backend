import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

/**
 * Enables CORS for the HerNext frontend. Requests without an Origin header
 * (server-to-server, curl) are allowed; browser origins are limited to the
 * configured FRONTEND_URL.
 */
export function registerCors(app: FastifyInstance, frontendUrl: string): void {
  void app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (origin === undefined) {
        callback(null, true);
        return;
      }
      callback(null, origin === frontendUrl);
    },
  });
}