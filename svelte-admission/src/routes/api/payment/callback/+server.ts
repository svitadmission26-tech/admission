import { redirect } from '@sveltejs/kit';
import { verifyPayment } from '$lib/server/payment';
import { createFeeReceipt } from '$lib/server/receipt';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    await handleCallback(url.searchParams, supabase);
    return new Response('Processed', { status: 200 }); // Should never reach here due to redirects
};

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
    let formData;
    try {
        formData = await request.formData();
    } catch {
        return new Response('Invalid Request', { status: 400 });
    }
    
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
        params.append(key, value.toString());
    }

    await handleCallback(params, supabase);
    return new Response('Processed', { status: 200 }); // Should never reach here due to redirects
};

async function handleCallback(params: URLSearchParams, supabase: any) {
    const providedTransactionId = params.get('transaction_id');
    const payuTxnId = params.get('txnid');
    const internalTransactionId = providedTransactionId || params.get('udf1');
    const status = params.get('status'); 

    if (!providedTransactionId && !payuTxnId && !internalTransactionId) {
        throw redirect(303, '/student/payments?error=Missing transaction reference');
    }

    const gatewayResponse = Object.fromEntries(params.entries());

    // Use Service Role for internal state updates to bypass RLS hurdles
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    try {
        // Resolve the transaction by internal ID or gateway txnid.
        let transactionQuery = supabaseAdmin.from('transactions').select('id, gateway_response');
        if (internalTransactionId) {
            transactionQuery = transactionQuery.eq('id', internalTransactionId);
        } else if (payuTxnId) {
            transactionQuery = transactionQuery.eq('gateway_transaction_id', payuTxnId);
        }

        const { data: initialTx, error: txError } = await transactionQuery.single();
        if (txError || !initialTx) {
            console.error('Transaction not found for callback:', { internalTransactionId, payuTxnId, txError });
            throw redirect(303, '/student/payments?error=Invalid transaction reference');
        }

        const initMeta = initialTx.gateway_response?.init_meta;
        const returnUrl = initMeta?.returnUrl;
        const redirectUrl = returnUrl || '/';
        const lookupTransactionId = initialTx.id;

        if (status === 'failure' || status === 'failed') {
            await supabaseAdmin
                .from('transactions')
                .update({ status: 'failed', gateway_response: gatewayResponse })
                .eq('id', lookupTransactionId);
            throw redirect(303, redirectUrl);
        }

        const verification = await verifyPayment(supabaseAdmin, lookupTransactionId, gatewayResponse);
        
        if (verification.success) {
            const { data: transaction } = await supabaseAdmin
                .from('transactions')
                .select('*, applications(course_id, cycle_id, form_type, admission_type, courses(college_id), admission_cycles(academic_year_id))')
                .eq('id', lookupTransactionId)
                .single();

            if (transaction) {
                // Determine payment type from metadata
                const paymentType = initMeta?.paymentType || 'tuition_fee';
                
                // Resolve breakdowns from meta
                const paymentBreakdown = initMeta.paymentBreakdown || [];
                const feeComponentsBreakdown = initMeta.feeComponentsBreakdown || [];

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

                const receipt = await createFeeReceipt(supabaseAdmin, {
                    transactionId: transaction.id,
                    studentId: transaction.student_id,
                    applicationId: transaction.application_id,
                    amount: transaction.amount,
                    details: gatewayResponse,
                    generatedBy: transaction.student_id, 
                    paymentType: paymentType,
                    formType: formType, // Added formType
                    academicYearId: academicYearId,
                    yearName: yearName,
                    collegeId: (transaction.applications as any)?.courses?.college_id,
                    courseId: transaction.applications?.course_id,
                    admissionType: admissionType, // Forward admissionType
                    paymentBreakdown,
                    feeComponentsBreakdown
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
                    payment_breakdown: paymentBreakdown,
                    fee_components_breakdown: feeComponentsBreakdown
                });

                // Update application status if this was an application fee
                if (paymentType === 'application_fee' && transaction.application_id) {
                    await supabaseAdmin
                        .from('applications')
                        .update({ application_fee_status: 'paid' })
                        .eq('id', transaction.application_id);
                }
            }
            
            throw redirect(303, redirectUrl);
        } else {
            throw redirect(303, redirectUrl);
        }
    } catch (e: any) {
        if (e.status === 303) throw e; 
        console.error('Callback processing error:', e);
        throw redirect(303, '/student/payments?error=Payment processing error');
    }
}
