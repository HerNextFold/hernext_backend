import type { FastifyInstance } from 'fastify';
import { OrganizationController } from './organization.controller.js';
import type { OrganizationService } from './organization.service.js';
import {
  bearerAuth,
  bodySchema,
  errResponse,
  idParams,
  okResponse,
  uuidSchema,
  type JsonSchema,
} from '../../common/openapi/schemas.js';

const organizationRoles = ['ADMIN', 'MEMBER'] as const;

export const organizationSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'name', 'description', 'country', 'role', 'createdAt', 'updatedAt'],
  additionalProperties: false,
  properties: {
    id: uuidSchema('Organization id'),
    name: { type: 'string' },
    description: { type: 'string' },
    country: { type: 'string' },
    role: { type: 'string', enum: [...organizationRoles], description: 'The authenticated caller\'s role in this organization' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const organizationEnvelopeSchema: JsonSchema = {
  type: 'object',
  required: ['organization'],
  additionalProperties: false,
  properties: { organization: organizationSchema },
};

const createOrganizationBodySchema: JsonSchema = {
  type: 'object',
  required: ['name', 'description', 'country'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', minLength: 1, maxLength: 1000 },
    country: { type: 'string', minLength: 1, maxLength: 100 },
  },
};

export function registerOrganizationModule(app: FastifyInstance, service: OrganizationService): void {
  const controller = new OrganizationController(service);

  void app.register(
    async (scope) => {
      scope.post(
        '/organizations',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Organizations'],
            summary: 'Create an organization',
            description: 'The authenticated user becomes the founding ADMIN. Creating an organization is the only organization route that does not require a prior membership.',
            operationId: 'organizationsCreate',
            security: bearerAuth,
            body: bodySchema(
              'Organization details',
              createOrganizationBodySchema,
              {
                name: 'Women in Finance Nigeria',
                description: 'Career development program for women.',
                country: 'Nigeria',
              },
            ),
            response: {
              201: okResponse('Organization created', organizationEnvelopeSchema),
              400: errResponse('Invalid request data'),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.create(request, reply),
      );

      scope.get(
        '/organizations/:organizationId',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Organizations'],
            summary: 'Get an organization',
            description: 'The authenticated user must be a member of the organization (docs/API_CONTRACT.md §34).',
            operationId: 'organizationsGetById',
            security: bearerAuth,
            params: idParams('organizationId', 'A valid organization id'),
            response: {
              200: okResponse('Organization', organizationEnvelopeSchema),
              401: errResponse('Unauthenticated'),
              403: errResponse('Not a member of this organization'),
              404: errResponse('Organization not found'),
            },
          },
        },
        (request, reply) => controller.getById(request, reply),
      );
    },
    { prefix: '/api/v1' },
  );
}