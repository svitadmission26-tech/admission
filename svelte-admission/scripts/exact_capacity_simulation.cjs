const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const selectedYearId = '679c59c6-534b-42ac-b2e5-b1a5d8e00472';
    const collegeId = '2f6032fd-3a69-411e-85c4-bf755e9fdae0';
    const itBranchId = '5a097666-2162-4ecb-8063-6d0db0b01f70';

    const { data: allApps, error } = await supabase
        .from('applications')
        .select(`
            id, 
            status, 
            branch_id, 
            admission_cycles!inner(academic_year_id), 
            courses!inner(college_id)
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId)
        .eq('courses.college_id', collegeId);

    if (error) {
        console.error(error);
        return;
    }

    const seenAppIds = new Set();
    let approvedCount = 0;

    allApps.forEach(app => {
        if (seenAppIds.has(app.id)) return;
        if (app.status === 'draft') return;
        
        // Emulate default filter (includeRejected = false)
        if (app.status === 'cancelled' || app.status === 'removed' || app.status === 'rejected') return;
        
        seenAppIds.add(app.id);
        
        if (app.branch_id === itBranchId && app.status === 'approved') {
            approvedCount++;
        }
    });

    console.log('Final Simulated IT Approved Count:', approvedCount);
    
    // Check if any approved apps are NOT in this set
    const { data: dbApproved } = await supabase
        .from('applications')
        .select('id, branch_id')
        .eq('branch_id', itBranchId)
        .eq('status', 'approved');
        
    const missing = dbApproved.filter(da => !seenAppIds.has(da.id));
    console.log('Approved apps missing from report query:', missing.length);
    if (missing.length > 0) {
        for (const m of missing) {
            const { data: details } = await supabase.from('applications').select('id, status, admission_cycles(academic_year_id), courses(college_id)').eq('id', m.id).single();
            console.log(` - Missing App ${m.id}: Year=${details.admission_cycles?.academic_year_id}, College=${details.courses?.college_id}`);
        }
    }
}

run();
