const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.TAMBO_SUPABASE_URL;
const supabaseServiceKey = process.env.TAMBO_SUPABASE_SERVICE_KEY;
// Optional — anon key for RLS-respecting client (frontend-facing flows)
const supabaseAnonKey = process.env.TAMBO_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[StarTambola] Missing TAMBO_SUPABASE_URL or TAMBO_SUPABASE_SERVICE_KEY');
}

// ─── Anon client (respects RLS) ───────────────────────────────────────────────
// Exported for completeness. This backend rarely uses it directly;
// it is intended for contexts where RLS should act as the access guard.
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || supabaseServiceKey || '');

// ─── Service-role admin client (bypasses RLS) ─────────────────────────────────
// Primary client used by this backend. All tenant/role checks are enforced
// in application code (services / middleware). RLS is the safety net for
// any direct frontend ↔ Supabase connections.
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

module.exports = { supabase, supabaseAdmin };
