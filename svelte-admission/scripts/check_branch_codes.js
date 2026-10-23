
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCourseCodes() {
    const { data: courses, error } = await supabase
        .from('courses')
        .select('id, name, code');
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Course Codes ---');
    courses.forEach(c => {
        console.log(`${c.name}: ${c.code}`);
    });

    const { data: branches, error: err2 } = await supabase
        .from('branches')
        .select('id, name, code, course_id');
    
    if (err2) {
        console.error(err2);
        return;
    }

    console.log('\n--- Branch Codes ---');
    branches.forEach(b => {
        console.log(`${b.name}: ${b.code} (Course ID: ${b.course_id})`);
    });
}

checkCourseCodes();
