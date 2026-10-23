import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve('./.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase
        .from('busseva_fees')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Error fetching busseva_fees:', error);
    } else {
        console.log('Sample record keys:', data.length > 0 ? Object.keys(data[0]) : 'Empty table');
    }
}

run();
