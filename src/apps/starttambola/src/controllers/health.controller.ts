import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

// ─── GET /health ──────────────────────────────────────────────────────────────
// Returns overall service status and a lightweight DB connectivity check.
export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  // Ping Supabase with a trivially cheap query to verify DB connectivity.
  const { error } = await supabaseAdmin.from('_health_check_dummy').select('1').limit(1).maybeSingle();

  // A "relation does not exist" error is fine — it means DB is reachable.
  // Any other error (network, auth) is a genuine connectivity problem.
  const dbConnected =
    !error ||
    (error.code === '42P01' && error.message.includes('does not exist')) ||
    error.message.includes('relation') ||
    error.code === 'PGRST116'; // PostgREST "no rows" — also means DB is up

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbConnected ? 'connected' : 'unreachable',
    },
  });
};
