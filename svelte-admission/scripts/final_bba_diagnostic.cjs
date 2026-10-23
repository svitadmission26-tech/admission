const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const selectedYearId = '679c59c6-534b-42ac-b2e5-b1a5d8e00472';

    // 1. Fetch metadata
    const { data: formTypes } = await supabase.from('form_types').select('name, is_prov, direct_admission_on_submit, is_government_quota');
    const provFormTypes = new Set(formTypes.filter(ft => ft.is_prov).map(ft => ft.name));
    const bypassFormTypes = new Set(formTypes.filter(ft => ft.direct_admission_on_submit || ft.is_government_quota).map(ft => ft.name));

    // 2. Fetch BBA Courses
    const { data: courses } = await supabase
        .from('courses')
        .select('id, name, branches(id, name)')
        .ilike('name', 'Bachelor of Business Administration');

    // 3. Fetch applications with nested join
    const { data: allApps } = await supabase
        .from('applications')
        .select(`
            branch_id, course_id, id, status, form_type, student_id, application_fee_status,
            admission_cycles!inner ( academic_year_id ),
            courses!inner ( college_id ),
            payments ( payment_type, status ),
            account_admissions ( admission_number ),
            users:student_id ( student_profiles ( enrollment_number ) )
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId);

    const statusPriority = { 'approved': 1, 'verified': 2, 'submitted': 3, 'needs_correction': 4, 'draft': 5, 'rejected': 6, 'cancelled': 7, 'removed': 8 };
    const sortedApps = allApps.sort((a, b) => (statusPriority[a.status.toLowerCase()] || 99) - (statusPriority[b.status.toLowerCase()] || 99));

    const seenStudentBranch = new Set();
    const uniqueApps = sortedApps.filter(app => {
        const key = `${app.student_id}_${app.branch_id || 'unassigned'}`;
        if (seenStudentBranch.has(key)) return false;
        if (app.status === 'draft') return false;
        seenStudentBranch.add(key);
        return true;
    });

    const branchStats = {};
    const ensureBranch = (branchId) => {
        if (!branchStats[branchId]) {
            branchStats[branchId] = { admitted: { total: 0 }, enrollment: { total: 0 } };
        }
        return branchStats[branchId];
    };

    uniqueApps.forEach((app) => {
        let bId = app.branch_id || `unassigned_${app.course_id}`;
        if (!bId) return;
        const stats = ensureBranch(bId);

        const studentProfile = app.users?.student_profiles;
        const enrollmentNumber = Array.isArray(studentProfile) ? studentProfile[0]?.enrollment_number : studentProfile?.enrollment_number;
        const hasEnrollmentNumber = !!enrollmentNumber;

        const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) ? app.account_admissions[0]?.admission_number : app.account_admissions?.admission_number);
        const hasTuitionFee = (app.payments || []).some(p => p.payment_type === 'tuition_fee' && p.status === 'completed');
        const isBypassType = bypassFormTypes.has(app.form_type || '');
        const isNonProvBypass = isBypassType && !provFormTypes.has(app.form_type);
        const isAdmitted = hasEnrollmentNumber || hasAdmissionNumber || (isNonProvBypass && hasTuitionFee);

        if (isAdmitted && app.status !== 'cancelled' && app.status !== 'removed') {
            stats.admitted.total++;
        }
        if (hasEnrollmentNumber) {
            stats.enrollment.total++;
        }
    });

    const bba = courses[0];
    const bbaBranch = bba.branches[0];
    const stats = branchStats[bbaBranch.id];
    
    console.log('--- BBA Diagnostic Results ---');
    console.log('Unique Students in BBA:', uniqueApps.filter(a => a.course_id === bba.id).length);
    console.log('Admitted (Final Logic):', stats?.admitted?.total);
    console.log('Students with Enrollment Numbers:', stats?.enrollment?.total);
}

run();
