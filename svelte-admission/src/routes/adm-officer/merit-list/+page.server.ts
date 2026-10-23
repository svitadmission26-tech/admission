import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { calculateAndRankMerit } from '$lib/server/merit'; // Ensure correct import
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (!['adm_officer', 'admin'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    const courseId = url.searchParams.get('courseId');
    const cycleId = url.searchParams.get('cycleId');
    const formType = url.searchParams.get('formType');

    // Fetch options
    const { data: courses } = await supabase.from('courses').select('id, name');
    const { data: branches } = await supabase.from('branches').select('id, name, course_id');
    const { data: cycles } = await supabase.from('admission_cycles').select('id, name').eq('is_active', true);
    const { data: formTypes } = await supabase.from('form_types').select('name').eq('is_active', true).order('name');

    // Fetch admission forms to determine publication status
    const { data: admissionForms } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, is_merit_published');

    // Fetch relevant applications based on filters (Server-Side Filtering)
    // CRITICAL: We also need to fetch ANY application that has a merit rank assigned.
    let rawQuery = supabase
        .from('applications')
        .select(`
            id, student_id, status, application_fee_status, course_id, cycle_id, form_type, approval_comment, branch_id,
            student_user:users!applications_student_id_fkey (full_name, email),
            courses(name),
            branches(name),
            merit_list_entries!inner(merit_rank, merit_score)
        `);

    if (courseId) rawQuery = rawQuery.eq('course_id', courseId);
    if (cycleId) rawQuery = rawQuery.eq('cycle_id', cycleId);
    if (formType) rawQuery = rawQuery.eq('form_type', formType);

    const { data: rawApplications, error: appError } = await rawQuery;

    // Fetch unranked ones that are eligible for generation, also with filters
    let unrankedQuery = supabase
        .from('applications')
        .select(`
            id, student_id, status, application_fee_status, course_id, cycle_id, form_type, approval_comment, branch_id,
            student_user:users!applications_student_id_fkey (full_name, email),
            courses(name),
            branches(name),
            merit_list_entries(merit_rank, merit_score)
        `)
        .or('status.in.("verified","approved","waitlisted"),and(status.eq.submitted,application_fee_status.eq.paid)');

    if (courseId) unrankedQuery = unrankedQuery.eq('course_id', courseId);
    if (cycleId) unrankedQuery = unrankedQuery.eq('cycle_id', cycleId);
    if (formType) unrankedQuery = unrankedQuery.eq('form_type', formType);

    const { data: unrankedApps } = await unrankedQuery;

    // Merge without duplicates
    let finalApplications = rawApplications || [];
    const existingIds = new Set(finalApplications.map(a => a.id));
    unrankedApps?.forEach(app => {
        if (!existingIds.has(app.id)) {
            (finalApplications as any).push(app);
        }
    });

    if (appError && !finalApplications) {
        console.error('Error fetching applications:', appError.message);
    }

    // --- Provisional Fallback logic (Branch & Comment) ---
    if (finalApplications && finalApplications.length > 0) {
        const studentIds = finalApplications.map(app => app.student_id);

        if (studentIds.length > 0) {
            const { data: formTypesData } = await supabase
                .from('form_types')
                .select('name, is_prov');

            const provFormTypes = formTypesData
                ?.filter(ft => ft.is_prov)
                .map(ft => ft.name) || ['Provisional'];

            const { data: provApps } = await supabase
                .from('applications')
                .select('student_id, branches(name), approval_comment')
                .in('student_id', studentIds)
                .in('form_type', provFormTypes);

            if (provApps && provApps.length > 0) {
                const provDataMap = new Map();
                provApps.forEach(pa => {
                    // Store the first one found or prioritize one with branch/comment? 
                    // Usually there's only one provisional.
                    provDataMap.set(pa.student_id, {
                        branch_name: (pa.branches as any)?.name,
                        comment: pa.approval_comment
                    });
                });

                finalApplications.forEach(app => {
                    const pData = provDataMap.get(app.student_id);
                    if (pData) {
                        if (!app.branches?.name && pData.branch_name) {
                            (app as any).prov_branch_name = pData.branch_name;
                        }
                        if (pData.comment) {
                            (app as any).prov_approval_comment = pData.comment;
                        }
                    }
                });
            }
        }
    }

    // Flatten and sort
    const mappedApps = (finalApplications || [])?.map(app => {
        const meritEntry = Array.isArray(app.merit_list_entries) 
            ? app.merit_list_entries[0] 
            : app.merit_list_entries;
        return {
            ...app,
            merit_rank: meritEntry?.merit_rank,
            merit_score: meritEntry?.merit_score
        };
    }).sort((a, b) => {
        // Sort by rank ascending (nulls last)
        if (a.merit_rank && b.merit_rank) return a.merit_rank - b.merit_rank;
        if (a.merit_rank) return -1;
        if (b.merit_rank) return 1;
        return 0;
    }) || [];

    return {
        courses: courses || [],
        branches: branches || [],
        cycles: cycles || [],
        formTypes: formTypes || [],
        applications: mappedApps,
        admissionForms: admissionForms || [],
        filters: { courseId, cycleId, formType }
    };
};

export const actions: Actions = {
    generateMerit: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;
        const target_status = formData.get('target_status') as string || 'verified';

        if (!course_id || !cycle_id) {
            return fail(400, { message: 'Course and Cycle are required.', error: true });
        }

        // Use Service Role to bypass RLS for bulk updates if needed (though adm_officer should have permissions)
        // Using service role guarantees the update works regardless of complex RLS on 'merit_rank' updates.
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const result = await calculateAndRankMerit(supabaseAdmin, course_id, cycle_id, form_type, target_status);

        if (!result.success) {
            return fail(500, { message: result.message, error: true });
        }

        return { success: true, message: result.message };
    },

    publishMerit: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;

        // Use Service Role to bypass RLS (Admission Officer might not have UPDATE permission on forms table)
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch ALL forms for this course/cycle to perform robust matching in JS
        const { data: candidates, error: findError } = await supabaseAdmin.from('admission_forms')
            .select('id, form_type')
            .eq('course_id', course_id)
            .eq('cycle_id', cycle_id);
        
        if (findError || !candidates || candidates.length === 0) {
             return fail(404, { message: 'Admission form configuration not found.', error: true });
        }

        // Find the target form
        const target = candidates.find(c => 
            c.form_type === form_type || 
            (!c.form_type && (form_type === 'Provisional' || form_type === 'MQ/NRI'))
        );

        if (!target) {
            console.error(`No matching form found for type '${form_type}'. Candidates:`, candidates);
            return fail(404, { message: `Form type '${form_type}' configuration not found.`, error: true });
        }

        // Update the identified form
        const { error } = await supabaseAdmin
            .from('admission_forms')
            .update({ is_merit_published: true })
            .eq('id', target.id);

        if (error) {
            console.error('Error publishing merit list:', error.message);
            return fail(500, { message: 'Failed to publish merit list.', error: true });
        }

        return { success: true, message: 'Merit List Published successfully! (Ranks are now live)' };
    },

    unpublishMerit: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch ALL forms for this course/cycle
        const { data: candidates, error: findError } = await supabaseAdmin.from('admission_forms')
            .select('id, form_type')
            .eq('course_id', course_id)
            .eq('cycle_id', cycle_id);
        
        if (findError || !candidates || candidates.length === 0) {
             return fail(404, { message: 'Admission form configuration not found.', error: true });
        }

        // Find the target form
        const target = candidates.find(c => 
            c.form_type === form_type || 
            (!c.form_type && (form_type === 'Provisional' || form_type === 'MQ/NRI'))
        );

        if (!target) {
            return fail(404, { message: `Form type '${form_type}' configuration not found.`, error: true });
        }

        const { error } = await supabaseAdmin
            .from('admission_forms')
            .update({ is_merit_published: false })
            .eq('id', target.id);

        if (error) {
            console.error('Error unpublishing merit list:', error.message);
            return fail(500, { message: 'Failed to unpublish merit list.', error: true });
        }

        return { success: true, message: 'Merit List Unpublished. Ranks hidden from students.' };
    }
};
