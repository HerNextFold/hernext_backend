import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { requireRole } from '../src/common/middleware/role.js';

describe('RBAC role protection', () => {
  const app: FastifyInstance = buildApp({ logger: false });

  beforeAll(async () => {
    app.get(
      '/admin-only',
      { preHandler: [app.authenticate, requireRole('ORGANIZATION_ADMIN')] },
      async () => ({ ok: true }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  function tokenFor(role: 'PARTICIPANT' | 'ORGANIZATION_ADMIN'): string {
    return app.jwt.sign({ id: '00000000-0000-4000-8000-000000000000', role });
  }

  async function callAdminOnly(token: string | undefined) {
    return app.inject({
      method: 'GET',
      url: '/admin-only',
      ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
    });
  }

  it('requires authentication', async () => {
    const response = await callAdminOnly(undefined);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('forbids a participant from an admin-only route', async () => {
    const response = await callAdminOnly(tokenFor('PARTICIPANT'));
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('allows an organization admin through an admin-only route', async () => {
    const response = await callAdminOnly(tokenFor('ORGANIZATION_ADMIN'));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});