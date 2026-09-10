import type { FastifyInstance } from 'fastify';
import { ProgramController } from './program.controller.js';
import type { ProgramMonitoringService } from './program-monitoring.service.js';
import type { ProgramService } from './program.service.js';
import {
  bearerAuth,
  bodySchema,
  errResponse,
  idParams,
  okResponse,
  READINESS_LABELS,
  uuidSchema,
  type JsonSchema,
} from '../../common/openapi/schemas.js';

const programStatuses = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
const participantStatuses = ['ON_TRACK', 'NEEDS_ATTENTION', 'AT_RISK'] as const;

const programSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'organizationId', 'name', 'description', 'startDate', 'endDate', 'status', 'createdAt', 'updatedAt'],
  additionalProperties: false,
  properties: {
    id: uuidSchema('Program id'),
    organizationId: uuidSchema('Owning organization id'),
    name: { type: 'string' },
    description: { type: 'string' },
    startDate: { type: ['string', 'null'], format: 'date-time' },
    endDate: { type: ['string', 'null'], format: 'date-time' },
    status: { type: 'string', enum: [...programStatuses] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const createProgramBodySchema: JsonSchema = {
  type: 'object',
  required: ['name', 'description'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', minLength: 1, maxLength: 1000 },
    startDate: { type: 'string', format: 'date', description: 'ISO date such as 2026-09-15' },
    endDate: { type: 'string', format: 'date', description: 'ISO date such as 2026-12-15; must be after startDate' },
    status: { type: 'string', enum: [...programStatuses] },
  },
};

const programEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['program'],
  additionalProperties: false,
  properties: { program: programSchema },
};

const programsListEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['programs'],
  additionalProperties: false,
  properties: {
    programs: { type: 'array', items: programSchema },
  },
};

const participantSummarySchema: JsonSchema = {
  type: 'object',
  required: ['id', 'name', 'readinessScore', 'roadmapProgress', 'status'],
  additionalProperties: false,
  properties: {
    id: uuidSchema('Participant user id'),
    name: { type: 'string' },
    readinessScore: { type: 'number', minimum: 0, maximum: 100 },
    roadmapProgress: { type: 'number', minimum: 0, maximum: 100 },
    status: { type: 'string', enum: [...participantStatuses] },
  },
};

const participantsListEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['participants'],
  additionalProperties: false,
  properties: {
    participants: { type: 'array', items: participantSummarySchema },
  },
};

const participantDetailSchema: JsonSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'joinedAt',
    'lastActivityAt',
    'status',
    'currentCareerGoal',
    'readinessScore',
    'readinessLabel',
    'roadmapProgress',
    'challengeProgress',
    'assessmentCompleted',
    'skillsDeveloped',
    'evidenceCount',
    'hasPassport',
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema('Participant user id'),
    name: { type: 'string' },
    joinedAt: { type: 'string', format: 'date-time' },
    lastActivityAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: [...participantStatuses] },
    currentCareerGoal: { type: ['string', 'null'] },
    readinessScore: { type: 'number', minimum: 0, maximum: 100 },
    readinessLabel: { type: 'string', enum: [...READINESS_LABELS] },
    roadmapProgress: { type: 'number', minimum: 0, maximum: 100 },
    challengeProgress: { type: 'number', minimum: 0, maximum: 100 },
    assessmentCompleted: { type: 'boolean' },
    skillsDeveloped: { type: 'integer', minimum: 0 },
    evidenceCount: { type: 'integer', minimum: 0 },
    hasPassport: { type: 'boolean' },
  },
};

const participantDetailEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['participant'],
  additionalProperties: false,
  properties: { participant: participantDetailSchema },
};

