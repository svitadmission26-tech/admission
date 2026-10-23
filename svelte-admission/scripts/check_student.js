import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const appId = 'cf723d55-e168-40a8-91c5-ccb008d8a5ee';
    console.log("Checking application:", appId);
    const { data: app, error: err1 } = await supabase
        .from('applications')
        .select('*')
        .eq('id', appId)
        .single();
    console.log("Application status:", app?.status, "Rejection Reason:", app?.rejection_reason);

    if (app) {
        console.log("\nInspecting details of GCAS-26-BCA-0044 in account_admissions:");
    const { data: matchedAdms, error: errSearch } = await supabase
        .from('account_admissions')
        .select('*')
        .eq('admission_number', 'GCAS-26-BCA-0044');
    console.log("Matched admission:", matchedAdms, errSearch);

        console.log("\nChecking student profile for user:", app.student_id);
        const { data: profile, error: err2 } = await supabase
            .from('student_profiles')
            .select('user_id, enrollment_number, admission_status, active_application_id')
            .eq('user_id', app.student_id)
            .single();
        console.log("Profile details:", profile);

        console.log("\nChecking users for user:", app.student_id);
        const { data: user, error: err5 } = await supabase
            .from('users')
            .select('id, college_id')
            .eq('id', app.student_id)
            .single();
        console.log("User college_id:", user?.college_id);
    }

    console.log("\nChecking account admissions for application:", appId);
    const { data: accAdms, error: err3 } = await supabase
        .from('account_admissions')
        .select('*')
        .eq('application_id', appId);
    console.log("Account admissions list:", accAdms);

    console.log("\nChecking all form types in the database:");
    const { data: formTypes, error: errFormTypes } = await supabase
        .from('form_types')
        .select('*');
    console.log("Form types:", formTypes, errFormTypes);

    console.log("\nChecking transactions for application:", appId);
    const { data: txs, error: errTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('application_id', appId);
    console.log("Transactions:", txs, errTxs);

    console.log("\nChecking student transfer history for application:", appId);
    const { data: history, error: err4 } = await supabase
        .from('student_transfer_history')
        .select('*')
        .eq('application_id', appId);
    console.log("Transfer history:", history);
}

run();
