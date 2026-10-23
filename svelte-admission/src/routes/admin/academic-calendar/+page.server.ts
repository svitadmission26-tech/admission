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

    const { data: academicYears, error: academicYearsError } = await supabase.from('academic_years').select('*, admission_cycles(*)');

    if (academicYearsError) {
        console.error('Error fetching academic years:', academicYearsError.message);
        return { academicYears: [] };
    }

    return { academicYears: academicYears || [] };
};

export const actions: Actions = {
    // Actions for Academic Years
    createAcademicYear: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const short_code = formData.get('short_code') as string; // New field
        const start_date = formData.get('start_date') as string;
        const end_date = formData.get('end_date') as string;
        const is_active = formData.get('is_active') === 'on';

        const { error } = await supabase.from('academic_years').insert({ 
            name, 
            short_code, // Include short_code
            start_date, 
            end_date, 
            is_active 
        });

        if (error) {
            console.error('Error creating academic year:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Academic year created successfully!' };
    },

    updateAcademicYear: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const short_code = formData.get('short_code') as string; // New field
        const start_date = formData.get('start_date') as string;
        const end_date = formData.get('end_date') as string;
        const is_active = formData.get('is_active') === 'on';

        const { error } = await supabase.from('academic_years').update({ 
            name, 
            short_code, // Include short_code
            start_date, 
            end_date, 
            is_active 
        }).eq('id', id);

        if (error) {
            console.error('Error updating academic year:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Academic year updated successfully!' };
    },

    deleteAcademicYear: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('academic_years').delete().eq('id', id);

        if (error) {
            console.error('Error deleting academic year:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Academic year deleted successfully!' };
    },

    // Actions for Admission Cycles
    createAdmissionCycle: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const academic_year_id = formData.get('academic_year_id') as string;
        const name = formData.get('name') as string;
        const start_date = formData.get('start_date') as string;
        const end_date = formData.get('end_date') as string;
        const is_active = formData.get('is_active') === 'on';

        const { error } = await supabase.from('admission_cycles').insert({ academic_year_id, name, start_date, end_date, is_active });

        if (error) {
            console.error('Error creating admission cycle:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission cycle created successfully!' };
    },

    updateAdmissionCycle: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const academic_year_id = formData.get('academic_year_id') as string;
        const name = formData.get('name') as string;
        const start_date = formData.get('start_date') as string;
        const end_date = formData.get('end_date') as string;
        const is_active = formData.get('is_active') === 'on';

        const { error } = await supabase.from('admission_cycles').update({ academic_year_id, name, start_date, end_date, is_active }).eq('id', id);

        if (error) {
            console.error('Error updating admission cycle:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission cycle updated successfully!' };
    },

    deleteAdmissionCycle: async ({ request, locals: { supabase, getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('admission_cycles').delete().eq('id', id);

        if (error) {
            console.error('Error deleting admission cycle:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission cycle deleted successfully!' };
    }
};