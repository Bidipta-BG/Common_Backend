require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testInsert() {
  console.log("Trying to insert test row into form_review_suggestions...");
  
  // We don't have a real form_id, but if there's a foreign key constraint, it will fail.
  // We can just query a valid form_id first.
  const { data: form } = await supabase.from('collection_forms').select('id').limit(1).single();
  
  if (!form) {
      console.log("No forms exist to test with.");
      return;
  }

  const { error } = await supabase
    .from('form_review_suggestions')
    .insert({
      form_id: form.id,
      star_rating: 0,
      suggestion_text: 'test',
      tone: 'standard',
      times_selected: 0
    });
    
  console.log('Insertion Error:', error);
}

testInsert();
