import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkApplications() {
    console.log("Checking applications...");
    const { data: apps, error } = await supabase
        .from('applications')
        .select('id, status, form_type, updated_at');
    
    if (error) {
        console.error("Error fetching applications:", error);
    } else {
        console.log("Found applications:", apps);
    }

    console.log("\nChecking account_admissions...");
    const { data: accs, error: accError } = await supabase
        .from('account_admissions')
        .select('*');
    if (accError) {
        console.error("Error fetching account_admissions:", accError);
    } else {
        console.log("Found account_admissions:", accs);
    }
}

checkApplications();

