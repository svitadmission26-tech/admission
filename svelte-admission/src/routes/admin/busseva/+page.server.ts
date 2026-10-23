import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile || userProfile.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { data: years } = await supabase.from('academic_years').select('id, name');
    const { data: configs } = await supabase.from('busseva_qr_configs').select(`
        id, upi_id, merchant_name, qr_image_url, academic_year_id,
        academic_years ( name )
    `);

    return { years: years || [], configs: configs || [] };
};

export const actions: Actions = {
    saveConfig: async ({ request, locals: { supabase, userProfile } }) => {
        if (!userProfile || userProfile.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const yearId = formData.get('academic_year_id') as string;
        const upiId = formData.get('upi_id') as string;
        const merchantName = formData.get('merchant_name') as string;
        const qrImageUrl = formData.get('qr_image_url') as string;

        if (!yearId || !qrImageUrl) {
            return fail(400, { message: 'Academic Year and QR Image are required.' });
        }

        const { error } = await supabase
            .from('busseva_qr_configs')
            .upsert({
                academic_year_id: yearId,
                upi_id: upiId || null,
                merchant_name: merchantName || null,
                qr_image_url: qrImageUrl
            }, { onConflict: 'academic_year_id' });

        if (error) {
            console.error('Error saving QR configuration:', error.message);
            return fail(500, { message: 'Failed to save configuration.' });
        }
        return { success: true };
    }
};
