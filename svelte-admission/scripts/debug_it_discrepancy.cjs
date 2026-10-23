const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Find the IT Branch
    const { data: branch } = await supabase
        .from('branches')
        .select('id, name')
        .ilike('name', '%Information Technology%')
        .single();

    if (!branch) {
        console.log('Branch "Information Technology" not found.');
        return;
    }

    console.log(`Checking Branch: ${branch.name} (ID: ${branch.id})`);

    // 2. Fetch ALL applications for this branch (except drafts, as we just applied that logic)
    const { data: apps, error } = await supabase
        .from('applications')
        .select('id, status, form_type, submitted_at')
        .eq('branch_id', branch.id)
        .neq('status', 'draft');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Total Non-Draft Applications for IT: ${apps.length}`);
    
    const approved = apps.filter(a => a.status === 'approved');
    console.log(`Approved Apps (${approved.length}):`);
    approved.forEach(a => console.log(`  - ${a.id} [${a.form_type}]`));

    const other = apps.filter(a => a.status !== 'approved');
    console.log(`\nOther Status Apps (${other.length}):`);
    other.forEach(a => console.log(`  - ${a.id} [${a.status}] [${a.form_type}]`));

    // 3. Check for duplicates (Students with multiple apps in this branch)
    const { data: dupCheck } = await supabase
        .from('applications')
        .select('id, student_id, status')
        .eq('branch_id', branch.id)
        .neq('status', 'draft');
    
    const studentMap = {};
    dupCheck.forEach(a => {
        if (!studentMap[a.student_id]) studentMap[a.student_id] = [];
        studentMap[a.student_id].push(a.id);
    });

    const duplicates = Object.entries(studentMap).filter(([sid, ids]) => ids.length > 1);
    if (duplicates.length > 0) {
        console.log(`\nFound ${duplicates.length} students with multiple applications in this branch:`);
        duplicates.forEach(([sid, ids]) => console.log(`  - Student ${sid}: Apps [${ids.join(', ')}]`));
    } else {
        console.log('\nNo duplicate student applications found in this branch.');
    }
}

run();
