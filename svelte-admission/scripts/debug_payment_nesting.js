
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPayments() {
    const { data, error } = await supabase
        .from('payments')
        .select(`
            *,
            applications (
                id,
                student_user:users!student_id (full_name, email, student_profiles(enrollment_number)),
                courses (
                    name, 
                    college_id,
                    colleges(
                        name, 
                        address,
                        logo_url,
                        universities(name, logo_url, contact_email)
                    )
                ),
                account_admissions (admission_number)
            )
        `)
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Payment Sample:', JSON.stringify(data[0], null, 2));
}

checkPayments();
