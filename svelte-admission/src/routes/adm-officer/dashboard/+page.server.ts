import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'adm_officer' && userProfile?.role !== 'admin') { // Admin can also view dashboard
        throw redirect(303, '/login'); // Redirect non-authorized users
    }

    // --- 1. Parse Search & Filter Parameters First ---
    const statusParam = url.searchParams.get('status');
    const selectedStatuses = statusParam ? statusParam.split(',').filter(Boolean) : [];
    const searchQuery = url.searchParams.get('search');
    const courseFilter = url.searchParams.get('course');
    const branchFilter = url.searchParams.get('branch');
    const formTypeParam = url.searchParams.get('form_type');
    const selectedFormTypes = formTypeParam ? formTypeParam.split(',').filter(Boolean) : ['Provisional'];
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    
    // Pagination & Sorting
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const sortField = url.searchParams.get('sort') || 'updated_at';
    const sortOrder = url.searchParams.get('order') || 'desc';
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // --- 2. Build Main Filtered Applications Query ---
    let applicationsQuery = supabase
        .from('applications')
        .select(`
            *,
            approval_comment,
            users!student_id!inner(full_name, email, student_profiles(enrollment_number)),
            courses(name, code, colleges(name)),
            branches(name),
            merit_list_entries(merit_score, merit_rank),
            payments(receipt_number, payment_type, status, created_at)
        `, { count: 'exact' });
    
    applicationsQuery = applyRoleBasedCollegeFilter(applicationsQuery, userProfile, 'applications');

    // Add filters
    if (selectedStatuses.length > 0) {
        applicationsQuery = applicationsQuery.in('status', selectedStatuses);
    } else {
        // Exclude drafts by default if no specific status is selected
        applicationsQuery = applicationsQuery.neq('status', 'draft');
    }

    if (courseFilter) applicationsQuery = applicationsQuery.eq('course_id', courseFilter);
    if (branchFilter) applicationsQuery = applicationsQuery.eq('branch_id', branchFilter);
    if (selectedFormTypes.length > 0) applicationsQuery = applicationsQuery.in('form_type', selectedFormTypes);
    if (startDate) applicationsQuery = applicationsQuery.gte('updated_at', startDate);
    if (endDate) applicationsQuery = applicationsQuery.lte('updated_at', endDate + 'T23:59:59');

    if (searchQuery) {
        applicationsQuery = applicationsQuery.or(`email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`, { foreignTable: 'users' });
    }

    // Sort & Paginate (If sorting by receipt or name, we paginate in-memory after fetching)
    if (!searchQuery && sortField !== 'receipt_number' && sortField !== 'student_name') {
        const allowedSorts = ['updated_at', 'status', 'merit_score'];
        if (sortField === 'merit_score') {
            applicationsQuery = applicationsQuery.order('merit_score', { foreignTable: 'merit_list_entries', ascending: sortOrder === 'asc' });
        } else if (allowedSorts.includes(sortField)) {
            applicationsQuery = applicationsQuery.order(sortField, { ascending: sortOrder === 'asc' });
        } else {
            applicationsQuery = applicationsQuery.order('updated_at', { ascending: false });
        }
        applicationsQuery = applicationsQuery.range(from, to);
    }

    // --- 3. Build Recent Applications Query ---
    let recentAppsQuery = supabase
        .from('applications')
        .select(`
            id, status, form_type, submitted_at,
            users!student_id(full_name, email),
            courses(name, code),
            branches(name)
        `);
    
    recentAppsQuery = applyRoleBasedCollegeFilter(recentAppsQuery, userProfile, 'applications');
    recentAppsQuery = recentAppsQuery
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false })
        .limit(10);

    if (searchQuery || sortField === 'receipt_number' || sortField === 'student_name') {
        console.log(`🔍 Adm-Officer dashboard: ${searchQuery ? 'Searching' : 'Sorting'}. Fetching all records for in-memory processing.`);
    }

    // --- 4. Parallel Aggregated and Main List Fetching ---
    const [
        statusCountsRes,
        courseCountsRes,
        totalApplicationFeesRes,
        totalProvFeesRes,
        totalApplicationsRes,
        allCoursesRes,
        allBranchesRes,
        distinctTypesRes,
        allAppBranchesRes,
        activeYearRes,
        formTypesDataRes,
        applicationsRes,
        recentApplicationsRes
    ] = await Promise.all([
        supabase.rpc('get_application_status_counts'),
        supabase.rpc('get_application_course_counts'),
        supabase.from('payments').select('amount').eq('status', 'completed').eq('payment_type', 'application_fee'),
        supabase.from('payments').select('amount').eq('status', 'completed').eq('payment_type', 'provisional_fee'),
        supabase.from('applications').select('*', { count: 'exact', head: true }).neq('status', 'draft'),
        supabase.from('courses').select('id, name, code').order('name'),
        supabase.from('branches').select('id, name, course_id, courses(name)').order('name'),
        supabase.from('applications').select('form_type').limit(100),
        supabase.from('applications').select('id, course_id, branch_id, form_type').neq('status', 'draft'),
        supabase.from('academic_years').select('id, name').eq('is_active', true).maybeSingle(),
        supabase.from('form_types').select('name, is_prov'),
        applicationsQuery,
        recentAppsQuery
    ]);

    const { data: statusCounts, error: statusError } = statusCountsRes;
    const { data: courseCounts, error: courseError } = courseCountsRes;
    const { data: totalApplicationFees, error: appFeesError } = totalApplicationFeesRes;
    const { data: totalProvFees, error: provFeesError } = totalProvFeesRes;
    const { count: totalApplications, error: totalAppError } = totalApplicationsRes;
    const { data: allCourses } = allCoursesRes;
    const { data: allBranches } = allBranchesRes;
    const { data: distinctTypes } = distinctTypesRes;
    const { data: allAppBranches } = allAppBranchesRes;
    const { data: activeYear } = activeYearRes;
    const { data: formTypesData } = formTypesDataRes;
    const { data: rawApplications, count: totalCount, error: filteredAppError } = applicationsRes;
    const { data: recentApplications } = recentApplicationsRes;

    // Fetch Inquiry counts for the active year (Second parallel block, dependent on activeYear)
    let totalInquiries = 0;
    let processedInquiries = 0;
    
    if (activeYear?.data?.id) {
        const [totalRes, processedRes] = await Promise.all([
            supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('academic_year_id', activeYear.data.id),
            supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('academic_year_id', activeYear.data.id).eq('is_processed', true)
        ]);
        totalInquiries = totalRes.count || 0;
        processedInquiries = processedRes.count || 0;
    } else {
        const [totalRes, processedRes] = await Promise.all([
            supabase.from('inquiries').select('*', { count: 'exact', head: true }),
            supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('is_processed', true)
        ]);
        totalInquiries = totalRes.count || 0;
        processedInquiries = processedRes.count || 0;
    }

    if (statusError) console.error('Error fetching application status counts:', statusError.message);
    if (courseError) console.error('Error fetching application course counts:', courseError.message);
    if (filteredAppError) console.error('Error fetching filtered applications:', filteredAppError.message);

    const totalAmountCollected = totalApplicationFees?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    if (appFeesError) console.error('Error fetching total application fees:', appFeesError.message);

    const totalProvFeesCollected = totalProvFees?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    if (provFeesError) console.error('Error fetching total provisional fees:', provFeesError.message);

    if (totalAppError) console.error('Error fetching total applications:', totalAppError.message);

    // Get distinct form types
    const formTypes = [...new Set(distinctTypes?.map(a => a.form_type).filter(Boolean))].sort();
    
    const courseCountsMap = new Map<string, number>();
    const branchCountsMap = new Map<string, number>();
    const formTypeCountsMap = new Map<string, number>();

    allAppBranches?.forEach(app => {
        if (app.course_id) {
            courseCountsMap.set(app.course_id, (courseCountsMap.get(app.course_id) || 0) + 1);
        }
        if (app.branch_id) {
            branchCountsMap.set(app.branch_id, (branchCountsMap.get(app.branch_id) || 0) + 1);
        }
        if (app.form_type) {
            formTypeCountsMap.set(app.form_type, (formTypeCountsMap.get(app.form_type) || 0) + 1);
        }
    });

    const calculatedCourseCounts = allCourses?.map(c => ({
        course_name: c.name,
        count: courseCountsMap.get(c.id) || 0
    })).filter(c => c.count > 0).sort((a, b) => b.count - a.count) || [];

    const branchCounts = allBranches?.map(b => ({
        branch_id: b.id,
        branch_name: b.name,
        course_id: b.course_id,
        count: branchCountsMap.get(b.id) || 0
    })).filter(b => b.count > 0).sort((a, b) => b.count - a.count) || [];

    const formTypeCounts = Array.from(formTypeCountsMap.entries())
        .map(([type, count]) => ({ form_type: type, count }))
        .sort((a, b) => b.count - a.count);

    const formTypesMap = new Map<string, boolean>();
    formTypesData?.forEach(ft => {
        if (ft?.name) {
            formTypesMap.set(ft.name, Boolean(ft.is_prov));
        }
    });

    // --- Provisional Branch Fallback logic ---
    if (rawApplications && rawApplications.length > 0) {
        const studentIdsMissingBranch = rawApplications
            .filter(app => !app.branches?.name)
            .map(app => app.student_id);

        if (studentIdsMissingBranch.length > 0) {
            const provFormTypes = formTypesData
                ?.filter(ft => ft.is_prov)
                .map(ft => ft.name) || ['Provisional'];

            const { data: provApps } = await supabase
                .from('applications')
                .select('student_id, branches(name)')
                .in('student_id', studentIdsMissingBranch)
                .in('form_type', provFormTypes)
                .not('branch_id', 'is', null);

            if (provApps && provApps.length > 0) {
                const provBranchMap = new Map();
                provApps.forEach(pa => {
                    const branchName = (pa.branches as any)?.name;
                    if (branchName) {
                        provBranchMap.set(pa.student_id, branchName);
                    }
                });

                rawApplications.forEach(app => {
                    if (!app.branches?.name) {
                        const provBranchName = provBranchMap.get(app.student_id);
                        if (provBranchName) {
                            (app as any).prov_branch_name = provBranchName;
                        }
                    }
                });
            }
        }
    }

    let processedApplications = rawApplications || [];

    // Helper to extract sorting receipt
    const getSortReceipt = (app: any) => {
        const isProvType = formTypesMap.get(app.form_type) === true;
        const payment = (app.payments || []).find((p: any) => p.payment_type === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) 
                     || (app.payments || []).find((p: any) => p.receipt_number);
        if (!payment?.receipt_number) return { num: '', seq: 0 };
        const seqMatch = payment.receipt_number.match(/(\d+)$/);
        return {
            num: payment.receipt_number,
            seq: seqMatch ? parseInt(seqMatch[1]) : 0
        };
    };

    // In-memory sorting for receipt_number or student_name
    if (sortField === 'receipt_number') {
        processedApplications.sort((a, b) => {
            const rA = getSortReceipt(a);
            const rB = getSortReceipt(b);
            if (rA.seq !== rB.seq) {
                return sortOrder === 'asc' ? rA.seq - rB.seq : rB.seq - rA.seq;
            }
            return sortOrder === 'asc' ? rA.num.localeCompare(rB.num) : rB.num.localeCompare(rA.num);
        });
    } else if (sortField === 'student_name') {
        processedApplications.sort((a, b) => {
            const nameA = (a as any).users?.full_name || '';
            const nameB = (b as any).users?.full_name || '';
            return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        });
    }

    // Final pagination
    const finalApplications = (searchQuery || sortField === 'receipt_number' || sortField === 'student_name') 
        ? processedApplications.slice(from, to + 1) 
        : processedApplications;
    const finalCount = (searchQuery || sortField === 'receipt_number' || sortField === 'student_name') ? processedApplications.length : (totalCount || 0);

    // Fetch Print Profile Templates
    const { data: printTemplates } = await supabase
        .from('report_templates')
        .select('id, name, target_form_type_id')
        .eq('report_type', 'html_profile')
        .contains('allowed_roles', [userProfile?.role]);

    // Add ID to formTypesMap for frontend filtering
    const formTypeIdentityMap = Object.fromEntries((formTypesData || []).map(ft => [(ft.name || '').toLowerCase(), (ft as any).id]));

    return {
        statusCounts: (statusCounts || []).filter((s: any) => s.status !== 'draft'),
        courseCounts: calculatedCourseCounts,
        branchCounts: branchCounts || [],
        formTypeCounts: formTypeCounts || [],
        totalAmountCollected: totalAmountCollected,
        totalProvFeesCollected: totalProvFeesCollected,
        totalApplications: totalApplications || 0,
        totalInquiries: totalInquiries,
        processedInquiries: processedInquiries,
        activeYearName: activeYear?.data?.name || 'Current Year',
        formTypesMap: Object.fromEntries(formTypesMap),
        filteredApplications: finalApplications,
        recentApplications: recentApplications || [],
        filters: {
            status: selectedStatuses.join(','),
            search: searchQuery,
            course: courseFilter,
            branch: branchFilter,
            form_type: selectedFormTypes.join(','),
            start_date: startDate,
            end_date: endDate,
            page,
            limit,
            sort: sortField,
            order: sortOrder
        },
        pagination: {
            total: finalCount,
            page,
            limit,
            totalPages: Math.ceil(finalCount / limit)
        },
        options: {
            courses: allCourses || [],
            branches: allBranches || [],
            formTypes: formTypes || []
        },
        printTemplates: printTemplates || [],
        formTypeIdentityMap
    };
};
