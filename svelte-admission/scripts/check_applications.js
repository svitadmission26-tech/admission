
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

async function checkApplications() {
  console.log('Checking applications table...');
  const { data: apps, error } = await supabase
    .from('applications')
    .select('id, status, form_type, student_id, course_id');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${apps.length} applications.`);
    apps.forEach(a => console.log(JSON.stringify(a)));
  }
}

checkApplications();
