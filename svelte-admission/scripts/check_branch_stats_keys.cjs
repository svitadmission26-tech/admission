const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const selectedYearId = '679c59c6-534b-42ac-b2e5-b1a5d8e00472';

    // mimic the exact query from server
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
        .eq('admission_cycles.academic_year_id', selectedYearId);

    const { data: allApps, error } = await appQuery;
    if (error) { console.error(error); return; }

    const branchStats = {};
    const ensureBranch = (branchId) => {
        if (!branchStats[branchId]) {
            branchStats[branchId] = { admitted: { total: 0 } };
        }
        return branchStats[branchId];
    };

    allApps.forEach((app) => {
        let bId = app.branch_id;
        if (!bId && app.course_id) bId = `unassigned_${app.course_id}`;
        if (!bId) return;
        const stats = ensureBranch(bId);
        stats.admitted.total++;
    });

    console.log('--- Branch Stats Keys ---');
    console.log(Object.keys(branchStats));

    // Check for BBA branch
    const bbaBranchId = 'c9ef9098-11ff-4e50-b380-ac8994f008d1';
    console.log('BBA Branch ID in Stats:', !!branchStats[bbaBranchId]);
    if (branchStats[bbaBranchId]) {
        console.log('BBA Admitted Count:', branchStats[bbaBranchId].admitted.total);
    }
}

run();
