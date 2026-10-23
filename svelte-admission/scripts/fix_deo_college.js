import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function linkDeo() {
    console.log('Linking DEO to Demo College...');
    const COLLEGE_ID = '144ae3bd-c2cf-4906-8318-b41f790db62c';
    
    const { error } = await supabase
        .from('users')
        .update({ college_id: COLLEGE_ID })
        .eq('role', 'deo');

    if (error) console.error(error);
    else console.log('DEO linked successfully.');
}

linkDeo();
