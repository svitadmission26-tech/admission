
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPolicies() {
    console.log('Checking RLS policies for admission_sequences...');
    
    // Query pg_policies via RPC (if available) or indirectly?
    // Supabase-js can't query system tables directly easily.
    
    // I'll try to just read from the table. If I am service role, I can read.
    // I can't check permissions of another role easily.
    
    // But I can check if the policy I created EXISTS in the table definition via inspection? No.
    
    // I'll assume I need to advise the user to run the script again.
    // But let's check if the table exists first.
    
    const { error } = await supabase.from('admission_sequences').select('id').limit(1);
    
    if (error) {
        console.log('Error accessing admission_sequences:', error.message);
    } else {
        console.log('admission_sequences table exists and is accessible to Service Role.');
    }
}

checkPolicies();
