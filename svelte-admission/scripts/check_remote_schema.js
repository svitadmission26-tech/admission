
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('Checking remote schema...');

  // 1. Check if table exists by selecting count
  const { count, error: countError } = await supabase
    .from('report_templates')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error checking table existence:', countError);
    // If code is '42P01' (undefined_table), then table is missing.
    // But over HTTP, PostgREST returns 404 for missing table endpoint usually.
    return;
  }
  console.log('Table report_templates exists. Count:', count);

  // 2. Check if column base_table exists by trying to select it
  const { data, error: selectError } = await supabase
    .from('report_templates')
    .select('base_table')
    .limit(1);

  if (selectError) {
    console.error('Error selecting base_table:', selectError);
    if (selectError.message.includes('Could not find the \'base_table\' column')) {
        console.log('CONFIRMED: Column base_table is missing in schema cache or DB.');
    }
  } else {
    console.log('Column base_table exists and is accessible.');
  }

  // 3. Try to insert a dummy row to see if it accepts base_table
  // We won't actually insert, just dry run if possible, but insert is safer test for column existence
  // preventing actual insert with a rollback if we could, but over HTTP we can't easily transaction.
  // We'll rely on select test.
}

checkSchema();
