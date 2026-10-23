
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAdmission() {
    const { data: adms, error } = await supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications(
                course_id,
                courses(name, code),
                student_id,
                student_user:users!student_id(email, full_name, student_profiles(enrollment_number))
            )
        `)
        .ilike('admission_number', '%BCA-0001%');
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Admission Details ---');
    console.log(JSON.stringify(adms, null, 2));
}

checkAdmission();
