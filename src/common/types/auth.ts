export type UserRole = 'PARTICIPANT' | 'ORGANIZATION_ADMIN' | 'ORGANIZATION_MEMBER';

/**
 * The shape stored in the JWT payload and surfaced as `request.user` after
 * authentication. Never contains secrets or sensitive profile data.
 */
export interface AuthUser {
  id: string;
  role: UserRole;
  email?: string;
}