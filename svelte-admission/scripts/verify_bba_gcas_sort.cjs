const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const selectedYearId = '679c59c6-534b-42ac-b2e5-b1a5d8e00472';
    const bbaCourseId = '81db058b-56d3-4a7a-8f68-86d6ef9ceb4a';

    // 1. Fetch metadata
    const { data: formTypes } = await supabase.from('form_types').select('name, is_prov, direct_admission_on_submit, is_government_quota');
    const bypassFormTypes = new Set(formTypes.filter(ft => ft.direct_admission_on_submit || ft.is_government_quota).map(ft => ft.name));

    // 2. Fetch applications
    const { data: allApps } = await supabase
        .from('applications')
        .select(`
            branch_id, course_id, id, status, form_type, student_id,
            admission_cycles!inner ( academic_year_id )
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId)
        .eq('course_id', bbaCourseId);

    const statusPriority = { 'approved': 1, 'verified': 2, 'submitted': 3, 'needs_correction': 4, 'draft': 5, 'rejected': 6, 'cancelled': 7, 'removed': 8 };
    
    // NEW Sorting Logic
    const sortedApps = allApps.sort((a, b) => {
        const pA = statusPriority[a.status.toLowerCase()] || 99;
        const pB = statusPriority[b.status.toLowerCase()] || 99;
        if (pA !== pB) return pA - pB;

        const isBypassA = bypassFormTypes.has(a.form_type || '');
        const isBypassB = bypassFormTypes.has(b.form_type || '');
        if (isBypassA && !isBypassB) return -1;
        if (!isBypassA && isBypassB) return 1;
        return 0;
    });

    const seenStudentBranch = new Set();
    const uniqueApps = sortedApps.filter(app => {
        const key = `${app.student_id}_${app.branch_id || 'unassigned'}`;
        if (seenStudentBranch.has(key)) return false;
        if (app.status === 'draft') return false;
        seenStudentBranch.add(key);
        return true;
    });

    const bbaGCAS = uniqueApps.filter(a => a.form_type === 'GCAS');
    console.log('--- BBA GCAS Verification ---');
    console.log('Total GCAS Apps for BBA in unique set:', bbaGCAS.length);
    bbaGCAS.forEach(a => console.log(`Student: ${a.student_id} | Status: ${a.status}`));
}

run();
