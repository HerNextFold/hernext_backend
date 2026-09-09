import type { FastifyInstance } from 'fastify';
import { ProfileController } from './profile.controller.js';
import type { ProfileService } from './profile.service.js';
import {
  EMPLOYMENT_TYPES,
  SKILL_SOURCES,
  bearerAuth,
  bodySchema,
  errResponse,
  okResponse,
  uuidSchema,
} from '../../common/openapi/schemas.js';

const careerProfileViewSchema = {
  type: 'object',
  required: [
    'id',
    'currentOccupation',
    'industry',
    'yearsOfExperience',
    'education',
    'employmentType',
    'careerInterests',
    'targetCareerId',
    'targetCareer',
    'existingSkills',
    'createdAt',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    currentOccupation: { type: 'string' },
    industry: { type: 'string' },
    yearsOfExperience: { type: 'number', minimum: 0, maximum: 100 },
    education: { type: ['string', 'null'] },
    employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
    careerInterests: { type: ['array', 'null'], items: { type: 'string' } },
    targetCareerId: { type: ['string', 'null'], format: 'uuid' },
    targetCareer: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        id: uuidSchema(),
        name: { type: 'string' },
        industry: { type: 'string' },
        level: { type: 'string' },
      },
    },
    existingSkills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skillId', 'skillName', 'category', 'source'],
        additionalProperties: false,
        properties: {
          skillId: uuidSchema(),
          skillName: { type: 'string' },
          category: { type: ['string', 'null'] },
          source: { type: 'string', enum: [...SKILL_SOURCES] },
        },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const upsertProfileBodySchema = {
  type: 'object',
  required: ['currentOccupation', 'industry', 'yearsOfExperience', 'employmentType'],
  additionalProperties: false,
  properties: {
    currentOccupation: { type: 'string', minLength: 1, maxLength: 200 },
    industry: { type: 'string', minLength: 1, maxLength: 200 },
    yearsOfExperience: { type: 'number', minimum: 0, maximum: 100 },
    education: { type: ['string', 'null'], maxLength: 300 },
    employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
    careerInterests: {
      type: ['array', 'null'],
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 200 },
    },
    targetCareerId: {
      type: ['string', 'null'],
      format: 'uuid',
      description: 'Approved HerNext career catalogue id',
    },
    skillIds: {
      type: ['array'],
      maxItems: 50,
      items: uuidSchema(),
      description: 'Optional skills to add as SELF_REPORTED',
    },
  },
} as const;

export function registerProfileModule(app: FastifyInstance, service: ProfileService): void {
  const controller = new ProfileController(service);

  void app.register(
    async (scope) => {
      scope.get(
        '/profile',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Profile'],
            summary: 'Get the authenticated participant career profile',
            operationId: 'profileGet',
            security: bearerAuth,
            response: {
              200: okResponse('Career profile', careerProfileViewSchema),
              401: errResponse('Unauthenticated'),
              404: errResponse('No career profile yet'),
            },
          },
        },
        (request, reply) => controller.get(request, reply),
      );

      scope.put(
        '/profile',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Profile'],
            summary: 'Create or update the authenticated participant career profile',
            operationId: 'profileUpsert',
            security: bearerAuth,
            body: bodySchema(
              'Career profile fields (upsert; all fields are persisted from this object)',
              upsertProfileBodySchema,
              {
                currentOccupation: 'POS Business Owner',
                industry: 'Financial Services',
                yearsOfExperience: 4,
                education: '',
                employmentType: 'INFORMAL_WORKER',
                careerInterests: ['Operations', 'Financial Services'],
                targetCareerId: '00000000-0000-4000-8000-000000000000',
                skillIds: [],
              },
            ),
            response: {
              200: okResponse('Career profile saved', careerProfileViewSchema),
              400: errResponse('Invalid request data'),
              404: errResponse('Career or skill not found'),
            },
          },
        },
        (request, reply) => controller.upsert(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}