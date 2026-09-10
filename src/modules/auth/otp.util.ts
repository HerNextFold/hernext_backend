import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export const OTP_LIFETIME_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const OTP_DIGIT_COUNT = 6;

/** Cryptographically random 6-digit code. Never derived from Date.now(). */
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_DIGIT_COUNT).toString().padStart(OTP_DIGIT_COUNT, '0');
}

/** SHA-256 hex digest of the OTP. Only this hash is persisted. */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** SHA-256 hex digest used for opaque reset tokens. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Constant-time comparison of a candidate code against a stored hash. */
export function otpMatches(code: string, codeHash: string): boolean {
  const candidate = createHash('sha256').update(code, 'utf8').digest();
  const stored = Buffer.from(codeHash, 'hex');
  if (candidate.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(candidate, stored);
}