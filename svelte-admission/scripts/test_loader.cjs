const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseAdmin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runLoader(userProfile, urlParams = {}) {
    console.log(`\n--- Running Loader as Role: ${userProfile.role}, College ID: ${userProfile.college_id || 'All'} ---`);

    // 1. Fetch Metadata
    const [{ data: academicYears }, { data: activeYear }, { data: formTypes }] = await Promise.all([
        supabaseAdmin.from('academic_years').select('id, name').order('name', { ascending: false }),
        supabaseAdmin.from('academic_years').select('id').eq('is_active', true).maybeSingle(),
        supabaseAdmin.from('form_types').select('name, is_prov, direct_admission_on_submit, is_government_quota')
    ]);

    const selectedYearId = urlParams.academic_year_id || activeYear?.id || (academicYears && academicYears[0]?.id);
    const includeRejected = urlParams.include_rejected === 'true';
    const provFormTypes = new Set((formTypes || []).filter(ft => ft.is_prov).map(ft => ft.name));
    const bypassFormTypes = new Set((formTypes || []).filter(ft => ft.direct_admission_on_submit || ft.is_government_quota).map(ft => ft.name));

    // 2. Fetch Courses
    let coursesQuery = supabaseAdmin
        .from('courses')
        .select('id, name, college_id, intake_capacity, branches(id, name, intake_capacity), colleges(name)');

    if (userProfile.role === 'adm_officer' && userProfile.college_id) {
        coursesQuery = coursesQuery.eq('college_id', userProfile.college_id);
    }

    const { data: courses, error: coursesError } = await coursesQuery;
    if (coursesError) {
        console.error('Courses fetch error:', coursesError.message);
        return;
    }

    // 3. Fetch Applications
    let appQuery = supabaseAdmin
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
            ),
            users:student_id (
                student_profiles (
                    enrollment_number
                )
            )
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId);

    if (userProfile.role === 'adm_officer' && userProfile.college_id) {
        appQuery = appQuery.eq('courses.college_id', userProfile.college_id);
    }

    const { data: allApps, error: appError } = await appQuery
        .order('status', { ascending: true })
        .limit(20000); 

    if (appError) {
        console.error('Applications fetch error:', appError.message);
        return;
    }

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

    const sortedApps = (allApps || []).sort((a, b) => {
        const pA = statusPriority[(a.status || '').toLowerCase()] || 99;
        const pB = statusPriority[(b.status || '').toLowerCase()] || 99;
        if (pA !== pB) return pA - pB;
        const isProvA = provFormTypes.has(a.form_type || '');
        const isProvB = provFormTypes.has(b.form_type || '');
        if (isProvA && !isProvB) return -1;
        if (!isProvA && isProvB) return 1;
        const isBypassA = bypassFormTypes.has(a.form_type || '');
        const isBypassB = bypassFormTypes.has(b.form_type || '');
        if (isBypassA && !isBypassB) return -1;
        if (!isBypassA && isBypassB) return 1;
        return 0;
    });

    const seenStudentBranchType = new Set();
    const uniqueApps = sortedApps.filter(app => {
        const type = (app.form_type || '').trim();
        const isProv = provFormTypes.has(type);
        const isMQorNRI = type === 'MQ' || type === 'NRI' || type === 'MQ/NRI' || type === 'MNNQ/NRI' || type === 'Vacant';
        
        if (isMQorNRI) return true;
        
        const branchKey = app.branch_id || `unassigned_${app.course_id}`;
        const key = `${app.student_id}_${branchKey}_${type || 'Unknown'}`;
        
        if (!isProv && seenStudentBranchType.has(key)) return false;
        if (app.status === 'draft') return false;

        const isExcludedStatus = app.status === 'cancelled' || app.status === 'removed' || app.status === 'rejected';
        if (!includeRejected && isExcludedStatus) {
            return false;
        }

        if (!isProv) {
            seenStudentBranchType.add(key);
        }
        return true;
    });

    const branchStats = {};
    const ensureBranch = (branchId) => {
        if (!branchStats[branchId]) {
            branchStats[branchId] = {
                all: { total: 0, formTypes: {} },
                submitted: { total: 0, formTypes: {} },
                approved: { total: 0, formTypes: {} },
                paid: { total: 0, formTypes: {} },
                admitted: { total: 0, formTypes: {} },
                admitted_id: { total: 0, formTypes: {} },
                admitted_paid: { total: 0, formTypes: {} },
                students: {}
            };
        }
        return branchStats[branchId];
    };

    uniqueApps.forEach((app) => {
        let bId = app.branch_id;
        if (!bId && app.course_id) {
            bId = `unassigned_${app.course_id}`;
        }
        if (!bId) return;
        
        const stats = ensureBranch(bId);
        const type = (app.form_type || 'Unknown').trim();

        const increment = (metric) => {
            stats[metric].total += 1;
            stats[metric].formTypes[type] = (stats[metric].formTypes[type] || 0) + 1;
        };

        const isCancelledOrRemoved = app.status === 'cancelled' || app.status === 'removed';
        const isProv = provFormTypes.has(app.form_type || '');
        const isBypassType = bypassFormTypes.has(app.form_type || '');
        const isNonProvBypass = isBypassType && !isProv;

        const payments = app.payments || [];
        
        let hasPaidTargetFee = false;
        if (isProv) {
            hasPaidTargetFee = payments.some(p => p.payment_type === 'provisional_fee' && p.status === 'completed');
        } else {
            hasPaidTargetFee = payments.some(p => 
                (p.payment_type === 'application_fee' || p.payment_type === 'tuition_fee') && p.status === 'completed'
            ) || app.application_fee_status === 'paid';
        }

        const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) 
            ? app.account_admissions[0]?.admission_number 
            : app.account_admissions?.admission_number);

        const studentProfile = app.users?.student_profiles;
        const enrollmentNumber = Array.isArray(studentProfile)
            ? studentProfile[0]?.enrollment_number
            : studentProfile?.enrollment_number;
        
        const isApprovedStatus = (app.status || '').toLowerCase() === 'approved';
        const hasEnrollmentForThisApp = !!enrollmentNumber && isApprovedStatus;

        const hasTuitionFee = payments.some(
            p => p.payment_type === 'tuition_fee' && p.status === 'completed'
        );
        
        const isAdmitted = hasEnrollmentForThisApp || hasAdmissionNumber || (isNonProvBypass && hasTuitionFee);

        if (isBypassType) {
            if (!isCancelledOrRemoved) {
                increment('all');
                increment('submitted');
                increment('approved');
                if (hasPaidTargetFee) increment('paid');
                if (isAdmitted) {
                    increment('admitted_id');
                    increment('admitted');
                    if (hasTuitionFee) increment('admitted_paid');
                }
                if (app.student_id) {
                    if (!stats.students[app.student_id]) stats.students[app.student_id] = new Set();
                    stats.students[app.student_id].add(type);
                }
            }
        } else {
            increment('all');
            if (app.status !== 'draft' && !isCancelledOrRemoved) {
                increment('submitted');
            }

            let isMetricApproved = false;
            if (isProv) {
                isMetricApproved = app.status === 'approved';
            } else if (type === 'MQ/NRI' || type === 'MNNQ/NRI' || type === 'Vacant') {
                isMetricApproved = app.status === 'submitted' && app.application_fee_status === 'paid';
            } else {
                const isPaidProv = isProv && hasPaidTargetFee;
                isMetricApproved = isApprovedStatus || hasEnrollmentForThisApp || isPaidProv;
            }
            
            if (isMetricApproved && !isCancelledOrRemoved) {
                increment('approved');
            }
            
            if (hasPaidTargetFee && !isCancelledOrRemoved) {
                increment('paid');
            }

            if (isAdmitted && !isCancelledOrRemoved) {
                increment('admitted_id');
                increment('admitted');
            }

            if (hasTuitionFee && isAdmitted && !isCancelledOrRemoved) {
                increment('admitted_paid');
            }

            if (app.student_id && !isCancelledOrRemoved) {
                if (!stats.students[app.student_id]) stats.students[app.student_id] = new Set();
                stats.students[app.student_id].add(type);
            }
        }
    });

    const globalFormTypesSet = new Set();

    const capacityDataGrouped = (courses || []).reduce((acc, course) => {
        const collegeName = course.colleges?.name || 'Unknown College';
        if (!acc[collegeName]) {
            acc[collegeName] = { courses: [], formTypesSet: new Set() };
        }

        const mappedBranches = (course.branches || []).map((branch) => {
            const stats = branchStats[branch.id];
            
            if (stats) {
                ['all', 'submitted', 'approved', 'paid', 'admitted', 'admitted_id', 'admitted_paid'].forEach(metric => {
                    Object.keys(stats[metric].formTypes).forEach(ft => {
                        acc[collegeName].formTypesSet.add(ft);
                        globalFormTypesSet.add(ft);
                    });
                });
            }

            const legacyFormTypes = {};
            if (stats) {
                Object.keys(stats.all.formTypes).forEach(ft => {
                    legacyFormTypes[ft] = {
                        total: stats.all.formTypes[ft] || 0,
                        approved: stats.approved.formTypes[ft] || 0
                    };
                });
            }

            return {
                name: branch.name,
                capacity: branch.intake_capacity || 0,
                metrics: stats
            };
        });

        acc[collegeName].courses.push({
            courseName: course.name,
            branches: mappedBranches,
        });

        return acc;
    }, {});

    const globalUniqueFormTypes = Array.from(globalFormTypesSet).sort();
    console.log('Global Unique Form Types:', globalUniqueFormTypes);

    // Let's print SARDAR VALLABHBHAI PATEL INSTITUTE OF TECHNOLOGY details
    const svpit = capacityDataGrouped['SARDAR VALLABHBHAI PATEL INSTITUTE OF TECHNOLOGY'];
    if (svpit) {
        svpit.courses.forEach(course => {
            if (course.courseName.includes('BACHELOR OF ENGINEERING')) {
                console.log(`\nCourse: ${course.courseName}`);
                course.branches.forEach(branch => {
                    console.log(`\nBranch: ${branch.name}`);
                    console.log(` - Capacity: ${branch.capacity}`);
                    if (branch.metrics) {
                        console.log(` - metrics.paid:`, branch.metrics.paid);
                        console.log(` - metrics.approved:`, branch.metrics.approved);
                    } else {
                        console.log(` - No metrics`);
                    }
                });
            }
        });
    }
}

async function main() {
    // Test as Admin
    await runLoader({ role: 'admin' });
}

main();
