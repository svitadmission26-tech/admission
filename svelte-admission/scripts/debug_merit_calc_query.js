
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugQuery() {
  console.log('Running debug query...');
  
  const { data, error } = await supabase
    .from('applications')
    .select(`
        id,
        status,
        merit_score,
        merit_rank,
        users(full_name, email),
        courses(id, name, colleges(name)),
        admission_cycles(name, academic_years(name))
    `)
    .in('status', ['submitted', 'verified', 'approved', 'waitlisted']);

  if (error) {
    console.error('Query Error:', error);
  } else {
    console.log(`Returned ${data.length} rows.`);
    if (data.length > 0) {
        console.log('Sample row:', JSON.stringify(data[0], null, 2));
    } else {
        // Fallback: Check if we can get them without joins
        console.log('Trying without joins...');
        const { data: simpleData, error: simpleError } = await supabase
            .from('applications')
            .select('id, status')
            .in('status', ['submitted', 'verified', 'approved', 'waitlisted']);
            
        if (simpleError) console.error('Simple Query Error:', simpleError);
        else console.log(`Simple query returned ${simpleData.length} rows.`);
    }
  }
}

debugQuery();
