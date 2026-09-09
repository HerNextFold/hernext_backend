import type { FastifyInstance } from 'fastify';
import { AiController } from './ai.controller.js';
import type { AiService } from './ai.service.js';
import {
  GAP_PRIORITIES,
  IMPACT_LEVELS,
  SKILL_GAP_STATUSES,
  TASK_STATUSES,
  bearerAuth,
  bodySchema,
  errResponse,
  idParams,
  okResponse,
  querystring,
  uuidSchema,
} from '../../common/openapi/schemas.js';

const AI_RATE_LIMIT = { max: 20, timeWindow: 60 * 1000 };

const regenerateQuery = {
  type: 'object',
  required: [],
  additionalProperties: false,
  properties: {
    regenerate: {
      type: 'boolean',
      description: 'true forces a fresh AI analysis instead of reusing persisted output',
    },
  },
} as const;

const limitQuery = {
  type: 'object',
  required: [],
  additionalProperties: false,
  properties: {
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 20,
      description: 'Clamps the returned recommendation list',
    },
  },
} as const;

const careerImpactResponseSchema = {
  type: 'object',
  required: [
    'id',
    'experienceId',
    'score',
    'level',
    'automationTasks',
    'augmentedTasks',
    'humanStrengths',
    'emergingSkills',
    'explanation',
    'createdAt',
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    experienceId: uuidSchema(),
    score: { type: 'number', minimum: 0, maximum: 100, description: 'AI Impact score (docs/SCORING_LOGIC.md)' },
    level: { type: 'string', enum: [...IMPACT_LEVELS] },
    automationTasks: { type: 'array', items: { type: 'string' } },
    augmentedTasks: { type: 'array', items: { type: 'string' } },
    humanStrengths: { type: 'array', items: { type: 'string' } },
    emergingSkills: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const transferableSkillsResponseSchema = {
  type: 'object',
  required: ['skills'],
  additionalProperties: false,
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skillId', 'skillName', 'reason', 'confidence'],
        additionalProperties: false,
        properties: {
          skillId: uuidSchema('Approved HerNext catalogue skill id'),
          skillName: { type: ['string', 'null'] },
          reason: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

const recommendationsResponseSchema = {
  type: 'object',
  required: ['recommendations'],
  additionalProperties: false,
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['careerId', 'careerName', 'matchScore', 'rank', 'reason'],
        additionalProperties: false,
        properties: {
          careerId: uuidSchema('Approved HerNext career catalogue id'),
          careerName: { type: 'string' },
          matchScore: { type: 'number', minimum: 0, maximum: 100 },
          rank: { type: 'integer', minimum: 1 },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

const skillGapsResponseSchema = {
  type: 'object',
  required: ['career', 'skills'],
  additionalProperties: false,
  properties: {
    career: {
      type: 'object',
      required: ['id', 'name'],
      additionalProperties: false,
      properties: {
        id: uuidSchema(),
        name: { type: 'string' },
      },
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skillId', 'skillName', 'status', 'priority'],
        additionalProperties: false,
        properties: {
          skillId: uuidSchema(),
          skillName: { type: 'string' },
          status: { type: 'string', enum: [...SKILL_GAP_STATUSES] },
          priority: { type: 'string', enum: [...GAP_PRIORITIES] },
        },
      },
    },
  },
} as const;

const roadmapTaskSchema = {
  type: 'object',
  required: ['id', 'title', 'description', 'skillId', 'estimatedMinutes', 'order', 'status', 'completedAt'],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    title: { type: 'string' },
    description: { type: 'string' },
    skillId: { type: ['string', 'null'], format: 'uuid' },
    estimatedMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 600 },
    order: { type: 'integer' },
    status: { type: 'string', enum: [...TASK_STATUSES] },
    completedAt: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

const roadmapResponseSchema = {
  type: 'object',
  required: ['roadmap', 'phases'],
  additionalProperties: false,
  properties: {
    roadmap: {
      type: 'object',
      required: ['id', 'careerPathId', 'title', 'description', 'createdAt'],
      additionalProperties: false,
      properties: {
        id: uuidSchema(),
        careerPathId: uuidSchema(),
        title: { type: 'string' },
        description: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    phases: {
      type: 'object',
      required: ['DAY_30', 'DAY_60', 'DAY_90'],
      additionalProperties: false,
      properties: {
        DAY_30: { type: 'array', items: roadmapTaskSchema },
        DAY_60: { type: 'array', items: roadmapTaskSchema },
        DAY_90: { type: 'array', items: roadmapTaskSchema },
      },
    },
  },
} as const;

const roadmapGenerateBodySchema = {
  type: 'object',
  required: ['careerPathId'],
  additionalProperties: false,
  properties: {
    careerPathId: uuidSchema('Approved HerNext career id to build a roadmap for'),
  },
} as const;

export function registerAiModule(app: FastifyInstance, service: AiService): void {
  const controller = new AiController(service);

  void app.register(
    async (scope) => {
      // --- Career Impact Assessment -------------------------------------------------
      scope.post(
        '/ai/career-impact/:experienceId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Run (or reuse) the AI Career Impact Assessment for an experience',
            operationId: 'aiRunCareerImpact',
            security: bearerAuth,
            params: idParams('experienceId', 'A valid experience id'),
            querystring: querystring(regenerateQuery.properties),
            response: {
              200: okResponse('Career Impact Assessment', careerImpactResponseSchema),
              400: errResponse('Invalid experience id or query parameter'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Experience not found'),
              422: errResponse('The AI returned unreadable output'),
              429: errResponse('Rate limit exceeded'),
              503: errResponse('AI intelligence is temporarily unavailable'),
            },
          },
        },
        (request, reply) => controller.runCareerImpact(request, reply),
      );
      scope.get(
        '/ai/career-impact/:experienceId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Get the stored AI Career Impact Assessment for an experience',
            description: 'Read-first: returns the persisted assessment without calling the AI provider.',
            operationId: 'aiGetCareerImpact',
            security: bearerAuth,
            params: idParams('experienceId', 'A valid experience id'),
            response: {
              200: okResponse('Career Impact Assessment', careerImpactResponseSchema),
              400: errResponse('Invalid experience id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Assessment not found'),
            },
          },
        },
        (request, reply) => controller.getCareerImpact(request, reply),
      );

      // --- Transferable Skills ------------------------------------------------------
      scope.post(
        '/ai/transferable-skills/:experienceId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Extract (or reuse) transferable skills from an experience',
            operationId: 'aiRunTransferableSkills',
            security: bearerAuth,
            params: idParams('experienceId', 'A valid experience id'),
            querystring: querystring(regenerateQuery.properties),
            response: {
              200: okResponse('Transferable skills', transferableSkillsResponseSchema),
              400: errResponse('Invalid experience id or query parameter'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Experience not found'),
              422: errResponse('The AI returned unreadable output'),
              429: errResponse('Rate limit exceeded'),
              503: errResponse('AI intelligence is temporarily unavailable'),
            },
          },
        },
        (request, reply) => controller.runTransferableSkills(request, reply),
      );
      scope.get(
        '/ai/transferable-skills',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'List the authenticated participant transferable skills',
            operationId: 'aiGetTransferableSkills',
            security: bearerAuth,
            response: {
              200: okResponse('Transferable skills', transferableSkillsResponseSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.getTransferableSkills(request, reply),
      );

      // --- Career Recommendations ----------------------------------------------------
      scope.post(
        '/ai/career-recommendations',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Compute and persist career recommendations for the participant',
            description: 'Deterministic backend scoring over the approved career catalogue; no AI call.',
            operationId: 'aiRunCareerRecommendations',
            security: bearerAuth,
            response: {
              200: okResponse('Career recommendations', recommendationsResponseSchema),
              401: errResponse('Unauthenticated'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.runCareerRecommendations(request, reply),
      );
      scope.get(
        '/careers/recommendations',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Get persisted career recommendations (read-first)',
            description: 'Returns stored results when present; otherwise computes deterministic recommendations without persistence.',
            operationId: 'careersGetRecommendations',
            security: bearerAuth,
            querystring: querystring(limitQuery.properties),
            response: {
              200: okResponse('Career recommendations', recommendationsResponseSchema),
              400: errResponse('Invalid limit parameter'),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.getCareerRecommendations(request, reply),
      );

      // --- Skill Gaps ------------------------------------------------------------------
      scope.get(
        '/careers/:careerId/skill-gaps',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Get skill gaps for a career (deterministic, read-first)',
            operationId: 'careersGetSkillGaps',
            security: bearerAuth,
            params: idParams('careerId', 'A valid career id'),
            response: {
              200: okResponse('Skill gaps', skillGapsResponseSchema),
              400: errResponse('Invalid career id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Career not found'),
            },
          },
        },
        (request, reply) => controller.getSkillGaps(request, reply),
      );
      scope.post(
        '/ai/skill-gaps/:careerId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['AI Career Intelligence'],
            summary: 'Compute and persist skill gaps for a career',
            description: 'Deterministic backend comparison of user skills versus career-required skills; no AI call.',
            operationId: 'aiRunSkillGaps',
            security: bearerAuth,
            params: idParams('careerId', 'A valid career id'),
            response: {
              200: okResponse('Skill gaps', skillGapsResponseSchema),
              400: errResponse('Invalid career id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Career not found'),
            },
          },
        },
        (request, reply) => controller.runSkillGaps(request, reply),
      );

      // --- Roadmap ------------------------------------------------------------------------
      scope.post(
        '/roadmaps/generate',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['Roadmap'],
            summary: 'Generate (or reuse) a 30/60/90-day career roadmap',
            operationId: 'roadmapsGenerate',
            security: bearerAuth,
            body: bodySchema(
              'Target career to build the roadmap for',
              roadmapGenerateBodySchema,
              { careerPathId: '00000000-0000-4000-8000-000000000000' },
            ),
            response: {
              200: okResponse('Career roadmap', roadmapResponseSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Career not found'),
              409: errResponse('The participant already has all skills for this career'),
              422: errResponse('The AI returned unreadable or ungrounded roadmap output'),
              429: errResponse('Rate limit exceeded'),
              503: errResponse('AI intelligence is temporarily unavailable'),
            },
          },
        },
        (request, reply) => controller.generateRoadmap(request, reply),
      );
      scope.get(
        '/roadmaps/current',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['Roadmap'],
            summary: 'Get the current roadmap (read-first)',
            operationId: 'roadmapsGetCurrent',
            security: bearerAuth,
            response: {
              200: okResponse('Current roadmap', roadmapResponseSchema),
              401: errResponse('Unauthenticated'),
              404: errResponse('No roadmap has been generated yet'),
            },
          },
        },
        (request, reply) => controller.getRoadmap(request, reply),
      );
      scope.post(
        '/ai/roadmap/:careerId',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['Roadmap'],
            summary: 'Generate a roadmap for a specific career (alias)',
            operationId: 'aiRunRoadmap',
            security: bearerAuth,
            params: idParams('careerId', 'A valid career id'),
            querystring: querystring(regenerateQuery.properties),
            response: {
              200: okResponse('Career roadmap', roadmapResponseSchema),
              400: errResponse('Invalid career id or query parameter'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Career not found'),
              409: errResponse('The participant already has all skills for this career'),
              422: errResponse('The AI returned unreadable or ungrounded roadmap output'),
              429: errResponse('Rate limit exceeded'),
              503: errResponse('AI intelligence is temporarily unavailable'),
            },
          },
        },
        (request, reply) => controller.runRoadmap(request, reply),
      );
      scope.get(
        '/ai/roadmap',
        {
          preHandler: scope.authenticate,
          config: { rateLimit: AI_RATE_LIMIT },
          schema: {
            tags: ['Roadmap'],
            summary: 'Get the current roadmap (alias of GET /roadmaps/current)',
            operationId: 'aiGetRoadmap',
            security: bearerAuth,
            response: {
              200: okResponse('Current roadmap', roadmapResponseSchema),
              401: errResponse('Unauthenticated'),
              404: errResponse('No roadmap has been generated yet'),
            },
          },
        },
        (request, reply) => controller.getRoadmap(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}