
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkApps() {
    const { data: apps, error } = await supabase
        .from('applications')
        .select('id, student_id, course_id, branch_id, form_type, status')
        .limit(50);

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${apps.length} applications.`);
    apps.forEach(app => {
        console.log(JSON.stringify(app));
    });
}

checkApps();
