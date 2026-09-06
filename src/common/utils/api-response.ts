import type { FastifyReply } from 'fastify';
import type { SuccessEnvelope } from '../types/api.js';

function full<T>(data: T, message?: string): SuccessEnvelope<T> {
  return message === undefined ? { success: true, data } : { success: true, data, message };
}

/** Sends a 200 response in the documented success envelope. */
export function sendOk<T>(reply: FastifyReply, data: T, message?: string): FastifyReply {
  return reply.send(full(data, message));
}

/** Sends a 201 Created response in the documented success envelope. */
export function sendCreated<T>(reply: FastifyReply, data: T, message?: string): FastifyReply {
  reply.status(201);
  return reply.send(full(data, message));
}