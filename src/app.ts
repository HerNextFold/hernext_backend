import Fastify, { type FastifyInstance } from 'fastify';
import { loadEnv, type AppConfig } from './config/env.js';
import { AppError } from './common/errors/app-error.js';
import { errorCodes } from './common/errors/error-codes.js';
import { errorToEnvelope, handleError } from './common/errors/error-handler.js';
import { sendOk } from './common/utils/api-response.js';
import { checkDatabaseConnection } from './lib/db.js';
import { AuthService } from './modules/auth/auth.service.js';
import { registerAuthModule } from './modules/auth/auth.routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerCors } from './plugins/cors.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerRouteRegistry } from './plugins/route-registry.js';
import { registerSwagger } from './plugins/swagger.js';
import { ExperienceService } from './modules/experiences/experiences.service.js';
import { registerExperienceModule } from './modules/experiences/experiences.routes.js';
import { ProfileService } from './modules/profiles/profile.service.js';
import { registerProfileModule } from './modules/profiles/profile.routes.js';
import { AiService } from './modules/ai/ai.service.js';
import { registerAiModule } from './modules/ai/ai.routes.js';
import { AchievementService } from './modules/achievements/achievements.service.js';
import { registerAchievementModule } from './modules/achievements/achievements.routes.js';
import { ProgressService } from './modules/progress/progress.service.js';
import { registerProgressModule } from './modules/progress/progress.routes.js';
import { ChallengeService } from './modules/challenges/challenges.service.js';
import { registerChallengeModule } from './modules/challenges/challenges.routes.js';
import { EvidenceService } from './modules/evidence/evidence.service.js';
import { registerEvidenceModule } from './modules/evidence/evidence.routes.js';
import { PassportService } from './modules/passport/passport.service.js';
import { registerPassportModule } from './modules/passport/passport.routes.js';
import { OrganizationService } from './modules/organizations/organization.service.js';
import { registerOrganizationModule } from './modules/organizations/organization.routes.js';
import { ProgramService } from './modules/programs/program.service.js';
import { ProgramMonitoringService } from './modules/programs/program-monitoring.service.js';
import { registerProgramModule } from './modules/programs/program.routes.js';
import { buildLlmProvider } from './modules/ai/providers/factory.js';
import type { LLMProvider } from './modules/ai/providers/llm.provider.js';
import { buildEmailProvider } from './modules/auth/email/index.js';

export interface BuildAppOptions {
  config?: AppConfig;
  /** Override logger behaviour; defaults to silent in the test environment. */
  logger?: boolean;
}

/** Builds a fully-configured Fastify application without starting the server. */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadEnv();
  const logger = options.logger ?? config.nodeEnv !== 'test';

  const app = Fastify({ logger });

  registerRouteRegistry(app);
  registerHelmet(app);
  registerCors(app, config.frontendUrl);
  registerSwagger(app);
  registerAuth(app, config);
  registerRateLimit(app, config);

  // Access tokens are signed here so the service never touches raw secrets.
  // The email provider is decorated on the instance so tests and demo tooling
  // can read captured OTP messages from the TestEmailProvider without any API
  // or log surface exposing codes (docs/SECURITY_SPEC.md §48).
  const emailProvider = buildEmailProvider(config);
  app.decorate('hernextEmailProvider', emailProvider);
  const authService = new AuthService({
    signAccessToken: (user) =>
      app.jwt.sign({ id: user.id, role: user.role }, { expiresIn: config.jwtExpiresIn }),
    emailProvider,
  });
  registerAuthModule(app, authService);

  const experienceService = new ExperienceService();
  registerExperienceModule(app, experienceService);

  registerProfileModule(app, new ProfileService());

  // Provider selection is configuration-driven (docs/AI_SPEC.md §16). All
  // providers implement the same LLMProvider interface, so the AI service
  // never depends on a specific vendor. Unless explicitly overridden via
  // AI_PROVIDER, Groq (OpenAI-compatible) is used.
  const provider: LLMProvider = buildLlmProvider({
    provider: config.aiProvider,
    apiKey: config.aiApiKey,
    model: config.aiModel,
  });
  registerAiModule(app, new AiService(provider));

  const achievementService = new AchievementService();
  registerAchievementModule(app, achievementService);

  registerProgressModule(app, new ProgressService(achievementService));

  registerChallengeModule(app, new ChallengeService(achievementService));
  registerEvidenceModule(app, new EvidenceService());
  registerPassportModule(app, new PassportService(achievementService));

  registerOrganizationModule(app, new OrganizationService());
  const programService = new ProgramService();
  registerProgramModule(app, programService, new ProgramMonitoringService(programService));

  // Liveness + database connectivity probe. The database result is advisory;
  // the endpoint never fails because of an unavailable database.
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness and database connectivity probe',
        description: 'Public endpoint. Returns the documented success envelope; the database field is advisory.',
        operationId: 'healthCheck',
        response: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  additionalProperties: false,
                  properties: {
                    success: { type: 'boolean', const: true },
                    data: {
                      type: 'object',
                      required: ['status', 'database'],
                      additionalProperties: false,
                      properties: {
                        status: { type: 'string', const: 'ok' },
                        database: { type: 'string', enum: ['connected', 'disconnected'] },
                      },
                    },
                    message: { type: 'string', description: 'Optional human-readable message' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const database = await checkDatabaseConnection();
      return sendOk(reply, { status: 'ok', database: database ? 'connected' : 'disconnected' });
    },
  );

  app.setErrorHandler(handleError);

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: errorToEnvelope(new AppError(errorCodes.RESOURCE_NOT_FOUND, 'Route not found', 404)),
    });
  });

  return app;
}