import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session) {
        throw redirect(303, '/login');
    }

    if (!userProfile || (userProfile.role !== 'adm_officer' && userProfile.role !== 'admin')) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch Metadata
    const [{ data: academicYears }, { data: activeYear }, { data: formTypes }, { data: transferHistory }] = await Promise.all([
        supabaseAdmin.from('academic_years').select('id, name').order('name', { ascending: false }),
        supabaseAdmin.from('academic_years').select('id').eq('is_active', true).maybeSingle(),
        supabaseAdmin.from('form_types').select('name, is_prov, direct_admission_on_submit, is_government_quota'),
        supabaseAdmin.from('student_transfer_history').select('application_id, previous_branch_id, previous_course_id')
    ]);

    const selectedYearId = url.searchParams.get('academic_year_id') || activeYear?.id || (academicYears && academicYears[0]?.id);
    const includeRejected = url.searchParams.get('include_rejected') === 'true';
    const excludeProv = url.searchParams.get('exclude_prov') === 'true';
    const includeCancelled = url.searchParams.get('include_cancelled') === 'true';
    const includeTransferred = url.searchParams.get('include_transferred') !== 'false';
    const selectedAdmissionType = url.searchParams.get('admission_type') || 'all';
    const provFormTypes = new Set((formTypes || []).filter(ft => ft.is_prov).map(ft => ft.name));
    const bypassFormTypes = new Set((formTypes || []).filter(ft => ft.direct_admission_on_submit || ft.is_government_quota).map(ft => ft.name));
    const transferredAppIds = new Set((transferHistory || []).map(t => t.application_id));

    // 2. Fetch Courses
    let coursesQuery = supabaseAdmin
        .from('courses')
        .select('id, name, college_id, intake_capacity, branches(id, name, intake_capacity), colleges(name)');

    if (userProfile.role === 'adm_officer' && userProfile.college_id) {
        coursesQuery = coursesQuery.eq('college_id', userProfile.college_id);
    }

    const { data: courses, error: coursesError } = await coursesQuery;
    if (coursesError) {
        console.error('Capacity Report - courses fetch error:', coursesError.message);
    }

    // 3. Fetch Applications with Filtering
    let allApps: any[] = [];
    let start = 0;
    const chunkSize = 1000;
    let hasMore = true;
    let appError: any = null;

    while (hasMore) {
        let chunkQuery = supabaseAdmin
            .from('applications')
            .select(`
                branch_id, 
                course_id,
                id, 
                status, 
                form_type, 
                admission_type,
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
            chunkQuery = chunkQuery.eq('courses.college_id', userProfile.college_id);
        }

        const { data, error } = await chunkQuery
            .order('status', { ascending: true })
            .range(start, start + chunkSize - 1);

        if (error) {
            appError = error;
            console.error('Capacity Report - applications fetch error:', error.message);
            break;
        }

        allApps = allApps.concat(data || []);

        if (!data || data.length < chunkSize) {
            hasMore = false;
        } else {
            start += chunkSize;
        }
    }

    // Status priority for deduplication (lower is better)
    const statusPriority: Record<string, number> = {
        'approved': 1,
        'verified': 2,
        'submitted': 3,
        'needs_correction': 4,
        'draft': 5,
        'rejected': 6,
        'cancelled': 7,
        'removed': 8
    };

    // Sort raw data to ensure the most important application for a student is seen first
    const sortedApps = (allApps || []).sort((a, b) => {
        const pA = statusPriority[(a.status || '').toLowerCase()] || 99;
        const pB = statusPriority[(b.status || '').toLowerCase()] || 99;
        
        if (pA !== pB) return pA - pB;

        // If status is same, prioritize Provisional over Bypass types
        const isProvA = provFormTypes.has(a.form_type || '');
        const isProvB = provFormTypes.has(b.form_type || '');
        if (isProvA && !isProvB) return -1;
        if (!isProvA && isProvB) return 1;

        // Then prioritize Bypass types (GCAS, ACPC, etc.) over others
        const isBypassA = bypassFormTypes.has(a.form_type || '');
        const isBypassB = bypassFormTypes.has(b.form_type || '');
        if (isBypassA && !isBypassB) return -1;
        if (!isBypassA && isBypassB) return 1;

        return 0;
    });

    // Extract available admission types across fetched applications
    const defaultAdmissionTypes = ['Regular', 'D2D', 'C2D'];
    const existingAdmissionTypes = (allApps || []).map(a => (a.admission_type || 'Regular').trim()).filter(Boolean);
    const availableAdmissionTypes = Array.from(new Set([...defaultAdmissionTypes, ...existingAdmissionTypes])).sort();

    // Deduplicate by student, branch AND form_type to avoid counting the same person twice for capacity
    // However, for MQ, NRI, and Provisional types, we allow all applications to be counted separately
    const seenStudentBranchType = new Set<string>();
    const uniqueApps = sortedApps.filter(app => {
        // Strictly exclude drafts from all capacity calculations
        if (app.status === 'draft') return false;

        const isCancelled = app.status === 'cancelled';
        if (isCancelled && !includeCancelled && !includeRejected) {
            return false;
        }

        const isExcludedStatus = app.status === 'removed' || app.status === 'rejected';
        if (!includeRejected && isExcludedStatus) {
            return false;
        }

        const appAdmissionType = (app.admission_type || 'Regular').trim();
        if (selectedAdmissionType !== 'all' && appAdmissionType.toLowerCase() !== selectedAdmissionType.toLowerCase()) {
            return false;
        }

        const type = (app.form_type || '').trim();
        const isProv = provFormTypes.has(type);
        if (excludeProv && isProv) {
            return false;
        }

        const isTransferred = transferredAppIds.has(app.id);
        if (!includeTransferred && isTransferred) {
            return false;
        }

        const isMQorNRI = type === 'MQ' || type === 'NRI' || type === 'MQ/NRI' || type === 'MNNQ/NRI' || type === 'Vacant';
        
        const branchKey = app.branch_id || `unassigned_${app.course_id}`;
        const key = `${app.student_id}_${branchKey}_${type || 'Unknown'}`;
        
        // If not a "Multiple Allowed" type, check deduplication
        if (!isProv && !isMQorNRI && seenStudentBranchType.has(key)) return false;

        // Only track "seen" for types that require deduplication
        if (!isProv && !isMQorNRI) {
            seenStudentBranchType.add(key);
        }
        return true;
    });

    // New Structure: branch_id -> { [metric]: { total: number, formTypes: { [type]: count } }, students: Set }
    const branchStats: Record<string, any> = {};

    // Helper to ensure a branch has its stats initialized
    const ensureBranch = (branchId: string) => {
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
        
        // If branch_id is null, use a course-specific "unassigned" ID
        if (!bId && app.course_id) {
            bId = `unassigned_${app.course_id}`;
        }

        if (!bId) return;
        
        const stats = ensureBranch(bId);
        const type = (app.form_type || 'Unknown').trim();

        // Helper to increment
        const increment = (metric: string) => {
            stats[metric].total += 1;
            stats[metric].formTypes[type] = (stats[metric].formTypes[type] || 0) + 1;
        };

        const isCancelledOrRemoved = app.status === 'cancelled' || app.status === 'removed';
        const isProv = provFormTypes.has(app.form_type || '');
        const isBypassType = bypassFormTypes.has(app.form_type || '');
        const isNonProvBypass = isBypassType && !isProv;

        const payments = app.payments as any || [];
        
        let hasPaidTargetFee = false;
        if (isProv) {
            hasPaidTargetFee = payments.some((p: any) => p.payment_type === 'provisional_fee' && p.status === 'completed');
        } else {
            hasPaidTargetFee = payments.some((p: any) => 
                (p.payment_type === 'application_fee' || p.payment_type === 'tuition_fee') && p.status === 'completed'
            ) || app.application_fee_status === 'paid';
        }

        const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) 
            ? app.account_admissions[0]?.admission_number 
            : (app.account_admissions as any)?.admission_number);

        // Extract enrollment number from nested join users -> student_profiles
        const studentProfile = (app.users as any)?.student_profiles;
        const enrollmentNumber = Array.isArray(studentProfile)
            ? studentProfile[0]?.enrollment_number
            : studentProfile?.enrollment_number;
        
        // A student has an enrollment number if they are admitted in ANY application.
        // To avoid overcounting, we only consider it "Admitted" for THIS application if it is also APPROVED.
        const isApprovedStatus = (app.status || '').toLowerCase() === 'approved';
        const hasEnrollmentForThisApp = !!enrollmentNumber && isApprovedStatus;

        const hasTuitionFee = (app.payments as any || []).some(
            (p: any) => p.payment_type === 'tuition_fee' && p.status === 'completed'
        );
        
        // Final Admission = Enrollment Number Generated OR Admission ID Generated OR (Bypass Type + Tuition Paid)
        const isAdmitted = hasEnrollmentForThisApp || hasAdmissionNumber || (isNonProvBypass && hasTuitionFee);

        // Logic branching: Bypass types (GCAS/ACPC/Direct)
        if (isBypassType) {
            // For bypass types, we show the count if it's submitted (it bypasses verification/approval)
            if (!isCancelledOrRemoved) {
                // 1. All Applications
                increment('all');
                increment('submitted');

                // For bypass, if it's submitted, we count it as approved (since it bypasses verification)
                increment('approved');

                if (hasPaidTargetFee) increment('paid');

                if (isAdmitted) {
                    increment('admitted_id');
                    increment('admitted');
                    if (hasTuitionFee) increment('admitted_paid');
                }

                // Unique student tracking for Detailed View
                if (app.student_id) {
                    if (!stats.students[app.student_id]) stats.students[app.student_id] = new Set();
                    stats.students[app.student_id].add(type);
                }
            }
        } else {
            // Standard Logic for Provisional/MQ/NRI
            
            // 1. All Applications
            increment('all');

            // 2. Submitted Apps
            if (app.status !== 'draft' && !isCancelledOrRemoved) {
                increment('submitted');
            }

            // 3. Approved Apps
            // Logic: For strictly 'Provisional' form type, count ONLY status='approved'
            // For MQ/NRI and Vacant, count as per user request (status='submitted' and application_fee_status='paid')
            let isMetricApproved = false;
            if (isProv) {
                isMetricApproved = app.status === 'approved';
            } else if (type === 'MQ/NRI' || type === 'MNNQ/NRI' || type === 'Vacant') {
                isMetricApproved = app.status === 'submitted' && app.application_fee_status === 'paid';
            } else {
                const isPaidProv = isProv && hasPaidTargetFee; // Note: isProv check is redundant here but safe
                isMetricApproved = isApprovedStatus || hasEnrollmentForThisApp || isPaidProv;
            }
            
            if (isMetricApproved && !isCancelledOrRemoved) {
                increment('approved');
            }
            
            // 4. Paid: Application/Provisional fee paid
            if (hasPaidTargetFee && !isCancelledOrRemoved) {
                increment('paid');
            }

            // 5. Admitted
            if (isAdmitted && !isCancelledOrRemoved) {
                increment('admitted_id');
                increment('admitted');
            }

            // 6. Admitted & Paid
            if (hasTuitionFee && isAdmitted && !isCancelledOrRemoved) {
                increment('admitted_paid');
            }

            // Unique student tracking for Detailed View
            if (app.student_id && !isCancelledOrRemoved) {
                if (!stats.students[app.student_id]) stats.students[app.student_id] = new Set();
                stats.students[app.student_id].add(type);
            }
        }
    });

    const globalFormTypesSet = new Set<string>();

    const capacityDataGrouped = (courses || []).reduce((acc: any, course: any) => {
        const collegeName = course.colleges?.name || 'Unknown College';
        if (!acc[collegeName]) {
            acc[collegeName] = { courses: [], formTypesSet: new Set<string>() };
        }

        // Add regular branches
        const mappedBranches = (course.branches || []).map((branch: any) => {
            const stats = branchStats[branch.id];
            let uniqueCount = 0;
            let commonCount = 0;
            
            if (stats) {
                ['all', 'submitted', 'approved', 'paid', 'admitted', 'admitted_id', 'admitted_paid'].forEach(metric => {
                    Object.keys(stats[metric].formTypes).forEach(ft => {
                        acc[collegeName].formTypesSet.add(ft);
                        globalFormTypesSet.add(ft);
                    });
                });
                uniqueCount = Object.keys(stats.students).length;
                commonCount = Object.values(stats.students).filter((s: any) => s.size > 1).length;
            }

            const legacyFormTypes: Record<string, { total: number, approved: number }> = {};
            if (stats) {
                Object.keys(stats.all.formTypes).forEach(ft => {
                    legacyFormTypes[ft] = {
                        total: stats.all.formTypes[ft] || 0,
                        approved: stats.approved.formTypes[ft] || 0
                    };
                });
            }

            return {
                id: branch.id,
                name: branch.name,
                capacity: branch.intake_capacity || 0,
                approved: stats?.approved?.total || 0,
                admissions: stats?.admitted?.total || 0,
                formTypes: legacyFormTypes,
                metrics: stats || {
                    all: { total: 0, formTypes: {} },
                    submitted: { total: 0, formTypes: {} },
                    approved: { total: 0, formTypes: {} },
                    paid: { total: 0, formTypes: {} },
                    admitted: { total: 0, formTypes: {} },
                    admitted_id: { total: 0, formTypes: {} },
                    admitted_paid: { total: 0, formTypes: {} }
                },
                uniqueCount,
                commonCount,
                paidApps: stats?.paid?.total || 0,
                paidFormTypes: stats?.paid?.formTypes || {},
                admissionsFormTypes: stats?.admitted?.formTypes || {}
            };
        });

        // Add "Unassigned" branch if there are applications
        const unassignedStats = branchStats[`unassigned_${course.id}`];
        if (unassignedStats) {
            const legacyFormTypes: Record<string, { total: number, approved: number }> = {};
            Object.keys(unassignedStats.all.formTypes).forEach(ft => {
                legacyFormTypes[ft] = {
                    total: unassignedStats.all.formTypes[ft] || 0,
                    approved: unassignedStats.approved.formTypes[ft] || 0
                };
                acc[collegeName].formTypesSet.add(ft);
                globalFormTypesSet.add(ft);
            });

            mappedBranches.push({
                id: `unassigned_${course.id}`,
                name: 'Unassigned/Other',
                capacity: 0,
                approved: unassignedStats.approved.total,
                admissions: unassignedStats.admitted.total,
                formTypes: legacyFormTypes,
                metrics: unassignedStats,
                uniqueCount: Object.keys(unassignedStats.students).length,
                commonCount: Object.values(unassignedStats.students).filter((s: any) => s.size > 1).length,
                paidApps: unassignedStats.paid.total,
                paidFormTypes: unassignedStats.paid.formTypes,
                admissionsFormTypes: unassignedStats.admitted.formTypes
            });
        }

        acc[collegeName].courses.push({
            courseName: course.name,
            branches: mappedBranches,
        });

        return acc;
    }, {});

    const globalUniqueFormTypes = Array.from(globalFormTypesSet).sort();

    const capacityData = Object.keys(capacityDataGrouped).map(collegeName => ({
        collegeName,
        courses: capacityDataGrouped[collegeName].courses,
        uniqueFormTypes: Array.from(capacityDataGrouped[collegeName].formTypesSet).sort()
    }));

    return {
        capacityData,
        globalUniqueFormTypes,
        academicYears: academicYears || [],
        selectedYearId,
        includeRejected,
        excludeProv,
        includeCancelled,
        includeTransferred,
        selectedAdmissionType,
        availableAdmissionTypes,
        activeYearId: activeYear?.id
    };
};
