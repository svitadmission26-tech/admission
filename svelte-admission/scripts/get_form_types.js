
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkFormTypes() {
    const { data, error } = await supabase
        .from('form_types')
        .select('name')
        .eq('is_active', true);
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('Active Form Types:', data.map(d => d.name));
}

checkFormTypes();
