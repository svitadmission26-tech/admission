
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCourses() {
    const { data: courses, error } = await supabase
        .from('courses')
        .select('id, name, college_id, colleges(name)');
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Courses ---');
    courses.forEach(c => {
        console.log(`Course: ${c.name} (${c.id}) | College: ${c.colleges?.name || 'NULL'} (${c.college_id})`);
    });

    const { data: deos } = await supabase
        .from('users')
        .select('id, email, full_name, role, college_id')
        .eq('role', 'deo');
    
    console.log('\n--- DEO Users ---');
    deos.forEach(d => {
        console.log(`DEO: ${d.full_name} (${d.email}) | College: ${d.college_id}`);
    });
}

checkCourses();
