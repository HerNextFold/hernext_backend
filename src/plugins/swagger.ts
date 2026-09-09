import type { FastifyInstance } from 'fastify';
import type { OpenAPIV3_1 } from 'openapi-types';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { errorResponseSchema } from '../common/openapi/schemas.js';

/**
 * OpenAPI docs served at /docs (Phase 5C).
 *
 * Route `schema` metadata drives the OpenAPI document only. A pass-through
 * validator compiler keeps the framework from running Ajv on request bodies,
 * params or querystrings - Zod remains the single source of request validation
 * in the controllers (`parseOrThrow`). A pass-through response serializer
 * compiler similarly keeps fast-json-stringify from stripping or validating
 * response payloads against the documented schemas (which would otherwise
 * silently drop fields such as the development reset token, or turn a valid
 * error into a 500). Documented schemas therefore never change runtime
 * behaviour. Kept aligned with docs/API_CONTRACT.md.
 */
export function registerSwagger(app: FastifyInstance): void {
  // Documentation-only schemas: validation stays in Zod (docs/API_CONTRACT.md §43).
  app.setValidatorCompiler(() => {
    return (data: unknown) => ({ value: data, errors: [] });
  });

  // Documentation-only response schemas: emit the payload as-is so documented
  // shapes can never alter what the client receives (docs/API_CONTRACT.md §43).
  app.setSerializerCompiler(() => {
    return (data: unknown) => JSON.stringify(data);
  });

  void app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'HerNext API',
        description:
          'HerNext backend API - AI-powered career transition and evidence platform. ' +
          'Protected endpoints require an Authorization: Bearer <jwt> header. ' +
          'Error responses always use { success, error: { code, message, details } }.',
        version: '1.0.0',
      },
      servers: [],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Paste the access token returned by POST /auth/login or /auth/register.',
          },
        },
        schemas: {
          ErrorResponse: errorResponseSchema,
        },
      },
    },
    // Root-level routes are outside @fastify/swagger's plugin scope and are not
    // captured automatically, so the liveness probe path is injected here. The
    // runtime payload is `{ openapiObject }` (the OpenAPI document being built).
    // Protected operations also get a standard 401 response so consumers never
    // have to guess which endpoints require authentication.
    transformObject: (input) => {
      const { openapiObject } = input as { openapiObject: { paths: Record<string, unknown> } };
      openapiObject.paths['/health'] = {
        get: {
          tags: ['Health'],
          summary: 'Liveness and database connectivity probe',
          description: 'Public endpoint. Returns the documented success envelope; the database field is advisory.',
          operationId: 'healthCheck',
          responses: {
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
                    },
                  },
                },
              },
            },
          },
        },
      };

      const error401 = {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      };
      for (const pathKey of Object.keys(openapiObject.paths)) {
        const pathItem = openapiObject.paths[pathKey] as Record<string, unknown>;
        for (const operation of Object.values(pathItem)) {
          if (typeof operation !== 'object' || operation === null) continue;
          const op = operation as { security?: unknown; responses?: Record<string, unknown> };
          if (!op.security) continue;
          const responses = (op.responses ?? {}) as Record<string, unknown>;
          if (responses['401'] === undefined) responses['401'] = error401;
        }
      }

      return openapiObject as unknown as Partial<OpenAPIV3_1.Document>;
    },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });
}