import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// We need to import the logic function. Since it's TS, we can't import directly in JS easily without compilation.
// So I will just duplicate the simplified logic here for the script.

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function approveApp() {
    // Get a verified app
    const { data: app } = await supabase
        .from('applications')
        .select('id, course_id, cycle_id, courses(college_id), admission_cycles(academic_year_id)')
        .eq('status', 'verified')
        .limit(1)
        .single();

    if (!app) {
        console.error("No verified application found.");
        return;
    }

    console.log("Approving application:", app.id);

    // Get sequence
    const { data: sequence } = await supabase
        .from('admission_sequences')
        .select('id, current_sequence, prefix')
        .eq('college_id', app.courses.college_id)
        .eq('course_id', app.course_id)
        .eq('academic_year_id', app.admission_cycles.academic_year_id)
        .single();
    
    if (!sequence) {
        console.error("Sequence missing!");
        return;
    }

    const newSeq = sequence.current_sequence + 1;
    const admNum = `${sequence.prefix}${newSeq.toString().padStart(4, '0')}`;

    // Update sequence
    await supabase.from('admission_sequences').update({ current_sequence: newSeq }).eq('id', sequence.id);

    // Create Account Admission
    // We need a user ID for 'created_by'. I'll pick the first admin.
    const { data: admin } = await supabase.from('users').select('id').eq('role', 'admin').limit(1).single();
    
    const { error: accError } = await supabase.from('account_admissions').insert({
        application_id: app.id,
        admission_number: admNum,
        admission_type: 'Merit',
        created_by: admin?.id
    });

    if (accError) console.error("Acc Admission Error:", accError);
    else console.log("Created Account Admission:", admNum);

    // Update App Status
    await supabase.from('applications').update({ status: 'approved' }).eq('id', app.id);
    console.log("Application Approved!");
}

approveApp();
