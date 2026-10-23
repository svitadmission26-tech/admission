import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, code, course_id, courses(name, college_id, colleges(name))');
    
    console.log("=== Existing Branches in DB ===");
    branches?.forEach(b => {
        console.log(`Branch Name: ${b.name} (Code: ${b.code}), ID: ${b.id}`);
        console.log(`  Course: ${b.courses?.name}, College: ${b.courses?.colleges?.name || 'N/A'}`);
    });
}

run();
