import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();

    if (!session) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'fee_collector' && userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    // Use Service Role for robust fetching
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Extract Filter Parameters ---
    const courseFilter = url.searchParams.get('course');
    const branchFilter = url.searchParams.get('branch');
    const statusFilter = url.searchParams.get('status');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    // --- Fetch Metadata for Filters ---
    const { data: allCourses } = await supabaseAdmin.from('courses').select('id, name, code').order('name');
    const { data: allBranches } = await supabaseAdmin.from('branches').select('id, name, course_id').order('name');

    // --- Fetch Preview Data ---
    let query = supabaseAdmin
        .from('payments')
        .select(`
            id,
            amount,
            status,
            payment_date,
            transaction_id,
            applications(
                id,
                student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
                courses(name, code, colleges(name)),
                branches(name),
                account_admissions(admission_number)
            )
        `)
        .eq('payment_type', 'tuition_fee')
        .order('payment_date', { ascending: false })
        .limit(10); // Preview limit

    if (statusFilter) query = query.eq('status', statusFilter);
    if (startDate) query = query.gte('payment_date', startDate);
    if (endDate) query = query.lte('payment_date', endDate + 'T23:59:59');

    // For course/branch filtering, we have to rely on the join logic or pre-filter IDs.
    // Supabase JS doesn't support deep filtering on joins easily (e.g. applications.course_id = X) 
    // unless using !inner join, which filters the parent rows.
    
    if (courseFilter) {
        query = supabaseAdmin
            .from('payments')
            .select(`
                id, amount, status, payment_date, transaction_id,
                applications!inner(
                    id, status, course_id, branch_id,
                    student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
                    courses(name, code, colleges(name)),
                    branches(name),
                    account_admissions(admission_number)
                )
            `)
            .eq('payment_type', 'tuition_fee')
            .eq('applications.course_id', courseFilter)
            .order('payment_date', { ascending: false })
            .limit(10);

        if (statusFilter) query = query.eq('status', statusFilter);
        if (startDate) query = query.gte('payment_date', startDate);
        if (endDate) query = query.lte('payment_date', endDate + 'T23:59:59');
    }
    
    // Apply branch filter similarly if present
    if (branchFilter) {
         // If course filter wasn't applied, we need to reset query to use !inner
         if (!courseFilter) {
             query = supabaseAdmin
            .from('payments')
            .select(`
                id, amount, status, payment_date, transaction_id,
                applications!inner(
                    id, status, course_id, branch_id,
                    student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
                    courses(name, code, colleges(name)),
                    branches(name),
                    account_admissions(admission_number)
                )
            `)
             .eq('payment_type', 'tuition_fee')
             .order('payment_date', { ascending: false })
             .limit(10);
             if (statusFilter) query = query.eq('status', statusFilter);
             if (startDate) query = query.gte('payment_date', startDate);
             if (endDate) query = query.lte('payment_date', endDate + 'T23:59:59');
          }
          query = query.eq('applications.branch_id', branchFilter);
    }


    const { data: previewPayments, error: previewError } = await query;

    if (previewError) {
        console.error('Error fetching preview:', previewError.message);
    }

    // --- Fetch Saved Templates ---
    const { data: templates, error: templateError } = await supabaseAdmin
        .from('report_templates')
        .select('id, name, description, base_table, created_by, created_at, report_type, target_form_type_id')
        .neq('report_type', 'html_profile')
        .contains('allowed_roles', [userProfile?.role || ''])
        .order('created_at', { ascending: false });
        
    if (templateError) {
        console.error('Error fetching templates:', templateError);
    }

    return {
        options: {
            courses: allCourses || [],
            branches: allBranches || []
        },
        previewPayments: previewPayments || [],
        templates: templates || []
    };
};

export const actions: Actions = {
    saveTemplate: async ({ request, locals: { getSession } }) => {
        const session = await getSession();
        if (!session) return fail(401, { message: 'Unauthorized' });

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const columns = formData.get('columns') as string; // JSON string
        const filters = formData.get('filters') as string; // JSON string

        if (!name || !columns) {
            return fail(400, { message: 'Name and Columns are required' });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabaseAdmin.from('report_templates').insert({
            name,
            description,
            is_public: false, // Fee collectors keep templates private by default/design
            columns: JSON.parse(columns),
            filters: filters ? JSON.parse(filters) : {},
            created_by: session.user.id
        });

        if (error) {
            console.error('Save template error:', error);
            return fail(500, { message: 'Failed to save template' });
        }

        return { success: true };
    },
    deleteTemplate: async ({ request, locals: { getSession } }) => {
        const session = await getSession();
        if (!session) return fail(401, { message: 'Unauthorized' });
        
        const formData = await request.formData();
        const id = formData.get('id') as string;

        if (!id) return fail(400, { message: 'Template ID required' });

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabaseAdmin.from('report_templates').delete().eq('id', id).eq('created_by', session.user.id);

        if (error) {
            console.error('Delete template error:', error);
            return fail(500, { message: 'Failed to delete template' });
        }
        
        return { success: true };
    }
};
