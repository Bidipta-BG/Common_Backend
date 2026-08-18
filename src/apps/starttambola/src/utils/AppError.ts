// ─── AppError ─────────────────────────────────────────────────────────────────
// Structured application error. Throw this anywhere in the codebase;
// the global errorHandler middleware will convert it into the standard
// { error: { message, code } } JSON shape with the correct HTTP status.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes expected errors from bugs

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// ─── Convenience factories ────────────────────────────────────────────────────

export const Errors = {
  notFound: (resource = 'Resource') =>
    new AppError(`${resource} not found`, 'NOT_FOUND', 404),

  unauthorized: (msg = 'Unauthorized') =>
    new AppError(msg, 'UNAUTHORIZED', 401),

  forbidden: (msg = 'Forbidden') =>
    new AppError(msg, 'FORBIDDEN', 403),

  badRequest: (msg: string) =>
    new AppError(msg, 'BAD_REQUEST', 400),

  conflict: (msg: string) =>
    new AppError(msg, 'CONFLICT', 409),

  internal: (msg = 'Internal server error') =>
    new AppError(msg, 'INTERNAL_ERROR', 500),
};
