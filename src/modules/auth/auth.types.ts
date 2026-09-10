import type { UserRole } from '../../common/types/auth.js';

/** The user shape exposed through API responses. Never includes passwordHash. */
export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  role: UserRole;
  emailVerified: boolean;
}

/** Issued after successful login or email verification. */
export interface AuthResponseData {
  user: PublicUser;
  accessToken: string;
}

/**
 * Registration creates an UNVERIFIED account and returns no access token.
 * The account becomes usable only after email verification (docs/API_CONTRACT.md §5).
 */
export interface RegisterResponseData {
  user: PublicUser;
  verificationStatus: 'PENDING';
}

export interface ForgotPasswordResponseData {
  // Always empty: the account cannot be enumerated through this endpoint.
  resetToken?: undefined;
}

/** Returned after a successful PASSWORD_RESET OTP proof (docs/API_CONTRACT.md §9a). */
export interface VerifyResetOtpResponseData {
  resetToken: string;
}