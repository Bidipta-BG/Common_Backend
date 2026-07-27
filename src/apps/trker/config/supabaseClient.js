const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.TRKER_SUPABASE_URL;
const supabaseAnonKey = process.env.TRKER_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.TRKER_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.warn('Missing TRKER Supabase environment variables');
}

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceRoleKey || '');

module.exports = {
  supabase,
  supabaseAdmin
};
