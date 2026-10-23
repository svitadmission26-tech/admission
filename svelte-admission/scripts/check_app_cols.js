
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumns() {
    const { data, error } = await supabase
        .from('applications')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error(error);
        return;
    }

    if (data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data to inspect columns.');
    }
}

checkColumns();
