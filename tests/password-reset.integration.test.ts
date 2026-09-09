import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { closeDb, initDb } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';

describe('password reset (docs/SECURITY_SPEC.md §46-§47, API_CONTRACT §9-§10)', () => {
  const runDb = process.env.RUN_DB_TESTS === '1';

  let app: FastifyInstance | undefined;
  let prodApp: FastifyInstance | undefined;

  beforeAll(async () => {
    if (!runDb) {
      return;
    }
    initDb(loadEnv());
    const config = { ...loadEnv(), nodeEnv: 'development' as const };
    app = buildApp({ config, logger: false });
    const prodConfig = { ...loadEnv(), nodeEnv: 'production' as const };
    prodApp = buildApp({ config: prodConfig, logger: false });
    await app.ready();
    await prodApp.ready();
  });

  afterAll(async () => {
    if (!runDb) {
      return;
    }
    await app?.close();
    await prodApp?.close();
    await closeDb();
  });

  function call(
    instance: FastifyInstance | undefined,
    options: { method: 'POST'; url: string; payload: Record<string, unknown> },
  ): Promise<LightMyRequestResponse> {
    return instance!.inject({ method: options.method, url: options.url, body: options.payload });
  }

  async function register(): Promise<{ email: string; password: string }> {
    const email = `reset-${randomUUID()}@example.com`;
    const password = 'OldPassword123!';
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Reset',
        lastName: 'Test',
        email,
        password,
        country: 'Nigeria',
        role: 'PARTICIPANT',
      },
    });
    expect(response.statusCode).toBe(201);
    return { email, password };
  }

  it.runIf(runDb)('returns the same generic response for known and unknown emails', async () => {
    const { email } = await register();
    const known = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const unknown = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: `nobody-${randomUUID()}@example.com` },
    });

    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json().success).toBe(true);
    expect(unknown.json().success).toBe(true);
    expect(known.json().message).toBe('If an account exists, password reset instructions have been sent.');
  });

  it.runIf(runDb)('returns the mock reset token only outside production', async () => {
    const { email } = await register();

    const dev = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    expect(dev.json().data.resetToken).toBeTypeOf('string');
    expect(dev.json().data.resetToken.length).toBeGreaterThan(20);

    const prod = await call(prodApp, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    expect(prod.json().data.resetToken).toBeUndefined();
  });

  it.runIf(runDb)('resets the password and invalidates the old password', async () => {
    const { email, password } = await register();
    const newPassword = 'NewPassword456!';

    const forgot = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const token = forgot.json().data.resetToken as string;

    const reset = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: newPassword },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().message).toBe('Password reset successfully');

    const oldLogin = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it.runIf(runDb)('rejects replaying a used reset token', async () => {
    const { email } = await register();

    const forgot = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const token = forgot.json().data.resetToken as string;

    const first = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: 'FirstNewPass123!' },
    });
    expect(first.statusCode).toBe(200);

    const replay = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: 'SecondNewPass123!' },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('INVALID_TOKEN');
  });

  it.runIf(runDb)('rejects unknown or malformed reset tokens', async () => {
    const unknown = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'a'.repeat(64), password: 'TotallyNewPass123!' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('INVALID_TOKEN');

    const malformed = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'too-short', password: 'TotallyNewPass123!' },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION_ERROR');
  });
});