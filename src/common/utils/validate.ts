import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error.js';
import { errorCodes } from '../errors/error-codes.js';

/**
 * Validates `value` against a Zod schema, throwing a safe 400 VALIDATION_ERROR
 * carrying the Zod issue list when validation fails. Controllers use this at
 * the top of every handler so invalid input never reaches business logic.
 */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid request data', 400, result.error.issues);
  }
  return result.data;
}