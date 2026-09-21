import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

/**
 * Enables CORS for the HerNext frontend. Requests without an Origin header
 * (server-to-server, curl) are allowed; browser origins are limited to the
 * configured FRONTEND_URL origins (comma-separated, e.g. both the 5173 and
 * 5174 local dev servers).
 */
export function registerCors(app: FastifyInstance, frontendUrls: string[]): void {
  const allowedOrigins = new Set(frontendUrls.map((origin) => origin.replace(/\/+$/, '')));
  void app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (origin === undefined) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.has(origin.replace(/\/+$/, '')));
    },
  });
}