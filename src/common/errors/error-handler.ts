import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './app-error.js';
import { errorCodes } from './error-codes.js';

const STATUS_TO_CODE: Record<number, string> = {
  400: errorCodes.VALIDATION_ERROR,
  401: errorCodes.AUTHENTICATION_REQUIRED,
  403: errorCodes.FORBIDDEN,
  404: errorCodes.RESOURCE_NOT_FOUND,
  409: errorCodes.RESOURCE_ALREADY_EXISTS,
  429: errorCodes.RATE_LIMIT_EXCEEDED,
};

const STATUS_TO_MESSAGE: Record<number, string> = {
  400: 'Invalid request data',
  401: 'Authentication is required',
  403: 'You do not have permission to perform this action',
  404: 'Route not found',
  409: 'The resource already exists',
  429: 'Rate limit exceeded. Please try again later.',
};

export function errorToEnvelope(error: unknown): {
  code: string;
  message: string;
  details: unknown;
} {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details ?? [],
    };
  }
  return {
    code: errorCodes.INTERNAL_SERVER_ERROR,
    message: 'Something went wrong.',
    details: [],
  };
}

/**
 * Centralised error handler. Never leaks stack traces, Prisma/database
 * internals, AI provider details or filesystem paths to clients.
 *
 * Detailed diagnostics for unexpected errors are written to the server log
 * only (see docs/SECURITY_SPEC.md §14 and §40).
 */
export function handleError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      success: false,
      error: errorToEnvelope(error),
    });
    return;
  }

  // Fastify request validation failures (schema validation, malformed JSON).
  if (Array.isArray(error.validation) || error.code === 'FST_ERR_VALIDATION') {
    reply.status(400).send({
      success: false,
      error: {
        code: errorCodes.VALIDATION_ERROR,
        message: 'Invalid request data',
        details: error.validation ?? [],
      },
    });
    return;
  }

  // Known Fastify-level HTTP errors (e.g. rate limiting) mapped to safe codes.
  if (typeof error.statusCode === 'number' && error.statusCode < 500) {
    reply.status(error.statusCode).send({
      success: false,
      error: {
        code: STATUS_TO_CODE[error.statusCode] ?? errorCodes.VALIDATION_ERROR,
        message: STATUS_TO_MESSAGE[error.statusCode] ?? 'Request could not be processed',
        details: [],
      },
    });
    return;
  }

  request.log.error({ err: error }, 'Unhandled error');
  reply.status(500).send({
    success: false,
    error: errorToEnvelope(undefined),
  });
}