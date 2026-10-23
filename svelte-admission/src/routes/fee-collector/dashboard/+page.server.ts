import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login'); // Redirect non-fee_collector users
    }

    const statusFilter = url.searchParams.get('status') || 'pending'; // Default to 'pending'
    const courseIdFilter = url.searchParams.get('course_id') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '25');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch courses for the filter dropdown
    let coursesQuery = supabase.from('courses').select('id, name');
    coursesQuery = applyRoleBasedCollegeFilter(coursesQuery, userProfile, 'courses');
    const { data: courses } = await coursesQuery.order('name');

    // Fetch account_admissions records with pagination
    let aaQuery = supabase
        .from('account_admissions')
        .select(`
            *,
            applications!inner(
                id,
                student_id,
                course_id,
                cycle_id,
                status,
                student_user:users!applications_student_id_fkey(full_name, email),
                courses!inner(name, college_id),
                admission_cycles(academic_year_id),
                payments(id, amount, status)
            )
        `, { count: 'exact' })
        .eq('account_status', statusFilter) // Apply status filter
        .neq('enrollment_status', 'provisional') // Exclude provisional admissions from this view
        .neq('applications.status', 'cancelled') // Exclude cancelled admissions
        .range(from, to);

    if (courseIdFilter) {
        aaQuery = aaQuery.eq('applications.course_id', courseIdFilter);
    }

    aaQuery = applyRoleBasedCollegeFilter(aaQuery, userProfile, 'admissions');

    const { data: accountAdmissions, count: totalCount, error: aaError } = await aaQuery;

    if (aaError) {
        console.error('Error fetching account admissions:', aaError.message);
        return { 
            accountAdmissions: [], 
            feeStructures: [], 
            courses: courses || [],
            selectedStatus: statusFilter,
            selectedCourseId: courseIdFilter,
            pagination: { page, limit, total: 0, totalPages: 0 }
        };
    }

    // Process to get fee structures for the current page in batch
    const courseIds = [...new Set(accountAdmissions?.map(aa => aa.applications?.courses?.id).filter(Boolean))];
    const academicYearIds = [...new Set(accountAdmissions?.map(aa => aa.applications?.admission_cycles?.academic_year_id).filter(Boolean))];

    let feeStructures: any[] = [];
    if (courseIds.length > 0 && academicYearIds.length > 0) {
        const { data: allFs, error: fsError } = await supabase
            .from('fee_structures')
            .select('id, total_amount, metadata, course_id, academic_year_id')
            .in('course_id', courseIds)
            .in('academic_year_id', academicYearIds);

        if (fsError) {
            console.error('Error fetching batch fee structures:', fsError.message);
        } else {
            // Map fee structures back to admissions
            feeStructures = accountAdmissions?.map(aa => {
                const fs = allFs?.find(f => 
                    f.course_id === aa.applications?.courses?.id && 
                    f.academic_year_id === aa.applications?.admission_cycles?.academic_year_id
                );
                return fs ? { applicationId: aa.application_id, feeStructure: fs } : null;
            }).filter(Boolean) || [];
        }
    }

    return {
        accountAdmissions: accountAdmissions || [],
        feeStructures: feeStructures,
        courses: courses || [],
        selectedStatus: statusFilter,
        selectedCourseId: courseIdFilter,
        pagination: {
            page,
            limit,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / limit)
        }
    };
};

export const actions: Actions = {
    updateAccountStatus: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const account_admission_id = formData.get('account_admission_id') as string;
        const status = formData.get('status') as string;
        const remarks = formData.get('remarks') as string;

        // Basic validation
        if (!['pending', 'cleared', 'partial'].includes(status)) {
            return fail(400, { message: 'Invalid status provided.', error: true });
        }

        const { error } = await supabase
            .from('account_admissions')
            .update({ account_status: status, remarks: remarks })
            .eq('id', account_admission_id);

        if (error) {
            console.error('Error updating account admission status:', error.message);
            return fail(500, { message: 'Failed to update account status.', error: true });
        }

        return { success: true, message: 'Account status updated successfully!' };
    }
};
