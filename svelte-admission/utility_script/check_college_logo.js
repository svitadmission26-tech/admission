import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve('./.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: colleges, error } = await supabase
        .from('colleges')
        .select('name, logo_url');
        
    if (error) {
        console.error('Error:', error);
    } else {
        const notNull = colleges.filter(c => c.logo_url !== null);
        console.log('Colleges with logo_url:', notNull);
        console.log('Total colleges:', colleges.length, 'With logo:', notNull.length);
    }
}

run();
