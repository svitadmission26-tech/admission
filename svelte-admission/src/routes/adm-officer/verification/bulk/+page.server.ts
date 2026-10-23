import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin', 'college_auth'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    // Use Service Role to ensure we get all data cleanly for bulk processing
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    // Filter Params
    const status = url.searchParams.get('status') || 'submitted'; 
    const courseId = url.searchParams.get('courseId') || null;
    const search = url.searchParams.get('search') || ''; 

    // 1. Get Course & Form Type Options for Filter Dropdown
    const [coursesRes, formTypesRes] = await Promise.all([
        applyRoleBasedCollegeFilter(supabaseAdmin.from('courses').select('id, name, college_id'), userProfile, 'courses'),
        supabaseAdmin.from('form_types').select('name, is_prov').eq('is_active', true).order('name')
    ]);

    const courses = coursesRes.data || [];
    const formTypes = formTypesRes.data || [];

    // Default formType to MQ/NRI if available in list and not explicitly set
    let formType = url.searchParams.get('formType');
    if (formType === null && formTypes.some(ft => ft.name === 'MQ/NRI')) {
        formType = 'MQ/NRI';
    }

    // Pagination
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // 2. Build Main Applications Query
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id, student_id, status, form_type, submitted_at, updated_at,
            student_user:users!student_id!inner (
                full_name, 
                email,
                student_profiles(enrollment_number)
            ),
            courses!inner (name, college_id),
            branches (name),
            documents (*)
        `, { count: 'exact' });

    // Apply Central Security Filtering (Same as Dashboard)
    query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');

    // Apply UI Filters
    if (status === 'submitted') {
        query = query.in('status', ['submitted', 'needs_correction']);
    } else {
        query = query.eq('status', status);
    }

    if (courseId) {
        query = query.eq('course_id', courseId);
    }

    if (formType) {
        query = query.eq('form_type', formType);
    }

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: 'student_user' });
    }

    // Sort: Newest updates first (so reverted applications jump to top)
    query = query
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

    console.log(`[AdmBulkLoad] Loading Center. User: ${userProfile.full_name}, Role: ${userProfile.role}`);
    
    const { data: applications, count, error } = await query;

    if (error) {
        console.error('[AdmBulkLoad] Query Error:', error.message);
    }

    // --- Provisional Branch Fallback logic ---
    if (applications && applications.length > 0) {
        const studentIdsMissingBranch = applications
            .filter(app => !app.branches?.name)
            .map(app => (app as any).student_id); // student_id is not in select? Let me check

        if (studentIdsMissingBranch.length > 0) {
            const provFormTypes = formTypes
                ?.filter(ft => ft.is_prov) // need to fetch is_prov
                .map(ft => ft.name) || ['Provisional'];

            const { data: provApps } = await supabaseAdmin
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

                applications.forEach(app => {
                    if (!app.branches?.name) {
                        const provBranchName = provBranchMap.get((app as any).student_id);
                        if (provBranchName) {
                            (app as any).prov_branch_name = provBranchName;
                        }
                    }
                });
            }
        }
    }

    return {
        applications: applications || [],
        courses: courses || [],
        formTypes: formTypes || [],
        statusFilter: status,
        courseFilter: courseId,
        formTypeFilter: formType,
        search,
        count: count || 0,
        page,
        limit
    };
};

export const actions: Actions = {
    bulkVerify: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth', 'admin'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const applicationIds = JSON.parse(formData.get('application_ids') as string);

        if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
            return fail(400, { message: 'No applications selected.' });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Approve all documents for these applications
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'approved', rejection_reason: null })
            .in('application_id', applicationIds);

        if (docError) {
            console.error('Bulk Doc Update Error:', docError);
            return fail(500, { message: 'Failed to approve documents in bulk.' });
        }

        // 2. Also verify the applications (As Adm Officer/Admin)
        const { error: appError } = await supabaseAdmin
            .from('applications')
            .update({ status: 'verified', updated_at: new Date().toISOString(), updated_by: userProfile.id })
            .in('id', applicationIds);

        if (appError) {
            console.error('Bulk App Verify Error:', appError);
            return fail(500, { message: 'Failed to verify applications in bulk.' });
        }

        return { success: true, message: `Successfully verified ${applicationIds.length} applications.` };
    },

    approveDocument: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth', 'admin'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;
        const application_id = formData.get('application_id') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Check application status
        const { data: app, error: appFetchError } = await supabaseAdmin
            .from('applications')
            .select('status')
            .eq('id', application_id)
            .single();

        if (appFetchError || !app) {
            return fail(404, { message: 'Application not found.' });
        }

        if (['verified', 'approved'].includes(app.status)) {
            return fail(403, { message: 'Error: Cannot approve document for an already verified or approved application.', error: true });
        }

        // 1. Approve Document
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'approved', rejection_reason: null })
            .eq('id', document_id);

        if (docError) return fail(500, { message: 'Failed to approve document.' });

        return { success: true, message: 'Document Approved.' };
    },

    verifyStudent: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Approve all documents
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'approved', rejection_reason: null })
            .eq('application_id', application_id);

        if (docError) {
            console.error('Doc Update Error:', docError);
            return fail(500, { message: 'Failed to approve documents.' });
        }

        // 2. Verify Application
        const { error: appError } = await supabaseAdmin
            .from('applications')
            .update({ status: 'verified' })
            .eq('id', application_id);

        if (appError) {
            console.error('App Verify Error:', appError);
            return fail(500, { message: 'Failed to verify application.' });
        }

        return { success: true, message: 'Student Verified Successfully' };
    },

    rejectDocument: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;
        const application_id = formData.get('application_id') as string;
        const reason = formData.get('reason') as string;

        if (!reason) return fail(400, { message: 'Rejection reason is required.' });

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Check application status
        const { data: app, error: appFetchError } = await supabaseAdmin
            .from('applications')
            .select('status')
            .eq('id', application_id)
            .single();

        if (appFetchError || !app) {
            console.error('App fetch error:', appFetchError?.message);
            return fail(404, { message: 'Application not found.' });
        }

        if (['verified', 'approved'].includes(app.status)) {
            return fail(403, { message: 'Error: Cannot reject document for an already verified or approved application.', error: true });
        }
        
        // 1. Reject Document
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'rejected', rejection_reason: reason })
            .eq('id', document_id);

        if (docError) return fail(500, { message: 'Failed to reject document.' });

        // 2. Flag Application
        const { error: appError } = await supabaseAdmin
            .from('applications')
            .update({ status: 'needs_correction' })
            .eq('id', application_id);

        if (appError) return fail(500, { message: 'Failed to update application status.' });

        return { success: true, message: 'Document Rejected.' };
    },

    undoRejectDocument: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;
        const application_id = formData.get('application_id') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Reset Document
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'pending', rejection_reason: null })
            .eq('id', document_id);

        if (docError) return fail(500, { message: 'Failed to undo rejection.' });

        // 2. Check if any other documents are still rejected
        const { count, error: countError } = await supabaseAdmin
            .from('documents')
            .select('id', { count: 'exact', head: true })
            .eq('application_id', application_id)
            .eq('status', 'rejected');

        if (countError) console.error('Count Error:', countError);

        // 3. If no more rejected documents, revert application status to 'submitted'
        if (count === 0) {
            const { error: appError } = await supabaseAdmin
                .from('applications')
                .update({ status: 'submitted' })
                .eq('id', application_id)
                .eq('status', 'needs_correction'); // Only update if currently flagged for correction
            
            if (appError) console.error('App Revert Error:', appError);
        }

        return { success: true, message: 'Rejection Undone.' };
    }
};
