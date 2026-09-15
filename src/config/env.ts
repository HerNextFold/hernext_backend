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
  HOST: z.string().optional(),
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
  AI_PROVIDER: z.string().min(1).default('groq'),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['test', 'brevo']).default('test'),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email('BREVO_SENDER_EMAIL must be a valid email').optional(),
  BREVO_SENDER_NAME: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
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
  emailProvider: 'test' | 'brevo';
  brevoApiKey: string | undefined;
  brevoSenderEmail: string | undefined;
  brevoSenderName: string | undefined;
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

  const aiProvider = env.AI_PROVIDER;
  // The key is resolved per provider so each vendor's credential lives in its
  // own variable and is never sent to another provider. GROQ_API_KEY is used
  // for the default Groq provider; OPENAI_API_KEY is the primary key for the
  // OpenAI-compatible path, with AI_API_KEY kept as a legacy alias (e.g.
  // existing Gemini deployments) when OPENAI_API_KEY is unset.
  const aiApiKey =
    aiProvider.toLowerCase() === 'groq'
      ? env.GROQ_API_KEY
      : env.OPENAI_API_KEY ?? env.AI_API_KEY;

  if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER !== 'brevo') {
    throw new Error(
      'Environment validation failed:\n  - EMAIL_PROVIDER must be "brevo" in production (the "test" provider must never be used as a production mail path)',
    );
  }

  if (env.EMAIL_PROVIDER === 'brevo') {
    const missing: string[] = [];
    if (env.BREVO_API_KEY === undefined || env.BREVO_API_KEY === '') missing.push('BREVO_API_KEY');
    if (env.BREVO_SENDER_EMAIL === undefined || env.BREVO_SENDER_EMAIL === '') {
      missing.push('BREVO_SENDER_EMAIL');
    }
    if (missing.length > 0) {
      throw new Error(
        `Environment validation failed: EMAIL_PROVIDER is "brevo" but ${missing.join(', ')} is required`,
      );
    }
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host:
      env.HOST !== undefined && env.HOST.trim().length > 0
        ? env.HOST.trim()
        : env.NODE_ENV === 'production'
          ? '0.0.0.0'
          : '127.0.0.1',
    databaseUrl: env.DATABASE_URL,
    dbSsl: env.DB_SSL,
    dbPoolMax: env.DB_POOL_MAX,
    jwtSecret: env.JWT_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    frontendUrl: env.FRONTEND_URL,
    aiProvider: env.AI_PROVIDER,
    aiApiKey,
    aiModel: env.AI_MODEL,
    emailProvider: env.EMAIL_PROVIDER,
    brevoApiKey: env.BREVO_API_KEY,
    brevoSenderEmail: env.BREVO_SENDER_EMAIL,
    brevoSenderName: env.BREVO_SENDER_NAME,
    logLevel: env.LOG_LEVEL,
  };
}