import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    console.log('Admin Route Load: Checking authenticated user...');
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        console.warn('Admin Route Load: No authenticated user found. Redirecting to login.');
        throw redirect(303, '/login');
    }

    console.log('Admin Route Load: Authenticated user found', authenticatedUser.id);
    console.log('Admin Route Load: User Role:', userProfile?.role);

    if (userProfile?.role !== 'admin') {
        console.warn('Admin Route Load: Role mismatch. Expected admin, got', userProfile?.role);
        throw redirect(303, '/login'); // Redirect non-admin users
    }

    const { data: universities, error } = await supabase.from('universities').select('id, name, footer_text, logo_url');

    if (error) {
        console.error('Error fetching universities:', error.message);
        return { universities: [] };
    }

    return { universities };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const code = formData.get('code') as string;
        const address = formData.get('address') as string;
        const logo_url = formData.get('logo_url') as string;
        const contact_email = formData.get('contact_email') as string;
        const contact_phone = formData.get('contact_phone') as string;
        const website = formData.get('website') as string;
        const footer_text = formData.get('footer_text') as string;

        const { error } = await supabase.from('universities').insert({ 
            name, 
            code, 
            address,
            logo_url,
            contact_email,
            contact_phone,
            website,
            footer_text
        });

        if (error) {
            console.error('Error creating university:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'University created successfully!' };
    },

    update: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const code = formData.get('code') as string;
        const address = formData.get('address') as string;
        const logo_url = formData.get('logo_url') as string;
        const contact_email = formData.get('contact_email') as string;
        const contact_phone = formData.get('contact_phone') as string;
        const website = formData.get('website') as string;
        const footer_text = formData.get('footer_text') as string;

        const { error } = await supabase.from('universities').update({ 
            name, 
            code, 
            address,
            logo_url,
            contact_email,
            contact_phone,
            website,
            footer_text
        }).eq('id', id);

        if (error) {
            console.error('Error updating university:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'University updated successfully!' };
    },

    delete: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('universities').delete().eq('id', id);

        if (error) {
            console.error('Error deleting university:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'University deleted successfully!' };
    }
};
