import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { RegisteredRoute } from '../src/plugins/route-registry.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface DocMatrixEntry {
  method: HttpMethod;
  path: string;
  /** Expected to carry a JSON request body (write endpoints). */
  hasBody?: boolean;
  /** Expected to be reachable without authentication. */
  public?: boolean;
}

/**
 * The full endpoint smoke-test matrix (docs/API_SMOKE_TEST.md). Every entry is
 * verified to be registered as a route AND documented in the OpenAPI document.
 */
const ROUTE_MATRIX: DocMatrixEntry[] = [
  { method: 'POST', path: '/api/v1/auth/register', hasBody: true, public: true },
  { method: 'POST', path: '/api/v1/auth/verify-email-otp', hasBody: true, public: true },
  { method: 'POST', path: '/api/v1/auth/resend-email-verification', hasBody: true, public: true },
  { method: 'POST', path: '/api/v1/auth/login', hasBody: true, public: true },
  { method: 'POST', path: '/api/v1/auth/logout' },
  { method: 'GET', path: '/api/v1/auth/me' },
  { method: 'POST', path: '/api/v1/auth/forgot-password', hasBody: true, public: true },
  { method: 'POST', path: '/api/v1/auth/verify-reset-otp', hasBody: true, public: true },
  { method: 'POST', path: '/api/v1/auth/reset-password', hasBody: true, public: true },

  { method: 'GET', path: '/api/v1/profile' },
  { method: 'PUT', path: '/api/v1/profile', hasBody: true },

  { method: 'POST', path: '/api/v1/experiences', hasBody: true },
  { method: 'GET', path: '/api/v1/experiences' },
  { method: 'GET', path: '/api/v1/experiences/:id' },
  { method: 'PUT', path: '/api/v1/experiences/:id', hasBody: true },
  { method: 'DELETE', path: '/api/v1/experiences/:id' },

  { method: 'POST', path: '/api/v1/ai/career-impact/:experienceId' },
  { method: 'GET', path: '/api/v1/ai/career-impact/:experienceId' },
  { method: 'POST', path: '/api/v1/ai/transferable-skills/:experienceId' },
  { method: 'GET', path: '/api/v1/ai/transferable-skills' },
  { method: 'POST', path: '/api/v1/ai/career-recommendations' },
  { method: 'GET', path: '/api/v1/careers/recommendations' },
  { method: 'GET', path: '/api/v1/careers/:careerId/skill-gaps' },
  { method: 'POST', path: '/api/v1/roadmaps/generate', hasBody: true },
  { method: 'GET', path: '/api/v1/roadmaps/current' },
  { method: 'POST', path: '/api/v1/ai/skill-gaps/:careerId' },
  { method: 'POST', path: '/api/v1/ai/roadmap/:careerId' },
  { method: 'GET', path: '/api/v1/ai/roadmap' },

  { method: 'GET', path: '/api/v1/achievements' },

  { method: 'GET', path: '/api/v1/progress' },
  { method: 'GET', path: '/api/v1/progress/summary' },
  { method: 'GET', path: '/api/v1/progress/next-action' },
  { method: 'PATCH', path: '/api/v1/roadmaps/tasks/:taskId', hasBody: true },

  { method: 'GET', path: '/api/v1/challenges' },
  { method: 'GET', path: '/api/v1/challenges/:id' },
  { method: 'POST', path: '/api/v1/challenges/:id/submit', hasBody: true },

  { method: 'GET', path: '/api/v1/evidence' },
  { method: 'GET', path: '/api/v1/evidence/:id' },

  { method: 'GET', path: '/api/v1/passport' },
  { method: 'POST', path: '/api/v1/passport/generate', hasBody: true },
  { method: 'GET', path: '/api/v1/passport/public/:slug', public: true },

  { method: 'POST', path: '/api/v1/organizations', hasBody: true },
  { method: 'GET', path: '/api/v1/organizations/:organizationId' },
  { method: 'POST', path: '/api/v1/organizations/:organizationId/programs', hasBody: true },
  { method: 'GET', path: '/api/v1/organizations/:organizationId/programs' },
  { method: 'POST', path: '/api/v1/programs/:programId/participants', hasBody: true },
  { method: 'GET', path: '/api/v1/programs/:programId/participants' },
  { method: 'GET', path: '/api/v1/programs/:programId/participants/:participantId' },
  { method: 'GET', path: '/api/v1/programs/:programId/analytics' },
  { method: 'GET', path: '/api/v1/programs/:programId/report' },

  { method: 'GET', path: '/health', public: true },
];

