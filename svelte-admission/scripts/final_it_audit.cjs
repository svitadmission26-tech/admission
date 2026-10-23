const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Get Active Year (default for Capacity Report)
    const { data: activeYear } = await supabase.from('academic_years').select('id, name').eq('is_active', true).maybeSingle();
    const selectedYearId = activeYear?.id;
    console.log(`Active Year: ${activeYear?.name} (ID: ${selectedYearId})`);

    // 2. Get IT Branch (BE)
    const { data: branch } = await supabase.from('branches').select('id, name, course_id, courses(college_id)').ilike('name', 'INFORMATION TECHNOLOGY').eq('course_id', 'de7b17a8-3e1b-4a4c-9f2b-b13235c8c7e1').single();
    if (!branch) {
        console.log('BE IT Branch not found');
        return;
    }
    const collegeId = branch.courses.college_id;
    console.log(`Branch: ${branch.name} (ID: ${branch.id}), College ID: ${collegeId}`);

    // 3. Emulate Capacity Report Query
    let appQuery = supabase
        .from('applications')
        .select(`
            branch_id, 
            course_id,
            id, 
            status, 
            form_type, 
            student_id,
            admission_cycles!inner (
                academic_year_id
            ),
            courses!inner (
                college_id
            )
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId)
        .eq('courses.college_id', collegeId);

    const { data: allApps, error } = await appQuery.limit(20000);
    if (error) { console.error(error); return; }

    console.log(`Query returned ${allApps.length} total applications for this college/year.`);

    const seenAppIds = new Set();
    const uniqueApps = allApps.filter(app => {
        if (seenAppIds.has(app.id)) return false;
        if (app.status === 'draft') return false;
        
        // Default Capacity Report behavior: includeRejected = false
        const isExcludedStatus = app.status === 'cancelled' || app.status === 'removed' || app.status === 'rejected';
        if (isExcludedStatus) return false;

        seenAppIds.add(app.id);
        return true;
    });

    console.log(`After filtering (no drafts, no rejected/cancelled), unique apps count: ${uniqueApps.length}`);

    const itApps = uniqueApps.filter(app => app.branch_id === branch.id);
    const approvedIt = itApps.filter(app => app.status === 'approved');

    console.log(`\n--- Capacity Report Results for IT Branch ---`);
    console.log(`Total Visible Apps: ${itApps.length}`);
    console.log(`Approved Apps: ${approvedIt.length}`);

    if (approvedIt.length !== 20) {
        console.log('\nDiscrepancy detected! Investigating missing apps...');
        
        // Find which of the 20 approved apps are missing
        const { data: allApprovedInDb } = await supabase
            .from('applications')
            .select('id, status, branch_id, admission_cycles(academic_year_id)')
            .eq('branch_id', branch.id)
            .eq('status', 'approved');
        
        const missingIds = allApprovedInDb.filter(dbApp => !approvedIt.some(up => up.id === dbApp.id));
        console.log(`Missing Approved IDs (${missingIds.length}):`);
        missingIds.forEach(m => {
            console.log(`  - ${m.id} (Year ID: ${m.admission_cycles?.academic_year_id})`);
        });
    } else {
        console.log('\nNo discrepancy found with this logic. The report SHOULD show 20.');
    }
}

run();
