const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Find all IT Branches
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, course_id, courses(name)')
        .ilike('name', 'INFORMATION TECHNOLOGY%');

    if (!branches || branches.length === 0) {
        console.log('No branches matching "INFORMATION TECHNOLOGY" found.');
        return;
    }

    console.log(`Found ${branches.length} matching branches:`);
    branches.forEach(b => console.log(`  - ${b.name} (ID: ${b.id}) in Course: ${b.courses?.name}`));

    for (const branch of branches) {
        console.log(`\n--- Auditing Branch: ${branch.name} (ID: ${branch.id}) ---`);
        
        const { data: apps, error } = await supabase
            .from('applications')
            .select('id, status, form_type, submitted_at, admission_cycles(academic_year_id)')
            .eq('branch_id', branch.id)
            .neq('status', 'draft');

        if (error) {
            console.error('Error:', error);
            continue;
        }

        const approved = apps.filter(a => a.status === 'approved');
        console.log(`Approved Apps (Database Count: ${approved.length}):`);
        
        // Count statuses exactly like Capacity Report does
        const metricCounts = {
            all: apps.length,
            submitted: apps.filter(a => a.status !== 'draft' && a.status !== 'cancelled' && a.status !== 'removed').length,
            approved: approved.length,
            cancelled_removed_rejected: apps.filter(a => a.status === 'cancelled' || a.status === 'removed' || a.status === 'rejected').length
        };

        console.log('Capacity Report Perspective (without "Include Rejected" toggle):');
        const reportVisibleApps = apps.filter(a => a.status !== 'cancelled' && a.status !== 'removed' && a.status !== 'rejected');
        console.log(` - Total Visible (Metrics.all): ${reportVisibleApps.length}`);
        console.log(` - Total Approved: ${reportVisibleApps.filter(a => a.status === 'approved').length}`);

        console.log('\nStatus Breakdown:');
        const statusMap = {};
        apps.forEach(a => statusMap[a.status] = (statusMap[a.status] || 0) + 1);
        console.log(statusMap);
    }
}

run();
