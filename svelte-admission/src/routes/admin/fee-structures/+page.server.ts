import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login'); // Redirect non-admin users
    }

    const [
        { data: structures, error: feeStructuresError },
        { data: courses, error: coursesError },
        { data: academicYears, error: academicYearsError },
        { data: formTypes, error: formTypesError },
        { data: feeSchemes, error: feeSchemesError }
    ] = await Promise.all([
        supabase
            .from('fee_structures')
            .select(`
                id, course_id, academic_year_id, total_fee, installment_json, fee_components, form_type, fee_scheme_id, created_at,
                courses(name, code, colleges(name)),
                academic_years(name),
                fee_schemes(name)
            `)
            .order('created_at', { ascending: false }),
        supabase.from('courses').select('id, name'),
        supabase.from('academic_years').select('id, name'),
        supabase.from('form_types').select('name').eq('is_active', true).order('name'),
        supabase.from('fee_schemes').select('id, name').eq('is_active', true).order('name')
    ]);

    if (feeStructuresError) {
        console.error('Error fetching fee structures:', feeStructuresError.message);
        return { feeStructures: [], courses: [], academicYears: [], formTypes: [], feeSchemes: [] };
    }
    if (coursesError) {
        console.error('Error fetching courses for dropdown:', coursesError.message);
    }
    if (academicYearsError) {
        console.error('Error fetching academic years for dropdown:', academicYearsError.message);
    }
    if (formTypesError) {
        console.error('Error fetching form types:', formTypesError.message);
    }
    if (feeSchemesError) {
        console.error('Error fetching fee schemes:', feeSchemesError.message);
    }

    return {
        feeStructures: structures || [],
        courses: courses || [],
        academicYears: academicYears || [],
        formTypes: formTypes || [],
        feeSchemes: feeSchemes || []
    };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const academic_year_id = formData.get('academic_year_id') as string;
        const form_type = formData.get('form_type') as string;
        const fee_scheme_id = formData.get('fee_scheme_id') as string;
        const total_fee = parseFloat(formData.get('total_fee') as string);
        const installment_json_str = formData.get('installment_json') as string;
        const fee_components_str = formData.get('fee_components') as string;
        
        let installment_json;
        try {
            installment_json = JSON.parse(installment_json_str || '[]');
        } catch (e) {
            return { success: false, message: 'Invalid JSON for installment_json' };
        }

        let fee_components;
        try {
            fee_components = JSON.parse(fee_components_str || '[]');
        } catch (e) {
            return { success: false, message: 'Invalid JSON for fee_components' };
        }

        const { error } = await supabase.from('fee_structures').insert({
            course_id,
            academic_year_id,
            form_type,
            fee_scheme_id,
            total_fee,
            installment_json,
            fee_components
        });

        if (error) {
            console.error('Error creating fee structure:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Fee structure created successfully!' };
    },

    update: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const course_id = formData.get('course_id') as string;
        const academic_year_id = formData.get('academic_year_id') as string;
        const form_type = formData.get('form_type') as string;
        const fee_scheme_id = formData.get('fee_scheme_id') as string;
        const total_fee = parseFloat(formData.get('total_fee') as string);
        const installment_json_str = formData.get('installment_json') as string;
        const fee_components_str = formData.get('fee_components') as string;

        let installment_json;
        try {
            installment_json = JSON.parse(installment_json_str || '[]');
        } catch (e) {
            return { success: false, message: 'Invalid JSON for installment_json' };
        }

        let fee_components;
        try {
            fee_components = JSON.parse(fee_components_str || '[]');
        } catch (e) {
            return { success: false, message: 'Invalid JSON for fee_components' };
        }

        const { error } = await supabase.from('fee_structures').update({
            course_id,
            academic_year_id,
            form_type,
            fee_scheme_id,
            total_fee,
            installment_json,
            fee_components
        }).eq('id', id);

        if (error) {
            console.error('Error updating fee structure:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Fee structure updated successfully!' };
    },

    delete: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('fee_structures').delete().eq('id', id);

        if (error) {
            console.error('Error deleting fee structure:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Fee structure deleted successfully!' };
    },

    copy: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const source_id = formData.get('source_id') as string;
        const target_course_id = formData.get('target_course_id') as string;
        const target_academic_year_id = formData.get('target_academic_year_id') as string;
        const target_form_type = formData.get('target_form_type') as string;
        const target_fee_scheme_id = formData.get('target_fee_scheme_id') as string;

        if (!source_id || !target_course_id || !target_academic_year_id || !target_form_type || !target_fee_scheme_id) {
            return { success: false, message: 'Missing required fields for copy operation.' };
        }

        // 1. Fetch source details
        const { data: sourceStructure, error: sourceError } = await supabase
            .from('fee_structures')
            .select('total_fee, installment_json, fee_components')
            .eq('id', source_id)
            .single();

        if (sourceError || !sourceStructure) {
            return { success: false, message: 'Source fee structure not found.' };
        }

        // 2. Check if target already exists
        const { data: existingTarget, error: checkError } = await supabase
            .from('fee_structures')
            .select('id')
            .eq('course_id', target_course_id)
            .eq('academic_year_id', target_academic_year_id)
            .eq('form_type', target_form_type)
            .eq('fee_scheme_id', target_fee_scheme_id)
            .maybeSingle();

        if (existingTarget) {
            return { success: false, message: 'A fee structure already exists for the target combination.' };
        }

        // 3. Insert new record
        const { error: insertError } = await supabase.from('fee_structures').insert({
            course_id: target_course_id,
            academic_year_id: target_academic_year_id,
            form_type: target_form_type,
            fee_scheme_id: target_fee_scheme_id,
            total_fee: sourceStructure.total_fee,
            installment_json: sourceStructure.installment_json,
            fee_components: sourceStructure.fee_components
        });

        if (insertError) {
            console.error('Error copying fee structure:', insertError.message);
            return { success: false, message: insertError.message };
        }

        return { success: true, message: 'Fee structure copied successfully!' };
    }
};
