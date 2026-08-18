// ─── Entry point ──────────────────────────────────────────────────────────────
// env must be imported first so dotenv.config() runs before anything else
// accesses process.env (including the Supabase client init).
import { env } from './config/env';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`🎰  StarTambola API running on http://localhost:${env.port}`);
  console.log(`📡  Environment : ${env.nodeEnv}`);
  console.log(`✅  Health check: http://localhost:${env.port}/api/v1/health`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force-kill after 10 s if server hasn't closed
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unexpected errors — log and exit so the process manager can restart
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
  process.exit(1);
});
