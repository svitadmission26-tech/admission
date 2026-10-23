import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile || userProfile.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    let query = supabase
        .from('busseva_fees')
        .select(`
            id, 
            receipt_number, 
            transaction_number, 
            total_amount, 
            payment_date,
            student:users!fk_busseva_fees_student (
                full_name,
                email,
                student_profiles (
                    enrollment_number
                )
            ),
            academic_years ( name ),
            collector:users!fk_busseva_fees_collector ( email )
        `)
        .order('payment_date', { ascending: false });

    // College restriction filtering
    if (userProfile.college_id) {
        query = query.eq('college_id', userProfile.college_id);
    }

    const { data: payments, error } = await query;
    if (error) {
        console.error('Error fetching bus seva payments:', error.message);
    }

    return { payments: payments || [] };
};
