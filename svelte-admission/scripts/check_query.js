import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdmissionsQuery() {
    console.log("Checking Account Admissions Query...");
    
    // Exact query from +page.server.ts
    const { data: admissions, error: admError } = await supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications(
                users(full_name, email),
                course_id,
                cycle_id,
                admission_cycles(academic_year_id)
            )
        `)
        .order('admission_number');

    if (admError) {
        console.error("Query Error:", admError);
        return;
    }

    console.log(`Found ${admissions.length} admissions.`);
    
    if (admissions.length > 0) {
        const adm = admissions[0];
        console.log("Sample Data:", JSON.stringify(adm, null, 2));
        
        // Access checks
        const app = adm.applications;
        // @ts-ignore
        const cycle = app?.admission_cycles;
        
        console.log("Course ID:", app?.course_id);
        console.log("Academic Year ID:", cycle?.academic_year_id);
        
        if (app?.course_id && cycle?.academic_year_id) {
            console.log("IDs available for lookup.");
        } else {
            console.log("IDs MISSING.");
        }
    }
}

checkAdmissionsQuery();
