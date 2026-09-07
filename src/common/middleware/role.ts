import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { errorCodes } from '../errors/error-codes.js';
import type { UserRole } from '../types/auth.js';

/**
 * PreHandler factory enforcing role-based access control.
 * Use after `authenticate`, e.g.
 * `{ preHandler: [authenticate, requireRole('ORGANIZATION_ADMIN')] }`.
 */
export function requireRole(...roles: readonly UserRole[]) {
  return async (request: FastifyRequest): Promise<void> => {
    let role: UserRole | undefined;
    try {
      role = request.user.role;
    } catch {
      role = undefined;
    }
    if (role === undefined || !roles.includes(role)) {
      throw new AppError(errorCodes.FORBIDDEN, 'You do not have permission to perform this action', 403);
    }
  };
}