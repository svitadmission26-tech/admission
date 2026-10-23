import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: colleges } = await supabase.from('colleges').select('name, logo_url');
    for (const c of colleges || []) {
        console.log(`College: "${c.name}", Logo: "${c.logo_url}"`);
    }
}
run();
