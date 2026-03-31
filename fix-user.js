const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kiicgrmpoksihflqejxx.supabase.co';
const supabaseKey = 'sb_secret_WbTwg9opjWXiLEeD_LSMhQ_EmPyR6ah';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixUser() {
  const userId = '220f2de3-a130-4523-9b2f-931fd3e4c318';
  const email = 'test@example.com';
  
  console.log('Inserting missing user into public.users...');
  const { error } = await supabase.from('users').upsert({
      id: userId,
      email: email,
      name: 'Test User',
      plan: 'free',
      created_at: new Date().toISOString()
  });
  
  if (error) console.error('Error inserting user:', error);
  else console.log('Successfully inserted user!');
}

fixUser();
