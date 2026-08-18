const { supabaseAdmin } = require('../config/supabaseClient');

/**
 * GET /health
 * Returns overall service status and a lightweight DB connectivity check.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const healthCheck = async (req, res) => {
  // Ping Supabase with a cheap query to verify DB connectivity.
  // A "relation does not exist" error still means the DB is reachable — that's fine.
  const { error } = await supabaseAdmin
    .from('_tambola_health_dummy')
    .select('1')
    .limit(1)
    .maybeSingle();

  const dbConnected =
    !error ||
    (error.code === '42P01') || // relation does not exist (table missing, but DB up)
    error.code === 'PGRST116';  // PostgREST "no rows returned"

  return res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbConnected ? 'connected' : 'unreachable',
    },
  });
};

module.exports = { healthCheck };
