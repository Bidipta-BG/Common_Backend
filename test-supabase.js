const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = 'https://kiicgrmpoksihflqejxx.supabase.co';
const supabaseKey = 'sb_secret_WbTwg9opjWXiLEeD_LSMhQ_EmPyR6ah'; // use service key to bypass RLS for table check
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInsert() {
  const auditId = uuidv4();
  console.log('Testing public.audits insert...');
  const { error: insertErr } = await supabase.from('audits').insert({
      id: auditId, user_id: null,
      website_url: 'https://test.com', business_name: 'test' || null,
      business_city: 'test' || null, status: 'pending', created_at: new Date().toISOString(),
  });
  
  if (insertErr) console.error('Error inserting audit:', insertErr);
  else console.log('Successfully inserted audit!');
  
  if (!insertErr) {
     await supabase.from('audits').delete().eq('id', auditId);
  }
}

checkInsert();
