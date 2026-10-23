import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login'); // Redirect non-admin users
    }

    const { data: meritFormulas, error: formulasError } = await supabase
        .from('merit_formulas')
        .select('*, courses(name)');

    const { data: courses, error: coursesError } = await supabase.from('courses').select('id, name');
    const { data: formTypes, error: formTypesError } = await supabase.from('form_types').select('name').eq('is_active', true).order('name');

    const { data: admissionForms, error: formsError } = await supabase
        .from('admission_forms')
        .select('course_id, form_type, schema_json'); // Fetch form_type

    if (formulasError) {
        console.error('Error fetching merit formulas:', formulasError.message);
        return { meritFormulas: [], courses: [], admissionForms: [], formTypes: [] };
    }
    if (coursesError) {
        console.error('Error fetching courses for dropdown:', coursesError.message);
        return { meritFormulas: meritFormulas || [], courses: [], admissionForms: [], formTypes: [] };
    }
    if (formsError) {
        console.error('Error fetching admission forms for schema hint:', formsError.message);
        return { meritFormulas: meritFormulas || [], courses: courses || [], admissionForms: [], formTypes: [] };
    }
    if (formTypesError) {
        console.error('Error fetching form types:', formTypesError.message);
        return { meritFormulas: meritFormulas || [], courses: courses || [], admissionForms: admissionForms || [], formTypes: [] };
    }

    return {
        meritFormulas: meritFormulas || [],
        courses: courses || [],
        admissionForms: admissionForms || [],
        formTypes: formTypes || []
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
        const form_type = formData.get('form_type') as string;
        const mode = formData.get('mode') as string;
        
        let rules_json;

        if (mode === 'expression') {
            const expression_str = formData.get('expression_str') as string;
            if (!expression_str || expression_str.trim() === '') {
                return { success: false, message: 'Expression is required' };
            }
            rules_json = { mode: 'expression', expression: expression_str };
        } else {
             const rules_json_str = formData.get('rules_json_weighted') as string;
             try {
                rules_json = JSON.parse(rules_json_str);
            } catch (e) {
                return { success: false, message: 'Invalid JSON for rules_json' };
            }
        }

        const { error } = await supabase.from('merit_formulas').insert({
            course_id,
            form_type,
            rules_json
        });

        if (error) {
            console.error('Error creating merit formula:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Merit formula created successfully!' };
    },

    update: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const course_id = formData.get('course_id') as string;
        const form_type = formData.get('form_type') as string;
        const mode = formData.get('mode') as string;

        let rules_json;

        if (mode === 'expression') {
            const expression_str = formData.get('expression_str') as string;
            if (!expression_str || expression_str.trim() === '') {
                return { success: false, message: 'Expression is required' };
            }
            rules_json = { mode: 'expression', expression: expression_str };
        } else {
             const rules_json_str = formData.get('rules_json_weighted') as string;
             try {
                rules_json = JSON.parse(rules_json_str);
            } catch (e) {
                return { success: false, message: 'Invalid JSON for rules_json' };
            }
        }

        const { error } = await supabase.from('merit_formulas').update({
            course_id,
            form_type,
            rules_json
        }).eq('id', id);

        if (error) {
            console.error('Error updating merit formula:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Merit formula updated successfully!' };
    },

    delete: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('merit_formulas').delete().eq('id', id);

        if (error) {
            console.error('Error deleting merit formula:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Merit formula deleted successfully!' };
    }
};