import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod';

const feeSchemeSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    is_active: z.boolean().default(true),
});

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/dashboard');
    }

    const { data: feeSchemes, error } = await supabase
        .from('fee_schemes')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching fee schemes:', error);
        return { feeSchemes: [] };
    }

    return { feeSchemes };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const payload = {
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            is_active: formData.has('is_active'),
        };

        const parsed = feeSchemeSchema.safeParse(payload);

        if (!parsed.success) {
            return fail(400, { 
                error: true, 
                message: parsed.error.errors.map(e => e.message).join(', ') 
            });
        }

        const { error } = await supabase
            .from('fee_schemes')
            .insert(parsed.data);

        if (error) {
            console.error('Error creating fee scheme:', error);
            if (error.code === '23505') {
                return fail(400, { error: true, message: 'A scheme with this name already exists.' });
            }
            return fail(500, { error: true, message: 'Failed to create fee scheme.' });
        }

        return { success: true };
    },

    update: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        if (!id) return fail(400, { error: true, message: 'ID is required' });

        const payload = {
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            is_active: formData.has('is_active'),
        };

        const parsed = feeSchemeSchema.safeParse(payload);

        if (!parsed.success) {
            return fail(400, { 
                error: true, 
                message: parsed.error.errors.map(e => e.message).join(', ') 
            });
        }

        const { error } = await supabase
            .from('fee_schemes')
            .update(parsed.data)
            .eq('id', id);

        if (error) {
            console.error('Error updating fee scheme:', error);
            return fail(500, { error: true, message: 'Failed to update fee scheme.' });
        }

        return { success: true };
    },

    delete: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        if (!id) return fail(400, { error: true, message: 'ID is required' });

        const { error } = await supabase
            .from('fee_schemes')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting fee scheme:', error);
            return fail(500, { error: true, message: 'Failed to delete fee scheme. It may be in use.' });
        }

        return { success: true };
    }
};
