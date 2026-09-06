import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('GET /health', () => {
  const app: FastifyInstance = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the documented success envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(['connected', 'disconnected']).toContain(body.data.database);
  });
});