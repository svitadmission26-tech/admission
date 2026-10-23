
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPayments() {
    const studentId = 'efed0730-168d-414a-8056-ec6aa71734aa';
    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            *,
            applications(
                id,
                form_type,
                courses(name, code),
                account_admissions(admission_number)
            )
        `)
        .eq('applications.student_id', studentId);
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Payments for Hemang ---');
    console.log(JSON.stringify(payments, null, 2));
}

checkPayments();
