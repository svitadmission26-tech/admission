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
        .select('id, name, college_id, intake_capacity, branches(id, name, intake_capacity), colleges(name)')
        .ilike('name', 'Bachelor of Business Administration');

    // 3. Fetch applications
    const { data: allApps } = await supabase
        .from('applications')
        .select(`
            branch_id, course_id, id, status, form_type, student_id, application_fee_status,
            admission_cycles!inner ( academic_year_id ),
            courses!inner ( college_id ),
            payments ( payment_type, status ),
            account_admissions ( admission_number )
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
            branchStats[branchId] = { all: { total: 0, formTypes: {} }, submitted: { total: 0, formTypes: {} }, approved: { total: 0, formTypes: {} }, paid: { total: 0, formTypes: {} }, admitted: { total: 0, formTypes: {} }, admitted_id: { total: 0, formTypes: {} }, admitted_paid: { total: 0, formTypes: {} }, students: {} };
        }
        return branchStats[branchId];
    };

    uniqueApps.forEach((app) => {
        let bId = app.branch_id;
        if (!bId && app.course_id) bId = `unassigned_${app.course_id}`;
        if (!bId) return;
        
        const stats = ensureBranch(bId);
        const type = (app.form_type || 'Unknown').trim();
        const increment = (metric) => { stats[metric].total += 1; stats[metric].formTypes[type] = (stats[metric].formTypes[type] || 0) + 1; };

        const isCancelledOrRemoved = app.status === 'cancelled' || app.status === 'removed';
        const isProv = provFormTypes.has(app.form_type || '');
        const payments = app.payments || [];
        
        let hasPaidTargetFee = false;
        if (isProv) {
            hasPaidTargetFee = payments.some(p => p.payment_type === 'provisional_fee' && p.status === 'completed');
        } else {
            hasPaidTargetFee = payments.some(p => (p.payment_type === 'application_fee' || p.payment_type === 'tuition_fee') && p.status === 'completed') || app.application_fee_status === 'paid';
        }

        const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) ? app.account_admissions[0]?.admission_number : app.account_admissions?.admission_number);
        const hasTuitionFee = (app.payments || []).some(p => p.payment_type === 'tuition_fee' && p.status === 'completed');
        const isBypassType = bypassFormTypes.has(app.form_type || '');
        const isNonProvBypass = isBypassType && !isProv;
        const isAdmitted = hasAdmissionNumber || (isNonProvBypass && hasTuitionFee);

        increment('all');
        if (isBypassType) {
            if (isAdmitted && !isCancelledOrRemoved) {
                ['submitted', 'approved', 'paid', 'admitted_id', 'admitted'].forEach(m => increment(m));
                if (hasTuitionFee) increment('admitted_paid');
            }
        } else {
            if (app.status !== 'draft' && !isCancelledOrRemoved) increment('submitted');
            if (app.status === 'approved') increment('approved');
            if (hasPaidTargetFee && !isCancelledOrRemoved) increment('paid');
            if (isAdmitted && !isCancelledOrRemoved) { increment('admitted_id'); increment('admitted'); }
            if (hasTuitionFee && isAdmitted && !isCancelledOrRemoved) increment('admitted_paid');
        }

        if (app.student_id && !isCancelledOrRemoved) {
            if (!stats.students[app.student_id]) stats.students[app.student_id] = new Set();
            stats.students[app.student_id].add(type);
        }
    });

    const bba = courses[0];
    const bbaBranch = bba.branches[0];
    const stats = branchStats[bbaBranch.id];
    
    console.log('--- BBA Stats Generated ---');
    console.log('Branch:', bbaBranch.name);
    console.log('Admitted Metric Total:', stats?.admitted?.total);
    console.log('Approved Metric Total:', stats?.approved?.total);
    console.log('Paid Metric Total:', stats?.paid?.total);
    console.log('Admitted ID Metric Total:', stats?.admitted_id?.total);
}

run();
