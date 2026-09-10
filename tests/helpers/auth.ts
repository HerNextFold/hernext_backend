import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { TestEmailProvider } from '../../src/modules/auth/email/test-email.provider.js';
import type { OtpPurpose } from '../../src/modules/auth/otp.util.js';

/** Shared placeholder password used across integration suites. */
export const TEST_PASSWORD = 'SecurePassword123!';

/** Random, never-colliding email for isolated participants. */
export function randomTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

/** BuildApp decorates the active EmailProvider as `hernextEmailProvider`. */
export function emailProviderOf(app: FastifyInstance): TestEmailProvider {
  const provider = (app as unknown as { hernextEmailProvider?: TestEmailProvider }).hernextEmailProvider;
  if (provider === undefined) {
    throw new Error('buildApp must decorate hernextEmailProvider (defaults to TestEmailProvider unless EMAIL_PROVIDER=brevo).');
  }
  return provider;
}

/** Reads the newest captured OTP for an address+purpose, throwing if none was sent. */
export function readLatestOtp(app: FastifyInstance, email: string, purpose: OtpPurpose): string {
  const message = emailProviderOf(app).latestFor(email, purpose);
  if (message === undefined) {
    throw new Error(`No ${purpose} email captured for ${email}. Did the test register/reset before reading?`);
  }
  const match = /Your code is (\d{6})\./.exec(message.body);
  if (match === null || match[1] === undefined) {
    throw new Error(`Could not extract a 6-digit code from the ${purpose} email body.`);
  }
  return match[1];
}