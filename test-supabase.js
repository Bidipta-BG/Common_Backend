require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testDB() {
  console.log("Checking history rows in form_review_suggestions...");
  
  const { data, error } = await supabase
    .from('form_review_suggestions')
    .select('*')
    .eq('star_rating', 0);
    
  if (error) {
    console.error("Error fetching:", error);
  } else {
    console.log("Found rows:", data.length);
    data.forEach(row => {
      console.log(`- ID: ${row.id}, Form: ${row.form_id}, Text: ${row.suggestion_text}`);
    });
  }
}

testDB();
