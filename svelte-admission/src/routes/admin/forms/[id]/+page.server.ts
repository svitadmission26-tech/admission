import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const formFieldSchema = z.object({
    key: z.string().min(1, 'Key is required').regex(/^[a-z0-9_]+$/, 'Key must be lowercase with underscores only'),
    label: z.string().min(1, 'Label is required'),
    type: z.enum(['text', 'number', 'date', 'select', 'textarea', 'email', 'checkbox', 'file']),
    required: z.coerce.boolean(),
    placeholder: z.string().optional(),
    options: z.string().optional(), // Comma-separated for select
    dataSource: z.string().optional(), // JSON string for advanced select
    col: z.number().min(1).max(12).optional(),
    sectionId: z.string().optional(),
    is_merit: z.coerce.boolean().optional(),
    max_score: z.number().optional(),
    enableBranchSelection: z.coerce.boolean().optional(),
    profileFieldKey: z.string().optional() // New: Link to a student profile field
});

export const load: PageServerLoad = async ({ params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { id } = params;

    // Fetch form details
    const { data: form, error: formError } = await supabase
        .from('admission_forms')
        .select(`
            id, course_id, cycle_id, form_type, is_enabled, schema_json, form_fee, prov_fee,
            courses(name, colleges(name)),
            admission_cycles(name)
        `)
        .eq('id', params.id)
        .single();

    if (formError) {
        console.error('Error fetching form:', formError.message);
        throw redirect(303, '/admin/forms');
    }

    // Fetch dropdown options
    const { data: formTypes } = await supabase.from('form_types').select('name, is_prov, application_fee_required').eq('is_active', true).order('name');
    
    // Fetch Student Profile Fields using Service Role to bypass RLS
    const { data: studentProfileFields, error: profileFieldsError } = await supabaseAdmin
        .from('student_profile_fields')
        .select('key, label, type, is_required, options')
        .order('created_at', { ascending: true });

    if (profileFieldsError) {
        console.error('Error fetching student profile fields:', profileFieldsError.message);
    }

    return {
        formTypes: formTypes || [],
        form: formResult,
        studentProfileFields: studentProfileFields && studentProfileFields.length > 0 
            ? studentProfileFields 
            : [{ key: 'mock_debug', label: 'DEBUG: Mock Field', type: 'text', is_required: false }] 
    };
};

export const actions: Actions = {
    updateFormDetails: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const form_type = formData.get('form_type') as string;
        const form_fee = parseFloat(formData.get('form_fee') as string);
        const prov_fee = parseFloat(formData.get('prov_fee') as string) || 0;
        const is_enabled = formData.has('is_enabled');

        const { error } = await supabase
            .from('admission_forms')
            .update({ name, description, form_type, form_fee, prov_fee, is_enabled })
            .eq('id', id);

        if (error) {
            return fail(500, { message: 'Failed to update form details.', error: true });
        }

        return { success: true, message: 'Form details updated!' };
    },

    updateSchema: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const schema_json_str = formData.get('schema_json') as string;

        let schema_json;
        try {
            schema_json = JSON.parse(schema_json_str);
        } catch (e) {
            return fail(400, { message: 'Invalid schema JSON', error: true });
        }

        const { error } = await supabase
            .from('admission_forms')
            .update({ schema_json })
            .eq('id', id);

        if (error) {
            return fail(500, { message: 'Failed to update schema.', error: true });
        }

        return { success: true, message: 'Form schema updated successfully!' };
    }
};
