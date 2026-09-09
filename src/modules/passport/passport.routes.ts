import type { FastifyInstance } from 'fastify';
import { PassportController } from './passport.controller.js';
import type { PassportService } from './passport.service.js';
import {
  EMPLOYMENT_TYPES,
  READINESS_LABELS,
  SKILL_SOURCES,
  bearerAuth,
  bodySchema,
  errResponse,
  impactSnapshotSchema,
  okResponse,
  readinessSnapshotSchema,
  slugParams,
  uuidSchema,
} from '../../common/openapi/schemas.js';

const passportSkillSchema = {
  type: 'object',
  required: ['name', 'category', 'source', 'proficiency'],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    category: { type: 'string' },
    source: { type: 'string', enum: [...SKILL_SOURCES] },
    proficiency: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

const privatePassportSchema = {
  type: 'object',
  required: [
    'id',
    'slug',
    'isPublic',
    'createdAt',
    'name',
    'country',
    'headline',
    'profile',
    'experience',
    'skills',
    'careerGoal',
    'readiness',
    'aiImpact',
    'challenges',
    'evidence',
    'achievements',
    'roadmapProgress',
    'phaseProgress',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    slug: { type: 'string', description: 'Public shareable slug' },
    isPublic: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    name: { type: 'string' },
    country: { type: ['string', 'null'] },
    headline: { type: ['string', 'null'] },
    profile: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        currentOccupation: { type: 'string' },
        industry: { type: 'string' },
        yearsOfExperience: { type: 'number' },
        education: { type: ['string', 'null'] },
        employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'organization', 'years', 'employmentType'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          organization: { type: ['string', 'null'] },
          years: { type: ['number', 'null'] },
          employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
        },
      },
    },
    skills: { type: 'array', items: passportSkillSchema },
    careerGoal: { type: ['string', 'null'] },
    readiness: readinessSnapshotSchema,
    aiImpact: impactSnapshotSchema,
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['challengeId', 'title'],
        additionalProperties: false,
        properties: {
          challengeId: uuidSchema(),
          title: { type: 'string' },
        },
      },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'description', 'result', 'status', 'skillName', 'createdAt'],
        additionalProperties: false,
        properties: {
          id: uuidSchema(),
          title: { type: 'string' },
          description: { type: 'string' },
          result: { type: 'string' },
          status: { type: 'string', description: 'PENDING or VERIFIED' },
          skillName: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    achievements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'earnedAt'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          earnedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    roadmapProgress: { type: 'number', minimum: 0, maximum: 100 },
    phaseProgress: {
      type: 'object',
      required: ['DAY_30', 'DAY_60', 'DAY_90'],
      additionalProperties: false,
      properties: {
        DAY_30: { type: 'number', minimum: 0, maximum: 100 },
        DAY_60: { type: 'number', minimum: 0, maximum: 100 },
        DAY_90: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const passportResponseSchema = {
  type: 'object',
  required: ['passport'],
  additionalProperties: false,
  properties: { passport: privatePassportSchema },
} as const;

const generateBodySchema = {
  type: 'object',
  required: [],
  additionalProperties: false,
  properties: {
    isPublic: {
      type: 'boolean',
      description: 'True to make the Passport shareable via the public slug. Defaults to false.',
    },
  },
} as const;

/**
 * Public passport response (docs/SECURITY_SPEC.md §35-§36). This is the
 * dedicated allowlisted shape; the full participant view is never exposed
 * publicly - no email, no internal IDs, no private profile/analytics.
 */
const publicPassportSchema = {
  type: 'object',
  required: [
    'name',
    'country',
    'headline',
    'experience',
    'skills',
    'careerGoal',
    'readiness',
    'readinessLabel',
    'aiImpact',
    'roadmapProgress',
    'phaseProgress',
    'challenges',
    'evidence',
    'achievements',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    country: { type: ['string', 'null'] },
    headline: { type: ['string', 'null'] },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'organization', 'years'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          organization: { type: ['string', 'null'] },
          years: { type: ['number', 'null'] },
        },
      },
    },
    skills: { type: 'array', items: passportSkillSchema },
    careerGoal: { type: ['string', 'null'] },
    readiness: { type: 'number', minimum: 0, maximum: 100 },
    readinessLabel: { type: 'string', enum: [...READINESS_LABELS] },
    aiImpact: impactSnapshotSchema,
    roadmapProgress: { type: 'number', minimum: 0, maximum: 100 },
    phaseProgress: {
      type: 'object',
      required: ['DAY_30', 'DAY_60', 'DAY_90'],
      additionalProperties: false,
      properties: {
        DAY_30: { type: 'number', minimum: 0, maximum: 100 },
        DAY_60: { type: 'number', minimum: 0, maximum: 100 },
        DAY_90: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: { title: { type: 'string' } },
      },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'description', 'result', 'status', 'skillName', 'createdAt'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          result: { type: 'string' },
          status: { type: 'string' },
          skillName: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    achievements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'earnedAt'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          earnedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const publicPassportResponseSchema = {
  type: 'object',
  required: ['passport'],
  additionalProperties: false,
  properties: { passport: publicPassportSchema },
} as const;

export function registerPassportModule(app: FastifyInstance, service: PassportService): void {
  const controller = new PassportController(service);

  void app.register(
    async (scope) => {
      scope.get(
        '/passport',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Passport'],
            summary: 'Get the participant Career Passport',
            operationId: 'passportGet',
            security: bearerAuth,
            response: {
              200: okResponse('Career Passport', passportResponseSchema),
              401: errResponse('Unauthenticated'),
              404: errResponse('Career Passport not found. Generate it first.'),
            },
          },
        },
        (request, reply) => controller.get(request, reply),
      );

      scope.post(
        '/passport/generate',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Passport'],
            summary: 'Generate (or update) the participant Career Passport',
            operationId: 'passportGenerate',
            security: bearerAuth,
            body: bodySchema(
              'Passport generation options',
              generateBodySchema,
              { isPublic: true },
            ),
            response: {
              200: okResponse('Career Passport generated', passportResponseSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              404: errResponse('User not found'),
              500: errResponse('Could not create a unique passport slug'),
            },
          },
        },
        (request, reply) => controller.generate(request, reply),
      );

      // Public: no authentication required (docs/API_CONTRACT.md §31).
      scope.get(
        '/passport/public/:slug',
        {
          schema: {
            tags: ['Passport'],
            summary: 'Get a public Career Passport by slug',
            description: 'Public endpoint; exposes only the allowlisted public fields (docs/SECURITY_SPEC.md §35-§36).',
            operationId: 'passportGetPublic',
            params: slugParams('slug', '^[a-z0-9-]+$', 'Public passport slug'),
            response: {
              200: okResponse('Public Career Passport', publicPassportResponseSchema),
              400: errResponse('Invalid slug format'),
              404: errResponse('Public passport not found'),
            },
          },
        },
        (request, reply) => controller.getPublic(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}