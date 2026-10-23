import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnose() {
    console.log('--- Diagnostic: Recent Applications ---');
    const { data, error } = await supabase
        .from('applications')
        .select(`
            id, status, updated_at, submitted_at, course_id,
            users!student_id(email, full_name),
            documents(id),
            courses!inner(name, college_id)
        `)
        .order('updated_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    data.forEach(app => {
        console.log(`ID: ${app.id}`);
        console.log(`Status: ${app.status}`);
        console.log(`Updated: ${app.updated_at}`);
        console.log(`User: ${app.users?.email} (${app.users?.full_name})`);
        console.log(`Course: ${app.courses?.name} (College: ${app.courses?.college_id})`);
        console.log(`Docs: ${app.documents?.length || 0}`);
        console.log('---');
    });
}

diagnose();
