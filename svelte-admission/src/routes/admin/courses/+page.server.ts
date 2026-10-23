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

    const { data: courses, error: coursesError } = await supabase.from('courses').select('*, colleges(name)');
    const { data: colleges, error: collegesError } = await supabase.from('colleges').select('id, name');

    if (coursesError) {
        console.error('Error fetching courses:', coursesError.message);
        return { courses: [], colleges: [] };
    }
    if (collegesError) {
        console.error('Error fetching colleges for dropdown:', collegesError.message);
        return { courses: courses || [], colleges: [] };
    }

    return { courses: courses || [], colleges: colleges || [] };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const college_id = formData.get('college_id') as string;
        const name = formData.get('name') as string;
        const code = formData.get('code') as string;
        const collegeid_code = formData.get('collegeid_code') as string;
        const duration_years = parseInt(formData.get('duration_years') as string);
        const intake_capacity = parseInt(formData.get('intake_capacity') as string) || 0;

        const { error } = await supabase.from('courses').insert({ college_id, name, code, collegeid_code, duration_years, intake_capacity });

        if (error) {
            console.error('Error creating course:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Course created successfully!' };
    },

    update: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const college_id = formData.get('college_id') as string;
        const name = formData.get('name') as string;
        const code = formData.get('code') as string;
        const collegeid_code = formData.get('collegeid_code') as string;
        const duration_years = parseInt(formData.get('duration_years') as string);
        const intake_capacity = parseInt(formData.get('intake_capacity') as string) || 0;

        const { error } = await supabase.from('courses').update({ college_id, name, code, collegeid_code, duration_years, intake_capacity }).eq('id', id);

        if (error) {
            console.error('Error updating course:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Course updated successfully!' };
    },

    delete: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('courses').delete().eq('id', id);

        if (error) {
            console.error('Error deleting course:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Course deleted successfully!' };
    }
};