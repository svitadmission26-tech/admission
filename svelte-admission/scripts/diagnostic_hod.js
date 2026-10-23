import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runDiagnostics() {
    console.log("=== 1. Checking HOD Users ===");
    const { data: hodUsers, error: err1 } = await supabase
        .from('users')
        .select('email, role, college_id, branch_id')
        .eq('role', 'hod');
    
    if (err1) console.error("Error fetching HOD users:", err1);
    else console.log(JSON.stringify(hodUsers, null, 2));

    console.log("\n=== 2. Checking Branches ===");
    const { data: branches, error: err2 } = await supabase
        .from('branches')
        .select('id, name, course_id, courses(name, college_id)');
    
    if (err2) console.error("Error fetching branches:", err2);
    else console.log(JSON.stringify(branches, null, 2));

    console.log("\n=== 3. Checking Admitted Students (admission_status = Admitted) ===");
    const { data: profiles, error: err3 } = await supabase
        .from('student_profiles')
        .select('user_id, enrollment_number, admission_status, active_application_id, users(email, full_name)');
    
    if (err3) console.error("Error fetching profiles:", err3);
    else {
        const admitted = profiles.filter(p => p.admission_status === 'Admitted');
        console.log(`Total profiles found: ${profiles.length}. Admitted: ${admitted.length}`);
        console.log(JSON.stringify(admitted, null, 2));
    }

    console.log("\n=== 4. Checking Applications linked to Admitted Students ===");
    const admittedUserIds = profiles.filter(p => p.admission_status === 'Admitted').map(p => p.user_id);
    if (admittedUserIds.length > 0) {
        const { data: apps, error: err4 } = await supabase
            .from('applications')
            .select('id, student_id, branch_id, course_id, status')
            .in('student_id', admittedUserIds);
        
        if (err4) console.error("Error fetching applications:", err4);
        else console.log(JSON.stringify(apps, null, 2));
    } else {
        console.log("No admitted users to check applications for.");
    }
}

runDiagnostics();