/** `:experienceId` -> `{experienceId}`. */
function openApiPathFor(routePath: string): string {
  return routePath.replace(/:([A-Za-z]+)/g, '{$1}');
}

function pathParamsOf(routePath: string): string[] {
  const params: string[] = [];
  for (const match of routePath.matchAll(/:([A-Za-z]+)/g)) {
    const name = match[1];
    if (name !== undefined) params.push(name);
  }
  return params;
}

function has2xx(response: Record<string, unknown>): boolean {
  return Object.keys(response).some((status) => status === '200' || status === '201');
}

describe('OpenAPI documentation covers every API endpoint (Phase 5C)', () => {
  const app: FastifyInstance = buildApp({ logger: false });
  let doc: { paths: Record<string, Record<string, unknown>> };

  beforeAll(async () => {
    await app.ready();
    const swagger = app.swagger();
    doc = swagger as { paths: Record<string, Record<string, unknown>> };
  });

  afterAll(async () => {
    await app.close();
  });

  function operationFor(entry: DocMatrixEntry): { path: string; op: Record<string, unknown> } | null {
    const path = openApiPathFor(entry.path);
    const pathItem = doc.paths[path];
    if (pathItem === undefined) return null;
    const op = pathItem[entry.method.toLowerCase()] as Record<string, unknown> | undefined;
    if (op === undefined) return null;
    return { path, op };
  }

  it('registers every endpoint in the smoke matrix', () => {
    for (const entry of ROUTE_MATRIX) {
      expect(operationFor(entry), `${entry.method} ${entry.path} must be registered`).not.toBeNull();
    }
  });

  it('documents every actually-registered API route without omissions', () => {
    const registered = (app as unknown as { hernextRoutes: RegisteredRoute[] }).hernextRoutes.filter(
      (route) => route.url === '/health' || route.url.startsWith('/api/v1'),
    );
    expect(registered.length).toBeGreaterThan(0);

    for (const route of registered) {
      const method = route.method.toLowerCase();
      const path = openApiPathFor(route.url);
      expect(doc.paths[path]?.[method], `OpenAPI must document ${method.toUpperCase()} ${route.url}`).toBeDefined();
    }
  });

  it('declares path parameters for dynamic routes', () => {
    for (const entry of ROUTE_MATRIX) {
      const params = pathParamsOf(entry.path);
      if (params.length === 0) continue;
      const found = operationFor(entry);
      if (found === null) continue;
      const parameters = found.op.parameters as Array<Record<string, unknown>> | undefined;
      expect(parameters, `${entry.method} ${entry.path} must declare parameters`).toBeDefined();
      for (const param of params) {
        const declared = parameters?.find((p) => p.in === 'path' && p.name === param);
        expect(declared, `${entry.method} ${entry.path}: path param ${param}`).toBeDefined();
        expect(declared?.required).toBe(true);
      }
    }
  });

  it('declares a request body for write endpoints', () => {
    for (const entry of ROUTE_MATRIX) {
      const found = operationFor(entry);
      if (found === null) continue;
      if (entry.hasBody === true) {
        expect(found.op.requestBody, `${entry.method} ${entry.path} must declare a request body`).toBeDefined();
      }
    }
  });

  it('marks protected endpoints as requiring bearer auth and leaves public endpoints open', () => {
    for (const entry of ROUTE_MATRIX) {
      const found = operationFor(entry);
      if (found === null) continue;
      const security = found.op.security as Array<Record<string, unknown>> | undefined;
      if (entry.public === true) {
        expect(security, `${entry.method} ${entry.path} must be public`).toBeUndefined();
      } else {
        expect(security, `${entry.method} ${entry.path} must require bearer auth`).toBeDefined();
        expect(
          security?.some((requirement) => requirement.bearerAuth !== undefined),
          `${entry.method} ${entry.path} must use the bearerAuth scheme`,
        ).toBe(true);
      }
    }
  });

  it('documents success and (for protected routes) 401 responses', () => {
    for (const entry of ROUTE_MATRIX) {
      const found = operationFor(entry);
      if (found === null) continue;
      const responses = found.op.responses as Record<string, unknown> | undefined;
      expect(responses, `${entry.method} ${entry.path} must declare responses`).toBeDefined();
      expect(has2xx(responses ?? {}), `${entry.method} ${entry.path} must document a 2xx success`).toBe(true);
      if (entry.public !== true) {
        expect(responses?.['401'], `${entry.method} ${entry.path} must document 401`).toBeDefined();
      }
    }
  });

  describe('documented request enums match the Zod schemas', () => {
    function bodySchemaOf(op: Record<string, unknown>): Record<string, unknown> | undefined {
      const content = (op.requestBody as { content?: Record<string, unknown> } | undefined)?.content;
      const json = content?.['application/json'] as { schema?: Record<string, unknown> } | undefined;
      return json?.schema;
    }

    it('register role enum', () => {
      const found = operationFor({ method: 'POST', path: '/api/v1/auth/register' });
      const schema = found ? bodySchemaOf(found.op) : undefined;
      const role = schema?.properties as { role?: Record<string, unknown> } | undefined;
      expect(role?.role?.enum).toEqual(['PARTICIPANT', 'ORGANIZATION_ADMIN', 'ORGANIZATION_MEMBER']);
    });

    it('experience employmentType enum', () => {
      const found = operationFor({ method: 'POST', path: '/api/v1/experiences' });
      const schema = found ? bodySchemaOf(found.op) : undefined;
      const properties = schema?.properties as { employmentType?: Record<string, unknown> } | undefined;
      expect(properties?.employmentType?.enum).toEqual([
        'EMPLOYED',
        'SELF_EMPLOYED',
        'FREELANCER',
        'STUDENT',
        'UNEMPLOYED',
        'INFORMAL_WORKER',
      ]);
    });

    it('roadmap task status enum', () => {
      const found = operationFor({ method: 'PATCH', path: '/api/v1/roadmaps/tasks/:taskId' });
      const schema = found ? bodySchemaOf(found.op) : undefined;
      const properties = schema?.properties as { status?: Record<string, unknown> } | undefined;
      expect(properties?.status?.enum).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
    });

    it('challenges difficulty query enum', () => {
      const found = operationFor({ method: 'GET', path: '/api/v1/challenges' });
      const parameters = found?.op.parameters as Array<Record<string, unknown>> | undefined;
      const difficulty = parameters?.find((p) => p.name === 'difficulty');
      const enum_ = (difficulty?.schema as Record<string, unknown> | undefined)?.enum;
      expect(enum_).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
    });
  });

  describe('documented request examples for the prioritized endpoints', () => {
    function exampleOf(op: Record<string, unknown>): unknown {
      const content = (op.requestBody as { content?: Record<string, unknown> } | undefined)?.content;
      const json = content?.['application/json'] as { example?: unknown } | undefined;
      return json?.example;
    }

    it.each([
      ['/api/v1/auth/register', 'POST'],
      ['/api/v1/auth/login', 'POST'],
      ['/api/v1/profile', 'PUT'],
      ['/api/v1/experiences', 'POST'],
      ['/api/v1/roadmaps/generate', 'POST'],
      ['/api/v1/roadmaps/tasks/:taskId', 'PATCH'],
      ['/api/v1/challenges/:id/submit', 'POST'],
      ['/api/v1/passport/generate', 'POST'],
    ])('provides an example for %s (%s)', (path, method) => {
      const found = operationFor({ method: method as HttpMethod, path });
      expect(found, `${method} ${path} must be documented`).not.toBeNull();
      expect(exampleOf(found!.op)).toBeDefined();
    });
  });
});