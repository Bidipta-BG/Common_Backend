import dotenv from 'dotenv';
import path from 'path';

// Load from the monorepo root .env when running via ts-node/nodemon.
// In production (compiled dist/), process.cwd() is still the project root
// when started from there; adjust the path if deploying differently.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ─── Required vars ────────────────────────────────────────────────────────────
function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[env] Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: parseInt(optional('TAMBO_PORT', '4000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  supabase: {
    url: required('TAMBO_SUPABASE_URL'),
    anonKey: optional('TAMBO_SUPABASE_ANON_KEY', ''),
    serviceKey: required('TAMBO_SUPABASE_SERVICE_KEY'),
  },
} as const;
