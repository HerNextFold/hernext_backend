import type { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import {
  USER_ROLES,
  bearerAuth,
  bodySchema,
  errResponse,
  okResponse,
  publicUserSchema,
} from '../../common/openapi/schemas.js';

const AUTH_RATE_LIMITS = {
  register: { max: 20, timeWindow: 15 * 60 * 1000 },
  verifyEmailOtp: { max: 10, timeWindow: 10 * 60 * 1000 },
  resendEmailVerification: { max: 5, timeWindow: 10 * 60 * 1000 },
  login: { max: 10, timeWindow: 10 * 60 * 1000 },
  forgotPassword: { max: 10, timeWindow: 10 * 60 * 1000 },
  verifyResetOtp: { max: 10, timeWindow: 10 * 60 * 1000 },
  resetPassword: { max: 10, timeWindow: 10 * 60 * 1000 },
} as const;

const registerBodySchema = {
  type: 'object',
  required: ['firstName', 'lastName', 'email', 'password', 'country'],
  additionalProperties: false,
  properties: {
    firstName: { type: 'string', minLength: 1, maxLength: 100 },
    lastName: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 128, description: 'Plain-text password; always hashed before storage' },
    country: { type: 'string', minLength: 1, maxLength: 100 },
    role: {
      type: 'string',
      enum: [...USER_ROLES],
      default: 'PARTICIPANT',
      description: 'Optional. Organization roles cannot be self-registered (403).',
    },
  },
} as const;

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

const emailBodySchema = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: { email: { type: 'string', format: 'email', maxLength: 254 } },
} as const;

const verifyCodeBodySchema = {
  type: 'object',
  required: ['email', 'code'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    code: { type: 'string', pattern: '^\\d{6}$', description: 'Six-digit code sent by email' },
  },
} as const;

const resetPasswordBodySchema = {
  type: 'object',
  required: ['token', 'password'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', minLength: 32, maxLength: 512, description: 'Single-use opaque reset token (NOT a JWT)' },
    password: { type: 'string', minLength: 8, maxLength: 128 },
  },
} as const;

const authenticatedResponse = {
  success: {
    type: 'object',
    required: ['user', 'accessToken'],
    additionalProperties: false,
    properties: {
      user: publicUserSchema,
      accessToken: { type: 'string', description: 'JWT access token for authenticated requests' },
    },
  },
} as const;

const registerResponseData = {
  type: 'object',
  required: ['user', 'verificationStatus'],
  additionalProperties: false,
  properties: {
    user: publicUserSchema,
    verificationStatus: {
      type: 'string',
      const: 'PENDING',
      description: 'The account is UNVERIFIED until /auth/verify-email-otp succeeds. No access token is issued.',
    },
  },
} as const;

const resetTokenResponse = {
  type: 'object',
  required: ['resetToken'],
  additionalProperties: false,
  properties: {
    resetToken: {
      type: 'string',
      description: 'Single-use opaque reset token valid for 15 minutes. Not a JWT.',
    },
  },
} as const;

const emptyDataResponse = {
  success: {
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: {},
  },
} as const;

