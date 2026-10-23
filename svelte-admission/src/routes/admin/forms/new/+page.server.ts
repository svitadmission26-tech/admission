import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { data: courses, error: coursesError } = await supabase.from('courses').select('id, name');
    const { data: admissionCycles, error: cyclesError } = await supabase.from('admission_cycles').select('id, name, academic_years(name)');
    const { data: formTypes, error: formTypesError } = await supabase.from('form_types').select('name, is_prov, application_fee_required').eq('is_active', true).order('name');

    if (coursesError) {
        console.error('Error fetching courses:', coursesError.message);
    }
    if (cyclesError) {
        console.error('Error fetching admission cycles:', cyclesError.message);
    }
    if (formTypesError) {
        console.error('Error fetching form types:', formTypesError.message);
    }

    // Fetch Student Profile Fields for FormBuilder (Bypass RLS)
    const { data: studentProfileFields } = await supabaseAdmin
        .from('student_profile_fields')
        .select('key, label, type, is_required, options')
        .order('created_at', { ascending: true });

    return {
        courses: courses || [],
        admissionCycles: admissionCycles || [],
        formTypes: formTypes || [],
        studentProfileFields: studentProfileFields || []
    };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;
        const form_fee = parseFloat(formData.get('form_fee') as string) || 0;
        const prov_fee = parseFloat(formData.get('prov_fee') as string) || 0;
        const schema_json_str = formData.get('schema_json') as string;
        const is_enabled = formData.get('is_enabled') === 'on';

        // Auto-generate name: "Course Name - Cycle Name (Type)"
        const { data: course } = await supabase.from('courses').select('name').eq('id', course_id).single();
        const { data: cycle } = await supabase.from('admission_cycles').select('name').eq('id', cycle_id).single();
        
        const name = `${course?.name || 'Course'} - ${cycle?.name || 'Cycle'} (${form_type})`;

        let schema_json;
        try {
            schema_json = JSON.parse(schema_json_str);
        } catch (e) {
            return fail(400, { message: 'Invalid schema JSON', error: true });
        }

        const { error } = await supabase.from('admission_forms').insert({
            name,
            course_id,
            cycle_id,
            form_type,
            form_fee,
            prov_fee,
            schema_json,
            is_enabled
        });

        if (error) {
            console.error('Error creating admission form:', error.message);
            return fail(500, { success: false, message: error.message });
        }

        throw redirect(303, '/admin/forms');
    },

    checkExistingForm: async ({ request, locals: { supabase } }) => {
        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;

        const { data: existingForm, error } = await supabase
            .from('admission_forms')
            .select('id')
            .eq('course_id', course_id)
            .eq('cycle_id', cycle_id)
            .eq('form_type', form_type)
            .maybeSingle();

        if (error) {
            console.error('Error checking for existing form:', error.message);
            return fail(500, { message: 'Error checking for existing form.' });
        }

        if (existingForm) {
            return { exists: true, formId: existingForm.id };
        } else {
            return { exists: false };
        }
    }
};