const analyticsSchema: JsonSchema = {
  type: 'object',
  required: [
    'totalParticipants',
    'activeParticipants',
    'assessmentCompletion',
    'averageReadiness',
    'averageRoadmapProgress',
    'challengesCompleted',
    'evidenceCreated',
    'passportsCreated',
  ],
  additionalProperties: false,
  properties: {
    totalParticipants: { type: 'integer', minimum: 0 },
    activeParticipants: { type: 'integer', minimum: 0 },
    assessmentCompletion: { type: 'integer', minimum: 0, maximum: 100 },
    averageReadiness: { type: 'integer', minimum: 0, maximum: 100 },
    averageRoadmapProgress: { type: 'integer', minimum: 0, maximum: 100 },
    challengesCompleted: { type: 'integer', minimum: 0 },
    evidenceCreated: { type: 'integer', minimum: 0 },
    passportsCreated: { type: 'integer', minimum: 0 },
  },
};

const analyticsEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['analytics'],
  additionalProperties: false,
  properties: { analytics: analyticsSchema },
};

const reportSchema: JsonSchema = {
  type: 'object',
  required: [
    'program',
    'participants',
    'participationRate',
    'assessmentCompletion',
    'averageReadiness',
    'averageRoadmapProgress',
    'skillsDeveloped',
    'challengesCompleted',
    'evidenceCreated',
    'passportsCreated',
    'statusDistribution',
  ],
  additionalProperties: false,
  properties: {
    program: {
      type: 'object',
      required: ['id', 'name'],
      additionalProperties: false,
      properties: {
        id: uuidSchema('Program id'),
        name: { type: 'string' },
      },
    },
    participants: { type: 'integer', minimum: 0 },
    participationRate: { type: 'integer', minimum: 0, maximum: 100 },
    assessmentCompletion: { type: 'integer', minimum: 0, maximum: 100 },
    averageReadiness: { type: 'integer', minimum: 0, maximum: 100 },
    averageRoadmapProgress: { type: 'integer', minimum: 0, maximum: 100 },
    skillsDeveloped: { type: 'integer', minimum: 0 },
    challengesCompleted: { type: 'integer', minimum: 0 },
    evidenceCreated: { type: 'integer', minimum: 0 },
    passportsCreated: { type: 'integer', minimum: 0 },
    statusDistribution: {
      type: 'object',
      required: ['ON_TRACK', 'NEEDS_ATTENTION', 'AT_RISK'],
      additionalProperties: false,
      properties: {
        ON_TRACK: { type: 'integer', minimum: 0 },
        NEEDS_ATTENTION: { type: 'integer', minimum: 0 },
        AT_RISK: { type: 'integer', minimum: 0 },
      },
    },
  },
};

const reportEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['report'],
  additionalProperties: false,
  properties: { report: reportSchema },
};

const addParticipantBodySchema: JsonSchema = {
  type: 'object',
  required: ['userId'],
  additionalProperties: false,
  properties: {
    userId: uuidSchema('The participant user id to enroll'),
  },
};