export function registerAuthModule(app: FastifyInstance, service: AuthService): void {
  const controller = new AuthController(service);

  void app.register(
    async (scope) => {
      scope.post(
        '/register',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.register },
          schema: {
            tags: ['Auth'],
            summary: 'Register a new participant account',
            description:
              'Creates a UNVERIFIED participant account and emails a 6-digit verification code. ' +
              'No access token is returned; call /auth/verify-email-otp to verify and obtain the first token. ' +
              'Organization roles cannot be self-registered.',
            operationId: 'authRegister',
            body: bodySchema(
              'Participant registration details',
              registerBodySchema,
              {
                firstName: 'Aisha',
                lastName: 'Abdullah',
                email: 'aisha@example.com',
                password: 'password123',
                country: 'Nigeria',
                role: 'PARTICIPANT',
              },
            ),
            response: {
              201: okResponse('Account created (UNVERIFIED), verification code emailed', registerResponseData),
              400: errResponse('Invalid request data'),
              403: errResponse('Organization roles cannot be self-registered'),
              409: errResponse('Email already registered'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.register(request, reply),
      );

      scope.post(
        '/verify-email-otp',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.verifyEmailOtp },
          schema: {
            tags: ['Auth'],
            summary: 'Verify a registration email with a one-time code',
            description:
              'Validates the EMAIL_VERIFICATION code sent at registration, marks the account verified, ' +
              'and issues the first normal access token. Enumeration-safe: every failure returns the same error.',
            operationId: 'authVerifyEmailOtp',
            body: bodySchema('Email and six-digit code', verifyCodeBodySchema, {
              email: 'aisha@example.com',
              code: '123456',
            }),
            response: {
              200: okResponse('Email verified; returns the account and a JWT access token', authenticatedResponse.success),
              400: errResponse('Invalid request data, or invalid/expired/unusable code'),
              403: errResponse('Account disabled'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.verifyEmailOtp(request, reply),
      );

      scope.post(
        '/resend-email-verification',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.resendEmailVerification },
          schema: {
            tags: ['Auth'],
            summary: 'Resend the registration email verification code',
            description:
              'Enumeration-safe: always returns the same outcome. A new code is only sent to a real, unverified, ' +
              'active account, subject to a 60-second resend cooldown.',
            operationId: 'authResendEmailVerification',
            body: bodySchema('Account email address', emailBodySchema, { email: 'aisha@example.com' }),
            response: {
              200: okResponse('Same generic outcome for every request', emptyDataResponse.success),
              400: errResponse('Invalid request data'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.resendEmailVerification(request, reply),
      );

      scope.post(
        '/login',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.login },
          schema: {
            tags: ['Auth'],
            summary: 'Authenticate with email and password',
            description: 'Requires a verified email. Unverified accounts are rejected with ACCOUNT_UNVERIFIED.',
            operationId: 'authLogin',
            body: bodySchema(
              'Login credentials',
              loginBodySchema,
              { email: 'aisha@example.com', password: 'password123' },
            ),
            response: {
              200: okResponse('Authenticated; returns a JWT access token', authenticatedResponse.success),
              400: errResponse('Invalid request data'),
              401: errResponse('Invalid email or password'),
              403: errResponse('Account disabled, or account email not yet verified (ACCOUNT_UNVERIFIED)'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.login(request, reply),
      );

      scope.post(
        '/logout',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Auth'],
            summary: 'Log out the authenticated user',
            operationId: 'authLogout',
            security: bearerAuth,
            response: {
              200: okResponse('Logged out successfully', emptyDataResponse.success),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.logout(request, reply),
      );

      scope.post(
        '/forgot-password',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.forgotPassword },
          schema: {
            tags: ['Auth'],
            summary: 'Request a password reset',
            description:
              'Enumeration-safe: the same response is returned whether or not the email exists. ' +
              'A PASSWORD_RESET code is only emailed to verified, active accounts. No token is ever returned.',
            operationId: 'authForgotPassword',
            body: bodySchema(
              'Account email address',
              emailBodySchema,
              { email: 'aisha@example.com' },
            ),
            response: {
              200: okResponse('Same generic outcome for every request', emptyDataResponse.success),
              400: errResponse('Invalid request data'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.forgotPassword(request, reply),
      );

      scope.post(
        '/verify-reset-otp',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.verifyResetOtp },
          schema: {
            tags: ['Auth'],
            summary: 'Verify a password-reset code and mint a reset token',
            description:
              'Validates the PASSWORD_RESET code emailed by /auth/forgot-password and returns a single-use, ' +
              'opaque reset token valid for 15 minutes. The token is NOT a JWT and is only accepted by ' +
              '/auth/reset-password.',
            operationId: 'authVerifyResetOtp',
            body: bodySchema('Email and six-digit code', verifyCodeBodySchema, {
              email: 'aisha@example.com',
              code: '123456',
            }),
            response: {
              200: okResponse('Code verified; returns the single-use reset token', resetTokenResponse),
              400: errResponse('Invalid request data, or invalid/expired/unusable code'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.verifyResetOtp(request, reply),
      );

      scope.post(
        '/reset-password',
        {
          config: { rateLimit: AUTH_RATE_LIMITS.resetPassword },
          schema: {
            tags: ['Auth'],
            summary: 'Reset a password with a single-use reset token',
            operationId: 'authResetPassword',
            body: bodySchema(
              'Reset token and new password',
              resetPasswordBodySchema,
              { token: 'development-reset-token-abcdef123456', password: 'new-password-123' },
            ),
            response: {
              200: okResponse('Password reset successfully', emptyDataResponse.success),
              400: errResponse('Invalid request data or invalid/expired token'),
              429: errResponse('Rate limit exceeded'),
            },
          },
        },
        (request, reply) => controller.resetPassword(request, reply),
      );

      scope.get(
        '/me',
        {
          preHandler: scope.authenticate,
          schema: {
            tags: ['Auth'],
            summary: 'Return the currently authenticated user',
            operationId: 'authMe',
            security: bearerAuth,
            response: {
              200: okResponse('Current user', publicUserSchema),
              401: errResponse('Unauthenticated'),
            },
          },
        },
        (request, reply) => controller.me(request, reply),
      );
    },
    { prefix: '/api/v1/auth' },
  );
}