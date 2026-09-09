import type { FastifyInstance } from 'fastify';
import { ChallengeController } from './challenges.controller.js';
import type { ChallengeService } from './challenges.service.js';
import {
  CHALLENGE_DIFFICULTIES,
  SUBMISSION_STATUSES,
  bearerAuth,
  bodySchema,
  errResponse,
  idParams,
  okResponse,
  querystring,
  uuidSchema,
} from '../../common/openapi/schemas.js';

const challengesQuerySchema = {
  type: 'object',
  required: [],
  additionalProperties: false,
  properties: {
    skillId: { type: 'string', format: 'uuid', description: 'Filter challenges that build this skill' },
    difficulty: { type: 'string', enum: [...CHALLENGE_DIFFICULTIES] },
  },
} as const;

const challengeListItemSchema = {
  type: 'object',
  required: ['id', 'title', 'description', 'difficulty', 'skills', 'latestAttempt'],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    title: { type: 'string' },
    description: { type: 'string' },
    difficulty: { type: 'string', enum: [...CHALLENGE_DIFFICULTIES] },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skillId', 'skillName'],
        additionalProperties: false,
        properties: {
          skillId: uuidSchema(),
          skillName: { type: 'string' },
        },
      },
    },
    latestAttempt: {
      type: ['object', 'null'],
      required: ['status', 'score', 'submittedAt'],
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: [...SUBMISSION_STATUSES] },
        score: { type: ['number', 'null'] },
        submittedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

const challengesListResponseSchema = {
  type: 'object',
  required: ['challenges'],
  additionalProperties: false,
  properties: { challenges: { type: 'array', items: challengeListItemSchema } },
} as const;

const challengeByIdResponseSchema = {
  type: 'object',
  required: ['challenge'],
  additionalProperties: false,
  properties: { challenge: challengeListItemSchema },
} as const;

const submitBodySchema = {
  type: 'object',
  required: ['answer'],
  additionalProperties: false,
  properties: {
    answer: {
      type: 'object',
      description: 'Challenge-specific answer object; its schema is enforced by the challenge spec',
    },
  },
} as const;

const submitResultSchema = {
  type: 'object',
  required: ['submissionId', 'status', 'score', 'feedback', 'evidenceCreated'],
  additionalProperties: false,
  properties: {
    submissionId: uuidSchema(),
    status: { type: 'string', enum: [...SUBMISSION_STATUSES] },
    score: { type: 'number', minimum: 0, maximum: 100 },
    feedback: { type: 'string' },
    evidenceCreated: { type: 'integer', minimum: 0 },
  },
} as const;

export function registerChallengeModule(app: FastifyInstance, service: ChallengeService): void {
  const controller = new ChallengeController(service);

  void app.register(
    async (scope) => {
      scope.get(
        '/challenges',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Challenges'],
            summary: 'List challenges with the participant latest attempt',
            operationId: 'challengesList',
            security: bearerAuth,
            querystring: querystring(challengesQuerySchema.properties),
            response: {
              200: okResponse('Challenges', challengesListResponseSchema),
              400: errResponse('Invalid filter parameters'),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.list(request, reply),
      );

      scope.get(
        '/challenges/:id',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Challenges'],
            summary: 'Get one challenge with the participant latest attempt',
            operationId: 'challengesGetById',
            security: bearerAuth,
            params: idParams('id', 'A valid challenge id'),
            response: {
              200: okResponse('Challenge', challengeByIdResponseSchema),
              400: errResponse('Invalid challenge id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Challenge not found'),
              500: errResponse('Could not load challenge'),
            },
          },
        },
        (request, reply) => controller.getById(request, reply),
      );

      scope.post(
        '/challenges/:id/submit',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Challenges'],
            summary: 'Submit a challenge answer',
            description: 'Scored deterministically by the backend. A passing submission creates evidence and awards achievements.',
            operationId: 'challengesSubmit',
            security: bearerAuth,
            params: idParams('id', 'A valid challenge id'),
            body: bodySchema(
              'Challenge answer',
              submitBodySchema,
              {
                answer: {
                  totalCredits: 250000,
                  totalDebits: 245000,
                  difference: 5000,
                  discrepancyFound: true,
                  explanation: 'The daily ledger credits exceed debits by 5,000, suggesting an unreconciled entry.',
                },
              },
            ),
            response: {
              200: okResponse('Submission result with deterministic score', submitResultSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Challenge not found or does not support submission'),
            },
          },
        },
        (request, reply) => controller.submit(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}