import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
    console.log('--- Checking for Approved Applications ---');
    const { data: apps, error: appError } = await supabase
        .from('applications')
        .select('id, status, course_id, courses(name, college_id)')
        .eq('status', 'approved');
    
    if (appError) console.error(appError);
    else {
        console.log(`Found ${apps.length} approved applications.`);
        if (apps.length > 0) console.log('Sample:', apps[0]);
    }

    console.log('\n--- Checking for Payments ---');
    const { data: pays, error: payError } = await supabase
        .from('payments')
        .select('id, amount, application_id');

    if (payError) console.error(payError);
    else {
        console.log(`Found ${pays.length} payments.`);
        if (pays.length > 0) console.log('Sample:', pays[0]);
    }

    console.log('\n--- Checking Colleges ---');
    const { data: colleges } = await supabase.from('colleges').select('id, name, university_id');
    console.log(`Found ${colleges.length} colleges.`);
    if (colleges.length > 0) console.log('Sample:', colleges[0]);
}

checkData();
