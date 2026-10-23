import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCount() {
    const { count, error } = await supabase.from('account_admissions').select('*', { count: 'exact', head: true });
    console.log('Account Admissions Count:', count);
    if (error) console.error(error);
}

checkCount();
