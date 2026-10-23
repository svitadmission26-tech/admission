
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
  console.log('Verifying database schema...');
  let issuesFound = false;

  // 1. Check if 'receipt_sequences' table exists
  const { error: tableError } = await supabase
    .from('receipt_sequences')
    .select('id')
    .limit(1);

  if (tableError) {
    if (tableError.code === '42P01') { // undefined_table
      console.log('❌ Table missing: public.receipt_sequences');
      issuesFound = true;
    } else {
      console.error('⚠️ Error checking table receipt_sequences:', tableError.message);
    }
  } else {
    console.log('✅ Table exists: public.receipt_sequences');
  }

  // 2. Check if 'enrollment_sequences' table exists
  const { error: tableError2 } = await supabase
    .from('enrollment_sequences')
    .select('id')
    .limit(1);

  if (tableError2) {
    if (tableError2.code === '42P01') { // undefined_table
      console.log('❌ Table missing: public.enrollment_sequences');
      issuesFound = true;
    } else {
      console.error('⚠️ Error checking table enrollment_sequences:', tableError2.message);
    }
  } else {
    console.log('✅ Table exists: public.enrollment_sequences');
  }

  // 3. Check if 'enrollment_number' column exists in 'users'
  // We can't query information_schema easily via supabase-js without RPC.
  // We will try to select the column.
  const { error: columnError } = await supabase
    .from('users')
    .select('enrollment_number')
    .limit(1);

  if (columnError) {
     // column doesn't exist error is usually 42703 (undefined_column) but Supabase API might wrap it.
     // PostgREST usually returns code "PGRST204" or similar for detected issues, or Postgres error.
     console.log(`❌ Column check failed for users.enrollment_number: ${columnError.message} (Code: ${columnError.code})`);
     issuesFound = true;
  } else {
     console.log('✅ Column exists: users.enrollment_number');
  }
  
    // 4. Check if 'receipt_number' column exists in 'payments'
  const { error: columnError2 } = await supabase
    .from('payments')
    .select('receipt_number')
    .limit(1);

  if (columnError2) {
     console.log(`❌ Column check failed for payments.receipt_number: ${columnError2.message} (Code: ${columnError2.code})`);
     issuesFound = true;
  } else {
     console.log('✅ Column exists: payments.receipt_number');
  }

  if (issuesFound) {
      console.log('\n⚠️ Schema verification failed. Some required tables or columns are missing.');
      console.log('Please run the SQL in "supabase/fix_missing_tables.sql" in your Supabase SQL Editor.');
  } else {
      console.log('\n✅ Schema verification passed. All required tables and columns appear to exist.');
  }
}

checkSchema();