export function registerProgramModule(
  app: FastifyInstance,
  programs: ProgramService,
  monitoring: ProgramMonitoringService,
): void {
  const controller = new ProgramController(programs, monitoring);

  void app.register(
    async (scope) => {
      scope.post(
        '/organizations/:organizationId/programs',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Organizations'],
            summary: 'Create a program',
            description: 'Requires an ADMIN role in the organization that owns the program (docs/API_CONTRACT.md §35).',
            operationId: 'programsCreate',
            security: bearerAuth,
            params: idParams('organizationId', 'A valid organization id'),
            body: bodySchema(
              'Program details',
              createProgramBodySchema,
              {
                name: 'Women in Fintech Career Transition Cohort',
                description: 'A 90-day career transition program.',
                startDate: '2026-09-15',
                endDate: '2026-12-15',
              },
            ),
            response: {
              201: okResponse('Program created', programEnvelopeSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not an organization member/admin'),
              404: errResponse('Organization not found'),
            },
          },
        },
        (request, reply) => controller.createProgram(request, reply),
      );

      scope.get(
        '/organizations/:organizationId/programs',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Organizations'],
            summary: 'List programs',
            description: 'Returns the programs of an organization the authenticated user belongs to (docs/API_CONTRACT.md §36).',
            operationId: 'programsList',
            security: bearerAuth,
            params: idParams('organizationId', 'A valid organization id'),
            response: {
              200: okResponse('Programs', programsListEnvelopeSchema),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member of this organization'),
              404: errResponse('Organization not found'),
            },
          },
        },
        (request, reply) => controller.listPrograms(request, reply),
      );

      scope.post(
        '/programs/:programId/participants',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Programs'],
            summary: 'Enroll a participant',
            description: 'Requires an ADMIN role in the organization that owns the program. A participant cannot be enrolled twice (docs/API_CONTRACT.md §37).',
            operationId: 'programsAddParticipant',
            security: bearerAuth,
            params: idParams('programId', 'A valid program id'),
            body: bodySchema('Participant enrollment', addParticipantBodySchema, { userId: '40f7c7b2-0000-4000-8000-000000000000' }),
            response: {
              201: okResponse('Participant enrolled', {
                type: 'object',
                required: ['participant'],
                additionalProperties: false,
                properties: {
                  participant: {
                    type: 'object',
                    required: ['programId', 'userId', 'joinedAt'],
                    additionalProperties: false,
                    properties: {
                      programId: uuidSchema('Program id'),
                      userId: uuidSchema('Participant user id'),
                      joinedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              }),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member/admin of the owning organization'),
              404: errResponse('Program or participant user not found'),
              409: errResponse('Participant already enrolled'),
            },
          },
        },
        (request, reply) => controller.addParticipant(request, reply),
      );

      scope.get(
        '/programs/:programId/participants',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Programs'],
            summary: 'List participants with monitoring summaries',
            description: 'Organization members can view participant summaries whose status is deterministic backend classification (docs/API_CONTRACT.md §38).',
            operationId: 'programsListParticipants',
            security: bearerAuth,
            params: idParams('programId', 'A valid program id'),
            response: {
              200: okResponse('Participants', participantsListEnvelopeSchema),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member of the owning organization'),
              404: errResponse('Program not found'),
            },
          },
        },
        (request, reply) => controller.listParticipants(request, reply),
      );

      scope.get(
        '/programs/:programId/participants/:participantId',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Programs'],
            summary: 'Get a participant monitoring detail',
            description: 'The participant must belong to the specified program and the caller must be a member of the owning organization (docs/API_CONTRACT.md §39).',
            operationId: 'programsGetParticipantDetail',
            security: bearerAuth,
            params: {
              type: 'object',
              required: ['programId', 'participantId'],
              additionalProperties: false,
              properties: {
                programId: uuidSchema('A valid program id'),
                participantId: uuidSchema('A valid participant user id'),
              },
            },
            response: {
              200: okResponse('Participant detail', participantDetailEnvelopeSchema),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member of the owning organization'),
              404: errResponse('Program or participant not found'),
            },
          },
        },
        (request, reply) => controller.getParticipantDetail(request, reply),
      );

      scope.get(
        '/programs/:programId/analytics',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Programs'],
            summary: 'Get aggregate program analytics',
            description: 'Derived from participant source records with documented empty-data rules (docs/SCORING_LOGIC.md §42–§47, docs/API_CONTRACT.md §40).',
            operationId: 'programsGetAnalytics',
            security: bearerAuth,
            params: idParams('programId', 'A valid program id'),
            response: {
              200: okResponse('Program analytics', analyticsEnvelopeSchema),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member of the owning organization'),
              404: errResponse('Program not found'),
            },
          },
        },
        (request, reply) => controller.getAnalytics(request, reply),
      );

      scope.get(
        '/programs/:programId/report',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Programs'],
            summary: 'Get a program impact report',
            description: 'Deterministic report derived from participant records; JSON only for the MVP (docs/PRODUCT_SPEC.md §30, docs/API_CONTRACT.md §41).',
            operationId: 'programsGetReport',
            security: bearerAuth,
            params: idParams('programId', 'A valid program id'),
            response: {
              200: okResponse('Program report', reportEnvelopeSchema),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member of the owning organization'),
              404: errResponse('Program not found'),
            },
          },
        },
        (request, reply) => controller.getReport(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}