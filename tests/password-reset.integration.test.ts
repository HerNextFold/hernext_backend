import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, initDb } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';
import { deleteUserByEmail } from '../src/models/user.model.js';
import { readLatestOtp } from './helpers/auth.js';

describe('password reset (docs/SECURITY_SPEC.md §46-§48, API_CONTRACT §9-§10)', () => {
  const runDb = process.env.RUN_DB_TESTS === '1';
  const createdEmails: string[] = [];

  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    if (!runDb) {
      return;
    }
    const config = loadEnv();
    initDb(config);
    if (!(await checkDatabaseConnection())) {
      throw new Error('Database is not reachable. Apply migrations and try again.');
    }
    app = buildApp({ config, logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (!runDb) {
      return;
    }
    await app?.close();
    for (const email of createdEmails) {
      await deleteUserByEmail(undefined, email).catch(() => undefined);
    }
    await closeDb();
  });

  function call(
    instance: FastifyInstance | undefined,
    options: { method: 'POST'; url: string; payload: Record<string, unknown> },
  ): Promise<LightMyRequestResponse> {
    return instance!.inject({ method: options.method, url: options.url, body: options.payload });
  }

  function randomEmail(): string {
    const email = `reset-${randomUUID()}@example.com`;
    createdEmails.push(email);
    return email;
  }

  async function register(): Promise<{ email: string; password: string }> {
    const email = randomEmail();
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

  /** Registers AND verifies the email so password reset (verified-only) can start. */
  async function registerVerified(): Promise<{ email: string; password: string }> {
    const { email, password } = await register();
    const code = readLatestOtp(app!, email, 'EMAIL_VERIFICATION');
    const verify = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/verify-email-otp',
      payload: { email, code },
    });
    expect(verify.statusCode).toBe(200);
    return { email, password };
  }

  async function obtainResetToken(email: string): Promise<string> {
    const forgot = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    expect(forgot.statusCode).toBe(200);

    const code = readLatestOtp(app!, email, 'PASSWORD_RESET');
    const verified = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/verify-reset-otp',
      payload: { email, code },
    });
    expect(verified.statusCode).toBe(200);
    const token = verified.json().data.resetToken as string;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(40);
    return token;
  }

  it.runIf(runDb)('returns the same generic response for known and unknown emails', async () => {
    const { email } = await registerVerified();
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

  it.runIf(runDb)('never returns any reset token from the API; OTPs only arrive via the email provider', async () => {
    const { email } = await registerVerified();
    const forgot = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    expect(forgot.json().data).toEqual({});

    // The only reset credential that exists is the email-delivered OTP.
    expect(readLatestOtp(app!, email, 'PASSWORD_RESET')).toMatch(/^\d{6}$/);
  });

  it.runIf(runDb)('does not dispatch a reset OTP to an unverified account', async () => {
    const { email } = await register();
    const forgot = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    expect(forgot.statusCode).toBe(200);
    expect(forgot.json().data).toEqual({});
    expect(() => readLatestOtp(app!, email, 'PASSWORD_RESET')).toThrow(/No PASSWORD_RESET email captured/);
  });

  it.runIf(runDb)('resets the password via OTP + opaque token and invalidates the old password', async () => {
    const { email, password } = await registerVerified();
    const newPassword = 'NewPassword456!';

    const resetToken = await obtainResetToken(email);
    const reset = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, password: newPassword },
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
    const { email } = await registerVerified();

    const resetToken = await obtainResetToken(email);

    const first = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, password: 'FirstNewPass123!' },
    });
    expect(first.statusCode).toBe(200);

    const replay = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, password: 'SecondNewPass123!' },
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

  it.runIf(runDb)('rejects an invalid PASSWORD_RESET OTP generically', async () => {
    const { email } = await registerVerified();
    await call(app, {
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const wrong = await call(app, {
      method: 'POST',
      url: '/api/v1/auth/verify-reset-otp',
      payload: { email, code: '000000' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('INVALID_OTP');
  });
});