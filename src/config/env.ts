import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = (dflt: boolean): z.ZodType<boolean> =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? dflt : value === 'true' || value === '1'));

const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (value) => {
        try {
          return new URL(value).protocol.startsWith('postgres');
        } catch {
          return false;
        }
      },
      { message: 'DATABASE_URL must be a valid postgresql:// connection string' },
    ),
  DB_SSL: booleanFromEnv(true),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),
  AI_PROVIDER: z.string().min(1).default('gemini'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  dbSsl: boolean;
  dbPoolMax: number;
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  frontendUrl: string;
  aiProvider: string;
  aiApiKey: string | undefined;
  aiModel: string | undefined;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
};

/**
 * Parses and validates environment variables. Fails fast and loudly when a
 * required variable is missing or invalid so the application never starts
 * with a broken configuration.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): AppConfig {
  const result = appEnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }

  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    dbSsl: env.DB_SSL,
    dbPoolMax: env.DB_POOL_MAX,
    jwtSecret: env.JWT_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    frontendUrl: env.FRONTEND_URL,
    aiProvider: env.AI_PROVIDER,
    aiApiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL,
    logLevel: env.LOG_LEVEL,
  };
}