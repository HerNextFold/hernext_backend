import { describe, expect, it } from 'vitest';
import {
  OTP_LIFETIME_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  RESET_TOKEN_TTL_MS,
  generateOtp,
  hashOtp,
  hashToken,
  otpMatches,
} from '../src/modules/auth/otp.util.js';

describe('otp.util', () => {
  it('generates six-digit numeric codes', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('does not produce uniform outputs across many draws', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('hashes the code deterministically and never stores plaintext', () => {
    const digest = hashOtp('123456');
    expect(digest).toBe(hashOtp('123456'));
    expect(digest).not.toBe('123456');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('compares codes in constant time', () => {
    const code = '987654';
    expect(otpMatches(code, hashOtp(code))).toBe(true);
    expect(otpMatches('987655', hashOtp(code))).toBe(false);
    expect(otpMatches('111111', hashOtp('222222'))).toBe(false);
  });

  it('rejects candidates whose hash length cannot match', () => {
    expect(otpMatches('123456', 'not-hex')).toBe(false);
  });

  it('hashes opaque reset tokens as SHA-256 hex', () => {
    const raw = 'a-random-32-byte-token';
    const digest = hashToken(raw);
    expect(digest).toBe(hashToken(raw));
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('exposes the documented OTP and token policy constants', () => {
    expect(OTP_LIFETIME_MS).toBe(10 * 60 * 1000);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(OTP_RESEND_COOLDOWN_MS).toBe(60 * 1000);
    expect(RESET_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });
});