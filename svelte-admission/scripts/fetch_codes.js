import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: courses, error: cError } = await supabase.from('courses').select('id, name, code, collegeid_code').limit(5);
    if (cError) console.error('Courses Error:', cError);
    else console.log('Courses:', courses);
    
    const { data: branches, error: bError } = await supabase.from('branches').select('id, name, code, collegeid_code').limit(5);
    if (bError) console.error('Branches Error:', bError);
    else console.log('Branches:', branches);

    const { data: ay } = await supabase.from('academic_years').select('id, name, short_code').limit(5);
    console.log('Academic Years:', ay);
}

run();
