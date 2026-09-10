import type { FastifyInstance } from 'fastify';
import { ProgressController } from './progress.controller.js';
import type { ProgressService } from './progress.service.js';
import {
  READINESS_LABELS,
  TASK_STATUSES,
  bearerAuth,
  bodySchema,
  errResponse,
  idParams,
  impactSnapshotSchema,
  okResponse,
  uuidSchema,
} from '../../common/openapi/schemas.js';

const progressResponseSchema = {
  type: 'object',
  required: [
    'overallProgress',
    'roadmapProgress',
    'challengeProgress',
    'evidenceCount',
    'skillsDeveloped',
    'skillsRemaining',
    'readinessScore',
    'readinessLabel',
  ],
  additionalProperties: false,
  properties: {
    overallProgress: { type: 'number', minimum: 0, maximum: 100 },
    roadmapProgress: { type: 'number', minimum: 0, maximum: 100 },
    challengeProgress: { type: 'number', minimum: 0, maximum: 100 },
    evidenceCount: { type: 'integer', minimum: 0 },
    skillsDeveloped: { type: 'integer', minimum: 0 },
    skillsRemaining: { type: 'integer', minimum: 0 },
    readinessScore: { type: 'number', minimum: 0, maximum: 100 },
    readinessLabel: { type: 'string', enum: [...READINESS_LABELS] },
  },
} as const;

const readinessBreakdownSchema = {
  type: 'object',
  required: ['experience', 'skills', 'aiReadiness', 'evidence'],
  additionalProperties: false,
  properties: {
    experience: { type: 'number', minimum: 0, maximum: 100 },
    skills: { type: 'number', minimum: 0, maximum: 100 },
    aiReadiness: { type: 'number', minimum: 0, maximum: 100 },
    evidence: { type: 'number', minimum: 0, maximum: 100 },
  },
} as const;

const progressSummaryResponseSchema = {
  type: 'object',
  required: [
    'currentCareerGoal',
    'careerReadiness',
    'readinessLabel',
    'readinessBreakdown',
    'roadmapProgress',
    'aiImpact',
    'skillsDeveloped',
    'skillsRemaining',
    'challengesCompleted',
    'evidenceCreated',
  ],
  additionalProperties: false,
  properties: {
    currentCareerGoal: { type: ['string', 'null'] },
    careerReadiness: { type: 'number', minimum: 0, maximum: 100 },
    readinessLabel: { type: 'string', enum: [...READINESS_LABELS] },
    readinessBreakdown: readinessBreakdownSchema,
    roadmapProgress: { type: 'number', minimum: 0, maximum: 100 },
    aiImpact: impactSnapshotSchema,
    skillsDeveloped: { type: 'integer', minimum: 0 },
    skillsRemaining: { type: 'integer', minimum: 0 },
    challengesCompleted: { type: 'integer', minimum: 0 },
    evidenceCreated: { type: 'integer', minimum: 0 },
  },
} as const;

const NEXT_ACTION_TYPES = [
  'COMPLETE_PROFILE',
  'ADD_EXPERIENCE',
  'COMPLETE_ASSESSMENT',
  'DISCOVER_SKILLS',
  'SELECT_CAREER',
  'REVIEW_SKILL_GAPS',
  'COMPLETE_ROADMAP_TASK',
  'COMPLETE_CHALLENGE',
  'CREATE_EVIDENCE',
  'GENERATE_PASSPORT',
  'JOURNEY_COMPLETE',
] as const;

const nextActionResponseSchema = {
  type: 'object',
  required: ['type', 'action', 'reason'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: [...NEXT_ACTION_TYPES] },
    action: { type: 'string' },
    reason: { type: 'string' },
    resourceId: { type: ['string'], format: 'uuid', description: 'Resource to act on when applicable' },
  },
} as const;

const taskStatusBodySchema = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: [...TASK_STATUSES] },
  },
} as const;

const updateTaskResponseSchema = {
  type: 'object',
  required: ['taskId', 'status', 'completedAt', 'roadmapProgress', 'phaseProgress'],
  additionalProperties: false,
  properties: {
    taskId: uuidSchema(),
    status: { type: 'string', enum: [...TASK_STATUSES] },
    completedAt: { type: ['string', 'null'], format: 'date-time' },
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
  },
} as const;

export function registerProgressModule(app: FastifyInstance, service: ProgressService): void {
  const controller = new ProgressController(service);

  void app.register(
    async (scope) => {
      scope.get(
        '/progress',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Progress'],
            summary: 'Get overall participant progress',
            description: 'All values are derived from source records by backend scoring (docs/SCORING_LOGIC.md).',
            operationId: 'progressGet',
            security: bearerAuth,
            response: {
              200: okResponse('Progress', progressResponseSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.get(request, reply),
      );

      scope.get(
        '/progress/summary',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Progress'],
            summary: 'Get a progress summary for dashboards',
            operationId: 'progressGetSummary',
            security: bearerAuth,
            response: {
              200: okResponse('Progress summary', progressSummaryResponseSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.getSummary(request, reply),
      );

      scope.get(
        '/progress/next-action',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Progress'],
            summary: 'Get the single next best action',
            description: 'Deterministic backend priority logic; no LLM is used to select the action.',
            operationId: 'progressGetNextAction',
            security: bearerAuth,
            response: {
              200: okResponse('Next best action', nextActionResponseSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.getNextAction(request, reply),
      );

      scope.patch(
        '/roadmaps/tasks/:taskId',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Roadmap'],
            summary: 'Update a roadmap task status',
            description: 'Progress in the response is recomputed from the underlying tasks; it is never supplied by the client.',
            operationId: 'roadmapsUpdateTask',
            security: bearerAuth,
            params: idParams('taskId', 'A valid roadmap task id'),
            body: bodySchema(
              'Task status transition',
              taskStatusBodySchema,
              { status: 'COMPLETED' },
            ),
            response: {
              200: okResponse('Task updated with recomputed progress', updateTaskResponseSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
              404: errResponse('Roadmap task not found'),
            },
          },
        },
        (request, reply) => controller.updateTask(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}