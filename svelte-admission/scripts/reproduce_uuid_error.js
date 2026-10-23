
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reproduce() {
    console.log('Testing .eq(null) on UUID column...');
    const { data, error } = await supabase
        .from('fee_structures')
        .select('id')
        .eq('fee_scheme_id', null)
        .maybeSingle();
    
    if (error) {
        console.error('Error with null:', error.message);
    } else {
        console.log('Success with null (no rows found is fine).');
    }

    console.log('\nTesting .eq("null") on UUID column...');
    const { data: data2, error: error2 } = await supabase
        .from('fee_structures')
        .select('id')
        .eq('fee_scheme_id', 'null')
        .maybeSingle();
    
    if (error2) {
        console.error('Error with "null" string:', error2.message);
    } else {
        console.log('Success with "null" string.');
    }
}

reproduce();
