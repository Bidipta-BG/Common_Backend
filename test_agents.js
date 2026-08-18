const { supabaseAdmin } = require('./src/apps/starttambola/config/supabaseClient');

async function test() {
  const { data, error } = await supabaseAdmin.from('agents').select('plain_password').limit(1);
  console.log("Error:", error);
  console.log("Data:", data);
}

test();
