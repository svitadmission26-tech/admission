import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod';

const formTypeSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    description: z.string().optional(),
    is_active: z.coerce.boolean(),
    requires_merit_calculation: z.coerce.boolean(),
    allow_partial_payment: z.coerce.boolean(),
    is_government_quota: z.coerce.boolean(),
    application_fee_required: z.coerce.boolean(),
    auto_approve_on_verification: z.coerce.boolean(),
    direct_admission_on_submit: z.coerce.boolean(),
    is_prov: z.coerce.boolean(),
});

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/dashboard');
    }

    const { data: formTypes, error } = await supabase
        .from('form_types')
        .select('id, name, description, is_active, is_prov, application_fee_required, direct_admission_on_submit')
        .order('name');

    if (error) {
        console.error('Error fetching form types:', error);
        return { formTypes: [] };
    }

    return { formTypes };
};

export const actions: Actions = {
    create: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const data = Object.fromEntries(formData);
        
        // Handle checkboxes: if not present, they are false
        const payload = {
            ...data,
            is_active: formData.has('is_active'),
            requires_merit_calculation: formData.has('requires_merit_calculation'),
            allow_partial_payment: formData.has('allow_partial_payment'),
            is_government_quota: formData.has('is_government_quota'),
            application_fee_required: formData.has('application_fee_required'),
            auto_approve_on_verification: formData.has('auto_approve_on_verification'),
            direct_admission_on_submit: formData.has('direct_admission_on_submit'),
            is_prov: formData.has('is_prov'),
        };

        const parsed = formTypeSchema.safeParse(payload);

        if (!parsed.success) {
            return fail(400, { 
                error: true, 
                message: parsed.error.errors.map(e => e.message).join(', ') 
            });
        }

        const { error } = await supabase
            .from('form_types')
            .insert(parsed.data);

        if (error) {
            console.error('Error creating form type:', error);
            return fail(500, { error: true, message: 'Failed to create form type.' });
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

        const data = Object.fromEntries(formData);
        
        // Handle checkboxes
        const payload = {
            ...data,
            is_active: formData.has('is_active'),
            requires_merit_calculation: formData.has('requires_merit_calculation'),
            allow_partial_payment: formData.has('allow_partial_payment'),
            is_government_quota: formData.has('is_government_quota'),
            application_fee_required: formData.has('application_fee_required'),
            auto_approve_on_verification: formData.has('auto_approve_on_verification'),
            direct_admission_on_submit: formData.has('direct_admission_on_submit'),
            is_prov: formData.has('is_prov'),
        };

        const parsed = formTypeSchema.safeParse(payload);

        if (!parsed.success) {
            return fail(400, { 
                error: true, 
                message: parsed.error.errors.map(e => e.message).join(', ') 
            });
        }

        const { error } = await supabase
            .from('form_types')
            .update(parsed.data)
            .eq('id', id);

        if (error) {
            console.error('Error updating form type:', error);
            return fail(500, { error: true, message: 'Failed to update form type.' });
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
            .from('form_types')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting form type:', error);
            // Likely foreign key constraint violation
            return fail(500, { error: true, message: 'Failed to delete form type. It may be in use.' });
        }

        return { success: true };
    }
};
