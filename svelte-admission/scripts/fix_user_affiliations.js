import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixUserAffiliations() {
    console.log("Fetching Universities...");
    const { data: universities } = await supabase.from('universities').select('id, name');
    console.log("Universities:", universities);

    if (!universities || universities.length === 0) {
        console.error("No universities found!");
        return;
    }

    console.log("Fetching Colleges...");
    const { data: colleges } = await supabase.from('colleges').select('id, name, university_id');
    console.log("Colleges:", colleges);

    if (!colleges || colleges.length === 0) {
        console.error("No colleges found!");
        return;
    }

    const university = universities[0]; // Just pick the first one
    const college = colleges.find(c => c.university_id === university.id) || colleges[0];

    console.log(`Assigning University: ${university.name} (${university.id})`);
    console.log(`Assigning College: ${college.name} (${college.id})`);

    // 1. Fix University Auth
    console.log("Updating univ_auth@example.com...");
    await supabase.from('users')
        .update({ university_id: university.id })
        .eq('email', 'univ_auth@example.com');

    // 2. Fix College Auth
    console.log("Updating college_auth_a@example.com...");
    await supabase.from('users')
        .update({ university_id: university.id, college_id: college.id })
        .eq('email', 'college_auth_a@example.com');

    // 3. Fix Admission Officer
    console.log("Updating officer1@example.com...");
    await supabase.from('users')
        .update({ university_id: university.id, college_id: college.id })
        .eq('email', 'officer1@example.com');
    
    // 4. Fix Fee Collector (optional, but good practice if RLS requires it later)
    console.log("Updating fee_collector1@example.com...");
    await supabase.from('users')
        .update({ university_id: university.id, college_id: college.id })
        .eq('email', 'fee_collector1@example.com');

    console.log("Updates complete.");
}

fixUserAffiliations();
