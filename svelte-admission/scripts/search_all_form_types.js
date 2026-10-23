import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: allTypes } = await supabase
        .from('applications')
        .select('form_type');

    const counts = {};
    allTypes.forEach(a => {
        const ft = a.form_type;
        counts[ft] = (counts[ft] || 0) + 1;
    });

    console.log('All form_types in database applications table with total counts:');
    console.log(counts);
}

run();
