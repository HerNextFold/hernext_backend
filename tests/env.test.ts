import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('loads a valid configuration from the environment', () => {
    const config = loadEnv();
    expect(config.databaseUrl).toContain('postgres');
    expect(config.port).toBeGreaterThan(0);
    expect(config.jwtSecret.length).toBeGreaterThan(0);
    expect(config.jwtRefreshSecret.length).toBeGreaterThan(0);
    expect(config.frontendUrl.length).toBeGreaterThan(0);
    expect(['test', 'brevo']).toContain(config.emailProvider);
  });

  it('rejects a missing DATABASE_URL', () => {
    const partial: Record<string, string | undefined> = {
      DATABASE_URL: undefined,
      JWT_SECRET: 'x',
      JWT_REFRESH_SECRET: 'y',
    };
    expect(() => loadEnv(partial)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    const bad = { ...process.env, DATABASE_URL: 'mysql://user:pass@host/db' };
    expect(() => loadEnv(bad)).toThrow(/DATABASE_URL/);
  });

  it('applies defaults for optional values', () => {
    const config = loadEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET: 'secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      FRONTEND_URL: 'http://localhost:5173',
    });
    expect(config.port).toBe(5000);
    expect(config.jwtExpiresIn).toBe('15m');
    expect(config.jwtRefreshExpiresIn).toBe('7d');
    expect(config.emailProvider).toBe('test');
  });

  it('forbids the in-memory email provider in production', () => {
    const bad = {
      ...process.env,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'test',
    };
    expect(() => loadEnv(bad)).toThrow(/EMAIL_PROVIDER must be "brevo" in production/);
  });

  it('requires Brevo credentials when EMAIL_PROVIDER=brevo', () => {
    const bad = {
      ...process.env,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'brevo',
    };
    expect(() => loadEnv(bad)).toThrow(/BREVO_API_KEY, BREVO_SENDER_EMAIL is required/);

    const good = {
      ...process.env,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'secret-key',
      BREVO_SENDER_EMAIL: 'no-reply@hernext.africa',
    };
    const config = loadEnv(good);
    expect(config.emailProvider).toBe('brevo');
    expect(config.brevoSenderEmail).toBe('no-reply@hernext.africa');
  });
});