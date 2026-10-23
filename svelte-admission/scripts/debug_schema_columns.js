
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  console.log('Inspecting report_templates columns...');
  
  // We can't query information_schema easily via PostgREST without a wrapper or RPC.
  // But we can try to Select * limit 1 and see the keys in the returned object, 
  // IF there is data. If no data, we can't see keys.
  
  // Alternatively, we can try to insert a dummy row with just 'name' and see what fails.
  // The user already told us what fails: "columns" violates not-null.
  
  // Let's try to select 'columns' specifically.
  const { data, error } = await supabase.from('report_templates').select('columns').limit(1);
  
  if (error) {
      console.log('Error selecting "columns":', error.message);
  } else {
      console.log('Column "columns" EXISTS.');
  }

  // Check 'configuration' again
  const { data: data2, error: error2 } = await supabase.from('report_templates').select('configuration').limit(1);
  if (error2) {
      console.log('Error selecting "configuration":', error2.message);
  } else {
      console.log('Column "configuration" EXISTS.');
  }
}

inspectSchema();
