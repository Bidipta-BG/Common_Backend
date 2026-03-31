require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function freshStart() {
  console.log('--- Starting Fresh Reset ---');

  // 1. CLEAR AUTH USERS
  console.log('Step 1: Purging all users from Supabase Auth...');
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000 // Adjust if you have more
  });

  if (listError) {
    console.error('Error listing auth users:', listError.message);
  } else if (users.length === 0) {
    console.log('No auth users to delete.');
  } else {
    for (const user of users) {
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
      if (delError) console.error(`Failed to delete user ${user.id}:`, delError.message);
      else console.log(`Deleted user: ${user.email} (${user.id})`);
    }
  }

  // 2. CLEAR PUBLIC TABLES
  // Add all your table names here
  const tables = ['audits', 'users']; 

  console.log('\nStep 2: Clearing public tables...');
  for (const table of tables) {
    console.log(`Clearing table: ${table}...`);
    // Delete all rows from the table
    // Note: If you have foreign key constraints, order matters (delete children first)
    const { error: dbError } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything where ID is not a specific dummy

    if (dbError) {
      console.error(`Error clearing table ${table}:`, dbError.message);
    } else {
      console.log(`Table ${table} cleared.`);
    }
  }

  console.log('\n--- Reset Complete! You have a fresh database. ---');
}

freshStart();
