import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { getPool, withTransaction } from '../../lib/db.js';
import {
  consumeOtp,
  findActiveOtpForUpdate,
  incrementOtpAttempts,
  insertOtp,
  invalidateActiveOtps,
  invalidateOtpById,
  otpExpiresAt,
} from '../../models/auth-otp.model.js';
import {
  consumePasswordResetToken,
  deleteUserPasswordResetTokens,
  insertPasswordResetToken,
} from '../../models/password-reset.model.js';
import {
  findUserByEmail,
  findUserById,
  insertParticipantProfile,
  insertUser,
  markUserVerified,
  updateUserPasswordHash,
  type UserRow,
} from '../../models/user.model.js';
import { renderOtpEmail, type EmailProvider } from './email/index.js';
import {
  generateOtp,
  hashOtp,
  hashToken,
  otpMatches,
  OTP_LIFETIME_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  RESET_TOKEN_TTL_MS,
} from './otp.util.js';
import type { OtpPurpose } from './otp.util.js';
import type {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyCodeBody,
} from './auth.schemas.js';
import type {
  AuthResponseData,
  ForgotPasswordResponseData,
  PublicUser,
  RegisterResponseData,
  VerifyResetOtpResponseData,
} from './auth.types.js';

const SALT_ROUNDS = 10;
const RESET_TOKEN_BYTES = 32;

