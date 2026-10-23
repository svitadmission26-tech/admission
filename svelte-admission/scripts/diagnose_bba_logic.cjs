const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const selectedYearId = '679c59c6-534b-42ac-b2e5-b1a5d8e00472';
    const bbaCourseId = '81db058b-56d3-4a7a-8f68-86d6ef9ceb4a';

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
            application_fee_status,
            admission_cycles!inner (
                academic_year_id
            ),
            courses!inner (
                college_id
            ),
            payments (
                payment_type,
                status
            ),
            account_admissions (
                admission_number
            )
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId)
        .eq('course_id', bbaCourseId);

    const { data: allApps, error } = await appQuery;
    if (error) { console.error(error); return; }

    console.log('Query returned apps for BBA:', allApps.length);

    const statusPriority = {
        'approved': 1,
        'verified': 2,
        'submitted': 3,
        'needs_correction': 4,
        'draft': 5,
        'rejected': 6,
        'cancelled': 7,
        'removed': 8
    };

    const sortedApps = allApps.sort((a, b) => {
        const pA = statusPriority[a.status.toLowerCase()] || 99;
        const pB = statusPriority[b.status.toLowerCase()] || 99;
        return pA - pB;
    });

    const seenStudentBranch = new Set();
    const uniqueApps = sortedApps.filter(app => {
        const key = `${app.student_id}_${app.branch_id || 'unassigned'}`;
        if (seenStudentBranch.has(key)) return false;
        if (app.status === 'draft') return false;
        seenStudentBranch.add(key);
        return true;
    });

    console.log('Unique Apps after deduplication:', uniqueApps.length);

    let admittedIdCount = 0;
    uniqueApps.forEach(app => {
        const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) 
            ? app.account_admissions[0]?.admission_number 
            : app.account_admissions?.admission_number);
        
        if (hasAdmissionNumber) admittedIdCount++;
    });

    console.log('Final Admitted (ID Gen) count in simulated logic:', admittedIdCount);
}

run();
