
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCollegesColumns() {
    const { data, error } = await supabase.from('colleges').select('*').limit(1);
    if (error) {
        console.error('Error fetching colleges:', error);
    } else if (data && data.length > 0) {
        console.log('Colleges columns:', Object.keys(data[0]));
    } else {
        console.log('No data in colleges table to determine columns.');
    }
}

checkCollegesColumns();
