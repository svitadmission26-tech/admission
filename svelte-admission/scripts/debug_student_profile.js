
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkHemang() {
    const { data: profile, error } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('enrollment_number', 'ENR-26-BE-0001')
        .single();
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Hemang Profile ---');
    console.log(profile);

    const { data: app } = await supabase
        .from('applications')
        .select('*, courses(name, code)')
        .eq('student_id', profile.user_id)
        .single();
    
    console.log('--- Hemang Application ---');
    console.log(app);
}

checkHemang();
