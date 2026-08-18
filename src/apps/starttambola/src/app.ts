import express, { Application } from 'express';
import { env } from './config/env';
import routes from './routes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

// ─── Express application factory ──────────────────────────────────────────────
export function createApp(): Application {
  const app = express();

  // ── Core middleware ──────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Basic security / hygiene headers ────────────────────────────────────
  app.disable('x-powered-by'); // don't advertise Express

  // ── Request logging (dev only) ───────────────────────────────────────────
  if (env.nodeEnv === 'development') {
    app.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // ── Routes ───────────────────────────────────────────────────────────────
  // All API routes are prefixed with /api/v1
  app.use('/api/v1', routes);

  // ── 404 fallthrough (must come after all routes) ─────────────────────────
  app.use(notFound);

  // ── Global error handler (must be last, 4-arg signature) ─────────────────
  app.use(errorHandler);

  return app;
}
