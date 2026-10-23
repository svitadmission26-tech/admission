import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'student_profile_fields' });
    if (error) {
        // Fallback to direct query if RPC doesn't exist
        const { data: cols, error: err } = await supabase.from('student_profile_fields').select('*').limit(1);
        if (cols && cols.length > 0) {
            console.log('Columns:', Object.keys(cols[0]));
        } else {
             console.log('Error or no data:', err);
        }
    } else {
        console.log('Columns:', data);
    }
}

run();
