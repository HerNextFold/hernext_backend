import type { FastifyInstance } from 'fastify';
import { ExperienceController } from './experiences.controller.js';
import type { ExperienceService } from './experiences.service.js';
import {
  EMPLOYMENT_TYPES,
  bearerAuth,
  bodySchema,
  errResponse,
  experienceViewSchema,
  idParams,
  okResponse,
  uuidSchema,
} from '../../common/openapi/schemas.js';

const createExperienceBodySchema = {
  type: 'object',
  required: ['title', 'description', 'employmentType'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1, maxLength: 5000 },
    organization: { type: ['string', 'null'], maxLength: 200 },
    years: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
    startDate: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD' },
    endDate: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD' },
  },
} as const;

const updateExperienceBodySchema = {
  type: 'object',
  required: [],
  additionalProperties: false,
  minProperties: 1,
  description: 'At least one field must be provided',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1, maxLength: 5000 },
    organization: { type: ['string', 'null'], maxLength: 200 },
    years: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
    startDate: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD' },
    endDate: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD' },
  },
} as const;

const experienceListResponse = {
  type: 'object',
  required: ['experiences'],
  additionalProperties: false,
  properties: { experiences: { type: 'array', items: experienceViewSchema } },
} as const;

const deletedExperienceResponse = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: uuidSchema() },
} as const;

const experienceParams = idParams('id', 'A valid experience id');

export function registerExperienceModule(app: FastifyInstance, service: ExperienceService): void {
  const controller = new ExperienceController(service);

  void app.register(
    async (scope) => {
      scope.post(
        '/experiences',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Experiences'],
            summary: 'Create a work experience entry',
            operationId: 'experienceCreate',
            security: bearerAuth,
            body: bodySchema(
              'Experience details',
              createExperienceBodySchema,
              {
                title: 'POS Business Owner',
                description:
                  'Own and operate a point-of-sale agency, processing daily customer transactions and keeping daily cash and ledger records.',
                organization: 'Self-run agency',
                years: 4,
                employmentType: 'INFORMAL_WORKER',
                startDate: '2021-01-15',
                endDate: null,
              },
            ),
            response: {
              201: okResponse('Experience created', experienceViewSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.create(request, reply),
      );

      scope.get(
        '/experiences',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Experiences'],
            summary: 'List the authenticated participant experiences',
            operationId: 'experienceList',
            security: bearerAuth,
            response: {
              200: okResponse('Experiences', experienceListResponse),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.list(request, reply),
      );

      scope.get(
        '/experiences/:id',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Experiences'],
            summary: 'Get one owned experience',
            operationId: 'experienceGet',
            security: bearerAuth,
            params: experienceParams,
            response: {
              200: okResponse('Experience', experienceViewSchema),
              400: errResponse('Invalid experience id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Experience not found'),
            },
          },
        },
        (request, reply) => controller.getOne(request, reply),
      );

      scope.put(
        '/experiences/:id',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Experiences'],
            summary: 'Update an owned experience',
            operationId: 'experienceUpdate',
            security: bearerAuth,
            params: experienceParams,
            body: bodySchema(
              'Updated experience fields (at least one)',
              updateExperienceBodySchema,
              { years: 5 },
            ),
            response: {
              200: okResponse('Experience updated', experienceViewSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Experience not found'),
            },
          },
        },
        (request, reply) => controller.update(request, reply),
      );

      scope.delete(
        '/experiences/:id',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Experiences'],
            summary: 'Delete an owned experience',
            operationId: 'experienceDelete',
            security: bearerAuth,
            params: experienceParams,
            response: {
              200: okResponse('Experience deleted', deletedExperienceResponse),
              400: errResponse('Invalid experience id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Experience not found'),
            },
          },
        },
        (request, reply) => controller.remove(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}