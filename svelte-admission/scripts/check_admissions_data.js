
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAdmissionsData() {
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let { data: admissions, error } = await supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications!inner(
                course_id,
                cycle_id,
                form_type,
                assigned_fee_scheme_id
            )
        `)
        .limit(1);

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log('Admissions Data:', JSON.stringify(admissions, null, 2));
}

checkAdmissionsData();
