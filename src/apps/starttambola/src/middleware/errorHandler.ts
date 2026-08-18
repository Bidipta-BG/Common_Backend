import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

// ─── Global error-handling middleware ─────────────────────────────────────────
// Must be the LAST middleware registered in app.ts (4-arg signature).
// All errors thrown from routes/controllers/services eventually land here.
//
// Consistent response shape: { error: { message, code, [details] } }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // next is required by Express for error middleware even if unused
  _next: NextFunction
): void => {
  // ── Operational / expected errors ─────────────────────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Request validation failed',
        code: 'VALIDATION_ERROR',
        details: err.flatten(),
      },
    });
    return;
  }

  // ── Unknown / programmer errors ───────────────────────────────────────────
  // Never expose internal details in production.
  const isDev = env.nodeEnv === 'development';
  console.error('[ErrorHandler] Unhandled error:', err);

  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(isDev && { stack: err.stack }),
    },
  });
};
