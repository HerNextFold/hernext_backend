export type ErrorDetails = Record<string, unknown> | readonly unknown[] | null;

/**
 * Application-level error carrying a documented error code and HTTP status.
 * Errors are converted into the standard {@link ErrorEnvelope} response shape
 * by the central error handler.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: ErrorDetails | undefined;

  constructor(code: string, message: string, statusCode = 500, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}