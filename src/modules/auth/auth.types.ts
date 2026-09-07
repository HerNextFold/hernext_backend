import type { UserRole } from '../../common/types/auth.js';

/** The user shape exposed through API responses. Never includes passwordHash. */
export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  role: UserRole;
}

export interface AuthResponseData {
  user: PublicUser;
  accessToken: string;
}