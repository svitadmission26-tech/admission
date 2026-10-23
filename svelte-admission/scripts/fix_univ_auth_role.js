import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixUniversityAuthRole() {
    console.log('Fixing university_auth role name...');
    
    // Update 'university_auth' to 'univ_auth'
    const { data, error } = await supabase
        .from('users')
        .update({ role: 'univ_auth' })
        .eq('role', 'university_auth')
        .select();

    if (error) {
        console.error('Error updating roles:', error);
    } else {
        console.log(`Updated ${data.length} users from 'university_auth' to 'univ_auth'.`);
        data.forEach(u => console.log(`- ${u.email}: ${u.role}`));
    }
}

fixUniversityAuthRole();
