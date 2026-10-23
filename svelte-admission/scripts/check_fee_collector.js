
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

async function checkUser() {
    console.log('Checking Fee Collector users...');
    const { data: users, error } = await supabase
        .from('users')
        .select('id, email, role, college_id')
        .eq('role', 'fee_collector');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log('Fee Collectors:');
    users.forEach(u => {
        console.log(`- ${u.email}: College ID = ${u.college_id} (Type: ${typeof u.college_id})`);
    });
}

checkUser();
