import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    const { payment_id } = params;

    const { data: payment, error } = await supabase
        .from('payments')
        .select(`
            *,
            applications (
                id,
                student_id,
                student_user:users!applications_student_id_fkey (
                    id,
                    full_name,
                    email,
                    student_profiles (
                        enrollment_number
                    )
                ),
                courses (
                    name,
                    college_id,
                    colleges (
                        name,
                        code,
                        address,
                        logo_url,
                        universities (
                            name,
                            logo_url,
                            contact_email
                        )
                    )
                ),
                branches (
                    name
                ),
                admission_cycles (
                    academic_years (
                        name
                    )
                ),
                account_admissions (
                    admission_number
                )
            )
        `)
        .eq('id', payment_id)
        .single();

    if (error || !payment) {
        throw redirect(303, '/fee-collector/payments?error=Payment not found');
    }

    return {
        payment,
        userProfile
    };
};

export const actions: Actions = {
    updatePayment: async ({ request, params, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const { payment_id } = params;
        const formData = await request.formData();
        
        const payment_date = formData.get('payment_date') as string;
        const receipt_number = formData.get('receipt_number') as string;
        const amount = parseFloat(formData.get('amount') as string);
        const payment_breakdown_str = formData.get('payment_breakdown') as string;
        
        let payment_breakdown = [];
        try {
            payment_breakdown = JSON.parse(payment_breakdown_str || '[]');
        } catch (e) {
            return fail(400, { message: 'Invalid payment breakdown data.', error: true });
        }

        if (isNaN(amount) || amount <= 0 || !payment_date || !receipt_number) {
            return fail(400, { message: 'Invalid payment details.', error: true });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });

        // Update payment record
        const { error: updateError } = await supabaseAdmin
            .from('payments')
            .update({
                payment_date: new Date(payment_date).toISOString(),
                receipt_number,
                amount,
                payment_breakdown: payment_breakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                updated_at: new Date().toISOString()
            })
            .eq('id', payment_id);

        if (updateError) {
            return fail(500, { message: 'Failed to update payment: ' + updateError.message, error: true });
        }

        // Optionally update the linked transaction if it's a hybrid/direct payment
        // We need to find the transaction first
        const { data: currentPayment } = await supabaseAdmin
            .from('payments')
            .select('transaction_id')
            .eq('id', payment_id)
            .single();

        if (currentPayment?.transaction_id && currentPayment.transaction_id.startsWith('HYBRID-')) {
            await supabaseAdmin
                .from('transactions')
                .update({
                    amount,
                    status: 'success' // Ensure it's success if we're editing a completed payment
                })
                .eq('gateway_transaction_id', currentPayment.transaction_id);
        }

        return { success: true, message: 'Payment updated successfully!' };
    },

    updateStudentName: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const student_id = formData.get('student_id') as string;
        const full_name = formData.get('full_name') as string;

        if (!student_id || !full_name) {
            return fail(400, { message: 'Student ID and full name are required.', error: true });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });

        const { error } = await supabaseAdmin
            .from('users')
            .update({ full_name })
            .eq('id', student_id);

        if (error) {
            return fail(500, { message: 'Failed to update student name: ' + error.message, error: true });
        }

        return { success: true, message: 'Student name updated successfully!', action: 'updateStudentName' };
    }
};
