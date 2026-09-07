import bcrypt from 'bcrypt';
import { AppError } from '../../common/errors/app-error.js';
import { errorCodes } from '../../common/errors/error-codes.js';
import { withTransaction } from '../../lib/db.js';
import {
  findUserByEmail,
  findUserById,
  insertParticipantProfile,
  insertUser,
  type UserRow,
} from '../../models/user.model.js';
import type { LoginBody, RegisterBody } from './auth.schemas.js';
import type { AuthResponseData, PublicUser } from './auth.types.js';

const SALT_ROUNDS = 10;

/**
 * A valid bcrypt hash of a random password. When login fails because the email
 * is unknown, we still run bcrypt.compare against this hash so the response
 * timing does not leak whether an account exists (SECURITY_SPEC.md §47).
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing-0123456789', SALT_ROUNDS);

export interface AccessTokenSigner {
  signAccessToken(user: Pick<UserRow, 'id' | 'role'>): string;
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

export class AuthService {
  constructor(private readonly signer: AccessTokenSigner) {}

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
      accessToken: this.signer.signAccessToken({ id: user.id, role: user.role }),
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
      accessToken: this.signer.signAccessToken({ id: user.id, role: user.role }),
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