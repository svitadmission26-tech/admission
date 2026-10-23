
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMoreColumns() {
  console.log('Checking other columns...');
  const check = async (col) => {
      const { error } = await supabase.from('report_templates').select(col).limit(1);
      if (error) console.log(`Column ${col} MISSING:`, error.message);
      else console.log(`Column ${col} EXISTS.`);
  }

  await check('base_table');
  await check('configuration');
  await check('allowed_roles');
  await check('name');
  await check('description');
}

checkMoreColumns();