/**
 * A valid bcrypt hash of a random password. When login fails because the email
 * is unknown, we still run bcrypt.compare against this hash so the response
 * timing does not leak whether an account exists (SECURITY_SPEC.md §47).
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing-0123456789', SALT_ROUNDS);

export interface AccessTokenSigner {
  signAccessToken(user: Pick<UserRow, 'id' | 'role'>): string;
}

export interface AuthServiceOptions {
  signAccessToken(user: Pick<UserRow, 'id' | 'role'>): string;
  emailProvider: EmailProvider;
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    country: user.country,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

export class AuthService {
  constructor(private readonly options: AuthServiceOptions) {}

  /**
   * Registration always returns a verification-pending response and NEVER a
   * token. The account is created UNVERIFIED; an access token is only issued
   * after a successful email OTP proof (docs/API_CONTRACT.md §5, §5a).
   */
  async register(input: RegisterBody): Promise<RegisterResponseData> {
    if (input.role !== 'PARTICIPANT') {
      throw new AppError(
        errorCodes.FORBIDDEN,
        'Accounts cannot be created with an organization role.',
        403,
      );
    }

    const userId = await withTransaction(async (client) => {
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      const created = await insertUser(client, {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        country: input.country,
      });
      await insertParticipantProfile(client, created.id);
      return created.id;
    });

    const user = await findUserById(undefined, userId);
    if (user === null) {
      throw new AppError(errorCodes.INTERNAL_SERVER_ERROR, 'Account creation failed.', 500);
    }

    await this.issueOtp(user.id, 'EMAIL_VERIFICATION');

    return { user: toPublicUser(user), verificationStatus: 'PENDING' };
  }

  async login(input: LoginBody): Promise<AuthResponseData> {
    const user = await findUserByEmail(undefined, input.email);
    if (user === null) {
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      throw this.invalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw this.invalidCredentialsError();
    }

    if (!user.isActive) {
      throw new AppError(errorCodes.ACCOUNT_DISABLED, 'This account has been disabled.', 403);
    }

    if (!user.emailVerified) {
      throw new AppError(
        errorCodes.ACCOUNT_UNVERIFIED,
        'Please verify your email address before logging in.',
        403,
      );
    }

    return {
      user: toPublicUser(user),
      accessToken: this.options.signAccessToken({ id: user.id, role: user.role }),
    };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await findUserById(undefined, userId);
    if (user === null || !user.isActive) {
      throw new AppError(errorCodes.AUTHENTICATION_REQUIRED, 'This account is no longer available.', 401);
    }
    return toPublicUser(user);
  }

  /**
   * Proves possession of the email by validating and consuming an
   * EMAIL_VERIFICATION OTP. Marks the account verified and issues the first
   * normal access token. Every failure path returns the same generic error so
   * the endpoint cannot enumerate or probe accounts (docs/SECURITY_SPEC.md §47).
   */
  async verifyEmailOtp(input: VerifyCodeBody): Promise<AuthResponseData> {
    const user = await findUserByEmail(undefined, input.email);
    if (user === null || !user.isActive) {
      throw this.invalidOtpError();
    }

    const verified = await withTransaction(async (client) => {
      const otp = await findActiveOtpForUpdate(client, user.id, 'EMAIL_VERIFICATION');
      if (otp === null) {
        return false;
      }
      if (otp.attempts >= OTP_MAX_ATTEMPTS) {
        await invalidateOtpById(client, otp.id);
        return false;
      }
      if (!otpMatches(input.code, otp.codeHash)) {
        await incrementOtpAttempts(client, otp.id);
        if (otp.attempts + 1 >= OTP_MAX_ATTEMPTS) {
          await invalidateOtpById(client, otp.id);
        }
        return false;
      }
      await consumeOtp(client, otp.id);
      await markUserVerified(client, user.id);
      return true;
    });

    if (!verified) {
      throw this.invalidOtpError();
    }

    const verifiedUser = await findUserById(undefined, user.id);
    if (verifiedUser === null) {
      throw new AppError(errorCodes.INTERNAL_SERVER_ERROR, 'Account verification failed.', 500);
    }

    return {
      user: toPublicUser(verifiedUser),
      accessToken: this.options.signAccessToken({ id: verifiedUser.id, role: verifiedUser.role }),
    };
  }

  /**
   * Re-issues an EMAIL_VERIFICATION OTP, subject to a resend cooldown. Always
   * returns the same generic outcome; unknown/unverified state is never
   * revealed (docs/SECURITY_SPEC.md §47).
   */
  async resendEmailVerification(input: ForgotPasswordBody): Promise<Record<string, never>> {
    const user = await findUserByEmail(undefined, input.email);
    if (user === null || !user.isActive || user.emailVerified) {
      return {};
    }

    await this.issueOtp(user.id, 'EMAIL_VERIFICATION');
    return {};
  }

  /**
   * Requests a password reset. Always returns the same generic outcome so the
   * endpoint does not enumerate accounts (docs/SECURITY_SPEC.md §47). A
   * PASSWORD_RESET OTP is only sent to verified, active accounts.
   */
  async requestPasswordReset(input: ForgotPasswordBody): Promise<ForgotPasswordResponseData> {
    const user = await findUserByEmail(undefined, input.email);
    if (user === null || !user.isActive) {
      await bcrypt.compare(input.email, DUMMY_PASSWORD_HASH);
      return {};
    }

    // Only verified accounts may reset their password; the email must first be
    // proven to belong to the caller (docs/SECURITY_SPEC.md §47).
    if (!user.emailVerified) {
      return {};
    }

    await this.issueOtp(user.id, 'PASSWORD_RESET');
    return {};
  }

  /**
   * Validates a PASSWORD_RESET OTP and mints a single-use, opaque reset token.
   * The token is returned once and only its SHA-256 hash is persisted. It is
   * not a JWT and is never accepted by the JWT auth plugin (docs/SECURITY_SPEC.md §46).
   */
  async verifyResetOtp(input: VerifyCodeBody): Promise<VerifyResetOtpResponseData> {
    const user = await findUserByEmail(undefined, input.email);
    if (user === null || !user.isActive || !user.emailVerified) {
      throw this.invalidOtpError();
    }

    const otpOk = await withTransaction(async (client) => {
      const otp = await findActiveOtpForUpdate(client, user.id, 'PASSWORD_RESET');
      if (otp === null) {
        return false;
      }
      if (otp.attempts >= OTP_MAX_ATTEMPTS) {
        await invalidateOtpById(client, otp.id);
        return false;
      }
      if (!otpMatches(input.code, otp.codeHash)) {
        await incrementOtpAttempts(client, otp.id);
        if (otp.attempts + 1 >= OTP_MAX_ATTEMPTS) {
          await invalidateOtpById(client, otp.id);
        }
        return false;
      }
      await consumeOtp(client, otp.id);
      return true;
    });

    if (!otpOk) {
      throw this.invalidOtpError();
    }

    const rawResetToken = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await insertPasswordResetToken(getPool(), { userId: user.id, tokenHash, expiresAt });

    return { resetToken: rawResetToken };
  }

  /**
   * Resets a password with a single-use reset token. The token is consumed
   * atomically inside the same transaction as the password update, so it can
   * never be replayed or shared between two resets (docs/SECURITY_SPEC.md §46).
   */
  async resetPassword(input: ResetPasswordBody): Promise<void> {
    const tokenHash = hashToken(input.token);

    const consumed = await withTransaction(async (client) => {
      const consumed = await consumePasswordResetToken(client, tokenHash);
      if (consumed === null) {
        return null;
      }
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      await updateUserPasswordHash(client, consumed.userId, passwordHash);
      await deleteUserPasswordResetTokens(client, consumed.userId);
      return consumed;
    });

    if (consumed === null) {
      throw new AppError(
        errorCodes.INVALID_TOKEN,
        'This password reset link is invalid or has expired.',
        400,
      );
    }
  }

  /**
   * Logout with stateless access tokens. Sessions/refresh tokens are not
   * issued in the MVP, so there is nothing to revoke yet; the endpoint exists
   * to satisfy the API contract and is ready for session revocation later.
   */
  logout(): void {
    // no-op until persistent sessions are introduced.
  }

  /**
   * Issues a single active OTP for a user+purpose: prior active codes are
   * invalidated, a new code is stored hashed, and the email is sent. The
   * resend cooldown is enforced by NOT regenerating within the cooldown.
   */
  private async issueOtp(userId: string, purpose: OtpPurpose): Promise<void> {
    const now = new Date();
    const code = generateOtp();
    const expiresAt = otpExpiresAt(now, OTP_LIFETIME_MS);

    const sentCodeGenerated = await withTransaction(async (client) => {
      const active = await findActiveOtpForUpdate(client, userId, purpose);
      const withinCooldown =
        active !== null && now.getTime() - new Date(active.createdAt).getTime() < OTP_RESEND_COOLDOWN_MS;
      if (withinCooldown) {
        return false;
      }
      await invalidateActiveOtps(client, userId, purpose);
      await insertOtp(client, { userId, purpose, codeHash: hashOtp(code), expiresAt });
      return true;
    });

    if (!sentCodeGenerated) {
      return;
    }

    const user = await findUserById(undefined, userId);
    if (user === null) {
      return;
    }
    await this.sendOtpEmail(user.email, purpose, code);
  }

  /**
   * Emails the OTP. Delivery failures are logged but never surfaced to the
   * client and never expose the code; the resend endpoint is the retry path.
   */
  private async sendOtpEmail(to: string, purpose: OtpPurpose, code: string): Promise<void> {
    try {
      await this.options.emailProvider.send({
        to,
        purpose,
        body: renderOtpEmail(purpose, code),
      });
    } catch (error) {
      console.warn(`[email] Failed to send ${purpose} OTP to ${to}.`, (error as Error).message);
    }
  }

  private invalidCredentialsError(): AppError {
    return new AppError(errorCodes.INVALID_CREDENTIALS, 'Invalid email or password.', 401);
  }

  private invalidOtpError(): AppError {
    return new AppError(
      errorCodes.INVALID_OTP,
      'Invalid or expired verification code.',
      400,
    );
  }
}