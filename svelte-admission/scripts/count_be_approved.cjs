const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Find the Course
    const { data: courses, error: courseError } = await supabase
        .from('courses')
        .select('id, name')
        .ilike('name', '%Bachelor of Engineering%');

    if (courseError) {
        console.error('Error fetching courses:', courseError);
        return;
    }

    if (!courses || courses.length === 0) {
        console.log('Course "Bachelor of Engineering" not found.');
        return;
    }

    console.log(`Found Courses: ${courses.map(c => c.name).join(', ')}`);
    const courseIds = courses.map(c => c.id);

    // 2. Fetch all Approved Applications for these courses
    const { data: apps, error: appError } = await supabase
        .from('applications')
        .select('id, branch_id, form_type, status, branches(name)')
        .in('course_id', courseIds)
        .eq('status', 'approved');

    if (appError) {
        console.error('Error fetching applications:', appError);
        return;
    }

    console.log(`Total Approved Applications for Bachelor of Engineering: ${apps.length}`);

    // 3. Group by Branch and Form Type
    const stats = {};

    apps.forEach(app => {
        const branchName = app.branches?.name || 'Unassigned';
        const formType = app.form_type || 'Unknown';

        if (!stats[branchName]) {
            stats[branchName] = {
                total: 0,
                formTypes: {}
            };
        }

        stats[branchName].total++;
        stats[branchName].formTypes[formType] = (stats[branchName].formTypes[formType] || 0) + 1;
    });

    // 4. Print Results
    console.log('\n--- Branchwise Approved Count ---');
    Object.keys(stats).sort().forEach(branch => {
        console.log(`\nBranch: ${branch} (Total Approved: ${stats[branch].total})`);
        Object.keys(stats[branch].formTypes).sort().forEach(ft => {
            console.log(`  - ${ft}: ${stats[branch].formTypes[ft]}`);
        });
    });
}

run();
