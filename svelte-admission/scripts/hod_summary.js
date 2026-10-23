import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSummary() {
    console.log("=== 1. HOD User Count and Details ===");
    const { data: hods } = await supabase.from('users').select('email, role, college_id, branch_id').eq('role', 'hod');
    console.log(`Total HODs: ${hods?.length || 0}`);
    hods?.forEach(h => {
        console.log(`  - Email: ${h.email}, college_id: ${h.college_id}, branch_id: ${h.branch_id}`);
    });

    console.log("\n=== 2. Admitted Students Profile count ===");
    const { data: profiles } = await supabase.from('student_profiles').select('user_id, admission_status, enrollment_number');
    const admitted = profiles?.filter(p => p.admission_status === 'Admitted') || [];
    console.log(`Total profiles: ${profiles?.length || 0}`);
    console.log(`Total Admitted profiles: ${admitted.length}`);
    if (admitted.length > 0) {
        console.log("First 3 admitted profiles:");
        console.log(admitted.slice(0, 3));
    }

    console.log("\n=== 3. Applications for Admitted Students ===");
    const admittedIds = admitted.map(p => p.user_id);
    if (admittedIds.length > 0) {
        const { data: apps } = await supabase
            .from('applications')
            .select('id, student_id, branch_id, course_id, status')
            .in('student_id', admittedIds);
        
        console.log(`Total applications for admitted students: ${apps?.length || 0}`);
        
        // Count applications per branch
        const branchCounts = {};
        apps?.forEach(app => {
            branchCounts[app.branch_id] = (branchCounts[app.branch_id] || 0) + 1;
        });
        console.log("Admitted applications count per branch_id:", branchCounts);
    }
}

runSummary();
