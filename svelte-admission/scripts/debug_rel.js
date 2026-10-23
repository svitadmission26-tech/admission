import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase
        .from('applications')
        .select('*, student:users(id, full_name)')
        .limit(1);
    
    if (error) {
        console.error('Error with student rename:', error);
        const { data: data2, error: error2 } = await supabase
            .from('applications')
            .select('*, users(id, full_name)')
            .limit(1);
        if (error2) console.error('Error with users join:', error2);
        else console.log('Successfully joined users');
    } else {
        console.log('Successfully joined student rename');
    }
}

check();
