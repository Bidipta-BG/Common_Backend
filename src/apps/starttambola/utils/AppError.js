// ─── AppError ─────────────────────────────────────────────────────────────────
// Structured application error. Throw this anywhere in the codebase;
// the global errorHandler middleware will convert it into the standard
// { error: { message, code } } JSON shape with the correct HTTP status.

class AppError extends Error {
  /**
   * @param {string} message  Human-readable error description
   * @param {string} code     Machine-readable error code (e.g. 'NOT_FOUND')
   * @param {number} statusCode HTTP status code (default 500)
   */
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

// ─── Convenience factories ────────────────────────────────────────────────────
const Errors = {
  notFound: (resource = 'Resource') =>
    new AppError(`${resource} not found`, 'NOT_FOUND', 404),

  unauthorized: (msg = 'Unauthorized') =>
    new AppError(msg, 'UNAUTHORIZED', 401),

  forbidden: (msg = 'Forbidden') =>
    new AppError(msg, 'FORBIDDEN', 403),

  badRequest: (msg) =>
    new AppError(msg, 'BAD_REQUEST', 400),

  conflict: (msg) =>
    new AppError(msg, 'CONFLICT', 409),

  internal: (msg = 'Internal server error') =>
    new AppError(msg, 'INTERNAL_ERROR', 500),
};

module.exports = { AppError, Errors };
