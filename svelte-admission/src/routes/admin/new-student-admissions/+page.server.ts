import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { data: admissions, error: admissionsError } = await supabase
        .from('new_student_admissions')
        .select('*, courses(name, code), branches(name, code), academic_years(name)')
        .order('created_at', { ascending: false });

    const { data: courses } = await supabase
        .from('courses')
        .select('id, name, code')
        .order('name');

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, code, course_id')
        .order('name');

    const { data: years } = await supabase
        .from('academic_years')
        .select('id, name')
        .order('name');

    if (admissionsError) {
        console.error('Error fetching new student admissions:', admissionsError);
    }

    return {
        admissions: admissions ?? [],
        courses: courses ?? [],
        branches: branches ?? [],
        years: years ?? []
    };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const admission_number = formData.get('admission_number') as string;
        const student_name = formData.get('student_name') as string;
        const email = formData.get('email') as string;
        const phone = formData.get('phone') as string;
        const course_id = formData.get('course_id') as string;
        const branch_id = formData.get('branch_id') as string;
        const academic_year_id = formData.get('academic_year_id') as string;
        const admission_type = formData.get('admission_type') as string;
        const admission_date = formData.get('admission_date') as string;
        const status = (formData.get('status') as string) || 'Draft';
        const remarks = formData.get('remarks') as string;

        if (!admission_number || !student_name) {
            return fail(400, { message: 'Admission number and student name are required' });
        }

        const { error } = await supabase.from('new_student_admissions').insert({
            admission_number,
            student_name,
            email: email || null,
            phone: phone || null,
            course_id: course_id || null,
            branch_id: branch_id || null,
            academic_year_id: academic_year_id || null,
            admission_type: admission_type || 'Regular',
            admission_date: admission_date || null,
            status,
            remarks: remarks || null,
            created_by: session.user.id
        });

        if (error) {
            return fail(500, { message: error.message });
        }

        return { success: true, message: 'New student admission created successfully' };
    },

    delete: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        if (!id) return fail(400, { message: 'ID is required' });

        const { error } = await supabase.from('new_student_admissions').delete().eq('id', id);
        if (error) return fail(500, { message: error.message });

        return { success: true, message: 'Deleted successfully' };
    }
};
