import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAppSchema() {
    const { data, error } = await supabaseAdmin.from('applications').select('*').limit(1);
    if (error) console.error(error);
    else console.log('App keys:', Object.keys(data[0] || {}));
}

checkAppSchema();
