import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('routing', () => {
  const app: FastifyInstance = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it('returns the documented 404 error envelope for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.message).toBe('Route not found');
  });

  it('returns the documented validation envelope for unknown HTTP methods', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/health' });
    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
  });
});