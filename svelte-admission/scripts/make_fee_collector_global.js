
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateUser() {
    const email = 'fee_collector1@example.com'; // Target user
    console.log(`Updating ${email} to have Global Access (college_id = NULL)...`);

    const { error } = await supabase
        .from('users')
        .update({ college_id: null })
        .eq('email', email);

    if (error) {
        console.error('Error updating user:', error);
    } else {
        console.log('Success! User is now Global.');
    }
}

updateUser();
