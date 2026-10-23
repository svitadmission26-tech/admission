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

    const { data: sequences, error: sequencesError } = await supabase
        .from('admission_sequences')
        .select('*, colleges(name), courses(name), academic_years(name)');

    const { data: colleges, error: collegesError } = await supabase.from('colleges').select('id, name');
    const { data: courses, error: coursesError } = await supabase.from('courses').select('id, name');
    const { data: academicYears, error: academicYearsError } = await supabase.from('academic_years').select('id, name');

    if (sequencesError) {
        console.error('Error fetching admission sequences:', sequencesError.message);
        return { sequences: [], colleges: [], courses: [], academicYears: [] };
    }
    if (collegesError) {
        console.error('Error fetching colleges for dropdown:', collegesError.message);
        return { sequences: sequences || [], colleges: [], courses: [], academicYears: [] };
    }
    if (coursesError) {
        console.error('Error fetching courses for dropdown:', coursesError.message);
        return { sequences: sequences || [], colleges: colleges || [], courses: [], academicYears: [] };
    }
    if (academicYearsError) {
        console.error('Error fetching academic years for dropdown:', academicYearsError.message);
        return { sequences: sequences || [], colleges: colleges || [], courses: courses || [], academicYears: [] };
    }

    return {
        sequences: sequences || [],
        colleges: colleges || [],
        courses: courses || [],
        academicYears: academicYears || []
    };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const college_id = formData.get('college_id') as string;
        const course_id = formData.get('course_id') as string;
        const academic_year_id = formData.get('academic_year_id') as string;
        const admission_type = (formData.get('admission_type') as string) || 'Regular';
        const prefix = formData.get('prefix') as string;
        const current_sequence = parseInt(formData.get('current_sequence') as string);

        const { error } = await supabase.from('admission_sequences').insert({
            college_id,
            course_id,
            academic_year_id,
            admission_type,
            prefix,
            current_sequence
        });

        if (error) {
            console.error('Error creating admission sequence:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission sequence created successfully!' };
    },

    update: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const admission_type = (formData.get('admission_type') as string) || 'Regular';
        const prefix = formData.get('prefix') as string;
        const current_sequence = parseInt(formData.get('current_sequence') as string);

        const { error } = await supabase.from('admission_sequences').update({
            admission_type,
            prefix,
            current_sequence
        }).eq('id', id);

        if (error) {
            console.error('Error updating admission sequence:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission sequence updated successfully!' };
    },

    reset: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('admission_sequences').update({
            current_sequence: 0
        }).eq('id', id);

        if (error) {
            console.error('Error resetting admission sequence:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission sequence reset to 0 successfully!' };
    },

    delete: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('admission_sequences').delete().eq('id', id);

        if (error) {
            console.error('Error deleting admission sequence:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission sequence deleted successfully!' };
    }
};