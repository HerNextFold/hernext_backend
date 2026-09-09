import type { FastifyInstance } from 'fastify';
import { EvidenceController } from './evidence.controller.js';
import type { EvidenceService } from './evidence.service.js';
import { bearerAuth, errResponse, idParams, okResponse, uuidSchema } from '../../common/openapi/schemas.js';

const EVIDENCE_STATUSES = ['PENDING', 'VERIFIED'] as const;

const evidenceItemSchema = {
  type: 'object',
  required: [
    'id',
    'challengeId',
    'skillId',
    'skillName',
    'title',
    'description',
    'result',
    'status',
    'createdAt',
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema(),
    challengeId: { type: ['string', 'null'], format: 'uuid' },
    skillId: { type: ['string', 'null'], format: 'uuid' },
    skillName: { type: ['string', 'null'] },
    title: { type: 'string' },
    description: { type: 'string' },
    result: { type: 'string' },
    status: { type: 'string', enum: [...EVIDENCE_STATUSES], description: 'Evidence is never auto-verified' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const evidenceListResponseSchema = {
  type: 'object',
  required: ['evidence'],
  additionalProperties: false,
  properties: { evidence: { type: 'array', items: evidenceItemSchema } },
} as const;

const evidenceByIdResponseSchema = {
  type: 'object',
  required: ['evidence'],
  additionalProperties: false,
  properties: { evidence: evidenceItemSchema },
} as const;

export function registerEvidenceModule(app: FastifyInstance, service: EvidenceService): void {
  const controller = new EvidenceController(service);

  void app.register(
    async (scope) => {
      scope.get(
        '/evidence',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Evidence'],
            summary: 'List the authenticated participant evidence',
            operationId: 'evidenceList',
            security: bearerAuth,
            response: {
              200: okResponse('Evidence', evidenceListResponseSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.list(request, reply),
      );

      scope.get(
        '/evidence/:id',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Evidence'],
            summary: 'Get one owned evidence item',
            description: 'Returns 404 for missing or other participants rows.',
            operationId: 'evidenceGetById',
            security: bearerAuth,
            params: idParams('id', 'A valid evidence id'),
            response: {
              200: okResponse('Evidence', evidenceByIdResponseSchema),
              400: errResponse('Invalid evidence id'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Evidence not found'),
            },
          },
        },
        (request, reply) => controller.getById(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}