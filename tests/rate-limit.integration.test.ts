import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

/**
 * Rate limiting is disabled under NODE_ENV=test, so this suite builds the app
 * with a development configuration (registerRateLimit skips only 'test') and
 * verifies the documented 429 RATE_LIMIT_EXCEEDED envelope instead of a 500.
 */
describe('rate limiting (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadEnv({ ...process.env, NODE_ENV: 'development' });
    app = buildApp({ config, logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(): Promise<LightMyRequestResponse> {
    // Validation failures still count against the route rate limit: the plugin
    // counts onRequest, before schema validation. No database is required.
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'missing-password@example.com' },
    });
  }

  it('returns RATE_LIMIT_EXCEEDED at the documented status instead of falling through to 500', async () => {
    const first = await login();
    expect(first.statusCode).toBe(400);

    for (let i = 0; i < 9; i += 1) {
      const response = await login();
      expect(response.statusCode, `request ${i + 2} should still be allowed`).toBe(400);
    }

    const limited = await login();
    expect(limited.statusCode).toBe(429);
    const body = limited.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toContain('Rate limit exceeded');
  });
});