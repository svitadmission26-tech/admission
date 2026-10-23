import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { data: branches, error: branchesError } = await supabase
        .from('branches')
        .select('*, courses(name, colleges(name))')
        .order('created_at', { ascending: false });

    const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select('id, name, colleges(name)')
        .order('name');

    if (branchesError || coursesError) {
        console.error('Error fetching data:', branchesError || coursesError);
        return { branches: [], courses: [] };
    }

    return { branches, courses };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const code = formData.get('code') as string;
        const collegeid_code = formData.get('collegeid_code') as string;
        const course_id = formData.get('course_id') as string;
        const intake_capacity = parseInt(formData.get('intake_capacity') as string) || 0;

        if (!name || !course_id) {
            return fail(400, { message: 'Name and Course are required' });
        }

        const { error } = await supabase.from('branches').insert({ name, code, collegeid_code, course_id, intake_capacity });

        if (error) {
            return fail(500, { message: error.message });
        }

        return { success: true, message: 'Branch created successfully' };
    },

    update: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const code = formData.get('code') as string;
        const collegeid_code = formData.get('collegeid_code') as string;
        const course_id = formData.get('course_id') as string;
        const intake_capacity = parseInt(formData.get('intake_capacity') as string) || 0;

        if (!id || !name || !course_id) {
            return fail(400, { message: 'ID, Name and Course are required' });
        }

        const { error } = await supabase.from('branches').update({ name, code, collegeid_code, course_id, intake_capacity }).eq('id', id);

        if (error) {
            return fail(500, { message: error.message });
        }

        return { success: true, message: 'Branch updated successfully' };
    },

    delete: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        if (!id) {
            return fail(400, { message: 'ID is required' });
        }

        const { error } = await supabase.from('branches').delete().eq('id', id);

        if (error) {
            return fail(500, { message: error.message });
        }

        return { success: true, message: 'Branch deleted successfully' };
    }
};