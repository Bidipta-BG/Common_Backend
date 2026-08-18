import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

// ─── 404 Not Found fallthrough ────────────────────────────────────────────────
// Register this BEFORE the errorHandler but AFTER all other routes in app.ts.
// Any request that falls through all defined routes lands here.
export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND', 404));
};
