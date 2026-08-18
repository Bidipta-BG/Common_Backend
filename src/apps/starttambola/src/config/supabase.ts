import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// ─── Anon client (respects RLS) ───────────────────────────────────────────────
// Exported for completeness. This backend rarely uses it directly —
// it is intended for contexts where you want RLS to act as the access guard
// (e.g. generating tokens for short-lived frontend operations).
export const supabaseAnon = createClient(
  env.supabase.url,
  env.supabase.anonKey || env.supabase.serviceKey // fall back to service key if anon key not set
);

// ─── Service-role admin client (bypasses RLS) ─────────────────────────────────
// This is the primary client used by this backend. Because this server acts as
// the trusted super-admin layer, all tenant/role access control is enforced in
// application code (services / middleware), not via RLS policies.
// RLS remains the safety net for any direct frontend ↔ Supabase connections.
export const supabaseAdmin = createClient(
  env.supabase.url,
  env.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);
