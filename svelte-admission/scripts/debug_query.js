
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    // We need a student ID. I'll try to fetch one or just list all applications to see if I can find the one with null branch.
    // Since I don't have the user's ID easily, I'll fetch *all* applications and check their branch_id.
    
    console.log('Fetching applications with branches!left(name)...');
    
    const { data: applications, error } = await supabase
        .from('applications')
        .select('id, form_type, branch_id, branches!left(name)');
        
    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${applications.length} applications.`);
        applications.forEach(app => {
            console.log(`App ID: ${app.id}, Type: ${app.form_type}, Branch ID: ${app.branch_id}, Branch Name: ${app.branches?.name || 'NULL'}`);
        });
    }

    console.log('\nFetching applications with branches(name) (Inner Join)...');
    
    const { data: applicationsInner, error: errorInner } = await supabase
        .from('applications')
        .select('id, form_type, branch_id, branches(name)');

    if (errorInner) {
         console.error('Error:', errorInner);
    } else {
         console.log(`Found ${applicationsInner.length} applications.`);
    }
}

testQuery();
