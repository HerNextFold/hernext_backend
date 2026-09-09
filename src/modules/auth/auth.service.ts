import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { withTransaction, getPool } from '../../lib/db.js';
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
  updateUserPasswordHash,
  type UserRow,
} from '../../models/user.model.js';
import type { ForgotPasswordBody, LoginBody, RegisterBody, ResetPasswordBody } from './auth.schemas.js';
import type { AuthResponseData, PublicUser } from './auth.types.js';

const SALT_ROUNDS = 10;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour.

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
  /**
   * When not 'production', the raw reset token is returned from
   * requestPasswordReset so the MVP demo works without an email provider.
   * Tokens are never exposed in production (docs/API_CONTRACT.md §9).
   */
  nodeEnv: 'development' | 'test' | 'production';
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    country: user.country,
    role: user.role,
  };
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export class AuthService {
  constructor(private readonly options: AuthServiceOptions) {}

  async register(input: RegisterBody): Promise<AuthResponseData> {
    if (input.role !== 'PARTICIPANT') {
      throw new AppError(
        errorCodes.FORBIDDEN,
        'Accounts cannot be created with an organization role.',
        403,
      );
    }

    const user = await withTransaction(async (client) => {
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
      return created;
    });

    return {
      user: toPublicUser(user),
      accessToken: this.options.signAccessToken({ id: user.id, role: user.role }),
    };
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
   * Requests a password reset. Always returns the same generic outcome so the
   * endpoint does not enumerate accounts (docs/SECURITY_SPEC.md §47). A reset
   * token is only returned in non-production environments where email delivery
   * is mocked (docs/API_CONTRACT.md §9).
   */
  async requestPasswordReset(input: ForgotPasswordBody): Promise<{ resetToken?: string }> {
    const user = await findUserByEmail(undefined, input.email);
    if (user === null || !user.isActive) {
      await bcrypt.compare(input.email, DUMMY_PASSWORD_HASH);
      return {};
    }

    const rawToken = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await insertPasswordResetToken(getPool(), { userId: user.id, tokenHash, expiresAt });

    return this.options.nodeEnv === 'production' ? {} : { resetToken: rawToken };
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

  private invalidCredentialsError(): AppError {
    return new AppError(errorCodes.INVALID_CREDENTIALS, 'Invalid email or password.', 401);
  }
}