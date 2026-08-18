const { AppError } = require('../utils/AppError');

// ─── Global error-handling middleware ─────────────────────────────────────────
// Must be registered as the LAST middleware in index.js (4-arg signature).
// All errors thrown from routes / controllers / services land here.
//
// Consistent response shape: { error: { message, code } }

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // ── Operational / expected errors ─────────────────────────────────────────
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  // ── Zod validation errors (for when zod is wired up) ─────────────────────
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        message: 'Request validation failed',
        code: 'VALIDATION_ERROR',
        details: err.flatten ? err.flatten() : err.errors,
      },
    });
  }

  // ── Unknown / programmer errors ───────────────────────────────────────────
  // Never expose internal details in production.
  console.error('[StarTambola] Unhandled error:', err);

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = errorHandler;
