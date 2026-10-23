import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkProfileFields() {
    console.log('Checking student_profile_fields table...');
    const { data, error } = await supabaseAdmin
        .from('student_profile_fields')
        .select('*');

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Found ${data.length} fields:`);
        data.forEach(f => console.log(`- ${f.label} (${f.key}) [${f.type}]`));
    }
}

checkProfileFields();
