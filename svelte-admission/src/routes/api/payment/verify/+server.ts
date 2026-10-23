import { json } from '@sveltejs/kit';
import { verifyPayment } from '$lib/server/payment';
import { createFeeReceipt } from '$lib/server/receipt';
import { ensureStudentEnrolled } from '$lib/server/enrollment';
import { approveApplicationLogic } from '$lib/server/application';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals: { getSession } }) => {
    const session = await getSession();
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transactionId, gatewayResponse } = body;

    if (!transactionId || !gatewayResponse) {
        return json({ error: 'Missing transactionId or gatewayResponse' }, { status: 400 });
    }

    // Use Service Role to ensure internal records can be created/updated (bypassing student RLS)
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    try {
        // 1. Verify Payment
        const verification = await verifyPayment(supabaseAdmin, transactionId, gatewayResponse);
        
        if (!verification.success) {
            return json({ success: false, message: verification.message }, { status: 400 });
        }

        // 2. Fetch Transaction Details (to get amount, studentId, etc.)
        const { data: transaction, error: txError } = await supabaseAdmin
            .from('transactions')
            .select('*, applications(course_id, cycle_id, form_type, admission_type, courses(college_id), admission_cycles(academic_year_id))')
            .eq('id', transactionId)
            .single();

        if (txError || !transaction) {
             console.error('Transaction fetch error after verification:', txError);
             // Even if this fails, payment was verified. But we can't generate receipt easily.
             return json({ success: true, message: 'Payment verified but receipt generation failed (Transaction not found)' });
        }

        // 3. Generate Receipt
        // We need to fetch academic year name if possible, or just pass ID.
        // For now, let's try to get year name if available, or skip it.
        let yearName = undefined;
        const academicYearId = (transaction.applications as any)?.admission_cycles?.academic_year_id;
        const formType = (transaction.applications as any)?.form_type;
        const admissionType = (transaction.applications as any)?.admission_type;

        if (academicYearId) {
            const { data: ay } = await supabaseAdmin
                .from('academic_years')
                .select('name')
                .eq('id', academicYearId)
                .single();
            yearName = ay?.name;
        }

        const initMeta = (transaction.gateway_response as any)?.init_meta || {};
        const paymentType = initMeta.paymentType || 'tuition_fee';

        const receipt = await createFeeReceipt(supabaseAdmin, {
            transactionId: transaction.id,
            studentId: transaction.student_id,
            applicationId: transaction.application_id,
            amount: transaction.amount,
            details: transaction.gateway_response, 
            generatedBy: session.user.id,
            paymentType: paymentType,
            formType: formType, // Added formType
            academicYearId: academicYearId,
            yearName: yearName,
            collegeId: (transaction.applications as any)?.courses?.college_id,
            courseId: (transaction.applications as any)?.course_id,
            admissionType: admissionType, // Forward admissionType
            paymentBreakdown: initMeta.paymentBreakdown || [],
            feeComponentsBreakdown: initMeta.feeComponentsBreakdown || []
        });

        // Record in `payments` table
        await supabaseAdmin.from('payments').insert({
            application_id: transaction.application_id,
            amount: transaction.amount,
            transaction_id: transaction.id,
            receipt_number: receipt.receipt_no,
            status: 'completed',
            payment_type: paymentType,
            payment_date: new Date().toISOString(),
            payment_breakdown: initMeta.paymentBreakdown || [],
            fee_components_breakdown: initMeta.feeComponentsBreakdown || []
        });

        if (paymentType === 'application_fee') {
            await supabaseAdmin
                .from('applications')
                .update({ application_fee_status: 'paid' })
                .eq('id', transaction.application_id);

            // Check for Direct Admission on Payment
            if (formType) {
                const { data: formTypeCheck } = await supabaseAdmin
                    .from('form_types')
                    .select('direct_admission_on_submit')
                    .eq('name', formType)
                    .single();

                if (formTypeCheck?.direct_admission_on_submit) {
                    console.log(`[Direct Admission] Triggering auto-approval for ${transaction.application_id} (Fee Paid Online)`);
                    const { data: appData } = await supabaseAdmin
                        .from('applications')
                        .select('admission_type')
                        .eq('id', transaction.application_id)
                        .single();

                    await approveApplicationLogic(
                        supabaseAdmin,
                        transaction.application_id,
                        session.user.id,
                        appData?.admission_type || 'Merit',
                        'Direct Admission on Submit (Fee Paid - Online)'
                    );
                }
            }
        }

        // Trigger auto-enrollment if this was a tuition payment
        if (transaction.application_id && paymentType === 'tuition_fee') {
            await ensureStudentEnrolled(supabaseAdmin, transaction.application_id);
        }

        return json({ success: true, receiptId: receipt.id, receiptNo: receipt.receipt_no });

    } catch (e: any) {
        console.error('Payment Verification Error:', e);
        return json({ error: e.message || 'Verification failed' }, { status: 500 });
    }
};
