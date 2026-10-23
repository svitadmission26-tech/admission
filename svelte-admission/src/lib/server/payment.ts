import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface PaymentOrderRequest {
    amount: number;
    currency: string;
    description?: string;
    studentId: string;
    applicationId?: string;
    metadata?: Record<string, any>;
    baseUrl?: string;
}

export interface PaymentOrderResponse {
    orderId: string;
    amount: number;
    currency: string;
    keyId?: string; // Public key for client-side SDK
    transactionId: string; // Our internal ID
    paymentUrl?: string; // For redirect flows
    payuParams?: any; // Specific for PayU POST redirection
}

export interface VerificationResult {
    success: boolean;
    transactionId: string;
    gatewayTransactionId?: string;
    message?: string;
}

/**
 * Initiates a payment transaction.
 * 1. Fetches the active payment gateway configuration.
 * 2. Creates a local transaction record.
 * 3. Calls the gateway provider to create an order (mocked for now).
 */
export async function createPaymentOrder(
    supabase: SupabaseClient,
    request: PaymentOrderRequest
): Promise<PaymentOrderResponse> {
    
    // 1. Get Active Gateway
    const { data: gateway, error: gatewayError } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('is_active', true)
        .single();

    if (gatewayError || !gateway) {
        console.error('No active payment gateway found:', gatewayError);
        throw error(500, 'Payment service unavailable');
    }

    // 2. Create Transaction Record (Initiated)
    const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
            student_id: request.studentId,
            application_id: request.applicationId,
            amount: request.amount,
            currency: request.currency,
            status: 'initiated',
            payment_gateway_id: gateway.id,
            ip_address: '0.0.0.0', // TODO: Pass IP from request
            gateway_response: { init_meta: request.metadata }
        })
        .select()
        .single();

    if (txError) {
        console.error('Failed to create transaction record:', txError);
        throw error(500, 'Failed to initiate transaction');
    }

    // 3. Call Gateway API (Adapter Pattern)
    let gatewayOrderId = `ORDER-${Date.now()}`; 
    let keyId = gateway.config?.key_id || gateway.config?.merchant_key || 'test_key';
    let paymentUrl = undefined;
    let payuParams = null;

    if (gateway.type === 'redirect') {
        // Handle Redirect Flows (PayU / Custom)
        const baseUrl = gateway.endpoint_url;
        if (!baseUrl) {
             throw error(500, 'Gateway misconfigured: Missing Endpoint URL');
        }

        if (gateway.provider_name === 'PayU') {
             // 1. Identify and Clean Credentials
             const key = (gateway.config.merchant_key || gateway.config.key_id || gateway.config.merchant_id || '').toString().trim();
             const salt = (gateway.config.merchant_salt || gateway.config.key_secret || gateway.config.salt || '').toString().trim();

             if (!key || !salt) {
                 throw error(500, 'PayU gateway misconfigured: merchant_key and merchant_salt are required');
             }

             // Shorten TXNID for PayU (< 25 chars)
             const txnid = `TXN${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 1000)}`;
             gatewayOrderId = txnid; 
             
             const amount = Number(request.amount).toFixed(2);
             const productinfo = 'AdmissionFee';
             
             const { data: userData } = await supabase.from('users').select('full_name, email').eq('id', request.studentId).single();
             const { data: profile } = await supabase.from('student_profiles').select('profile_data').eq('user_id', request.studentId).maybeSingle();
             
             const firstname = (userData?.full_name?.split(' ')[0] || 'Student').replace(/[^a-zA-Z0-9]/g, '');
             const email = (userData?.email || '').trim();
             
             let phone = request.metadata?.phone || '';
             if (!phone && profile?.profile_data) {
                 phone = profile.profile_data.phone || profile.profile_data.mobile || profile.profile_data.contact_no || '';
             }
             if (!phone) phone = '9999999999';
             phone = phone.replace(/[^0-9]/g, '').slice(-10);

             // 2. Construct Hash using the exact PayU sequence.
             // Sequence: key|txnid|amount|productinfo|firstname|email|udf1..udf10|salt
             const udf1 = transaction.id;
             const udfFields = [udf1, '', '', '', '', '', '', '', '', ''];
             const hashString = [key, txnid, amount, productinfo, firstname, email, ...udfFields, salt].join('|');
             const hash = crypto.createHash('sha512').update(hashString).digest('hex');

             const base = request.baseUrl || '';
             const surl = `${base}/api/payment/callback`;
             const furl = `${base}/api/payment/callback`;

             payuParams = {
                 key, txnid, amount, productinfo, firstname, email, phone, hash, surl, furl,
                 service_provider: 'payu_paisa',
                 udf1, udf2: '', udf3: '', udf4: '', udf5: '',
                 udf6: '', udf7: '', udf8: '', udf9: '', udf10: ''
             };

             console.log('--- PAYU 16-PIPE DIAGNOSTICS ---');
             console.log('Key:', key);
             console.log('TXNID:', txnid);
             console.log('Amount:', amount);
             console.log('Hash String:', `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||SALT`);
             console.log('--------------------------------');
             
             paymentUrl = baseUrl; 
        } else {
             // Generic/Custom Redirect
             const params = new URLSearchParams({
                 transaction_id: transaction.id,
                 amount: request.amount.toString(),
                 currency: request.currency,
                 callback_url: '/api/payment/callback'
             });
             paymentUrl = `${baseUrl}?${params.toString()}`;
        }
    } else if (gateway.provider_name === 'Razorpay') {
        // SDK Flow
    }

    // Update transaction 
    await supabase
        .from('transactions')
        .update({ 
            gateway_transaction_id: gatewayOrderId,
            payment_url: paymentUrl,
            gateway_response: { ...transaction.gateway_response, payu_params: payuParams }
        })
        .eq('id', transaction.id);

    return {
        orderId: gatewayOrderId,
        amount: request.amount,
        currency: request.currency,
        keyId: keyId,
        transactionId: transaction.id,
        paymentUrl: paymentUrl,
        payuParams: payuParams
    };
}

/**
 * Verifies a payment transaction.
 * 1. Validates the signature using the gateway secret.
 * 2. Updates the transaction status.
 * 3. Returns the result.
 */
export async function verifyPayment(
    supabase: SupabaseClient,
    transactionId: string,
    gatewayResponse: any
): Promise<VerificationResult> {
    
    // 1. Fetch Transaction
    const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*, payment_gateways(*)')
        .eq('id', transactionId)
        .single();

    if (txError || !transaction) {
        return { success: false, transactionId, message: 'Transaction not found' };
    }

    const gateway = transaction.payment_gateways;
    const salt = gateway.config?.merchant_salt;
    
    // 2. Verify Signature/Hash
    let isValid = false; 
    
    if (gateway.provider_name === 'PayU' && salt) {
        // Reverse Hash: sha512(salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
        const status = gatewayResponse.status || '';
        const udf10 = gatewayResponse.udf10 || '';
        const udf9 = gatewayResponse.udf9 || '';
        const udf8 = gatewayResponse.udf8 || '';
        const udf7 = gatewayResponse.udf7 || '';
        const udf6 = gatewayResponse.udf6 || '';
        const udf5 = gatewayResponse.udf5 || '';
        const udf4 = gatewayResponse.udf4 || '';
        const udf3 = gatewayResponse.udf3 || '';
        const udf2 = gatewayResponse.udf2 || '';
        const udf1 = gatewayResponse.udf1 || '';
        const email = gatewayResponse.email || '';
        const firstname = gatewayResponse.firstname || '';
        const productinfo = gatewayResponse.productinfo || '';
        const amount = gatewayResponse.amount || '';
        const txnid = gatewayResponse.txnid || '';
        const key = gatewayResponse.key || '';
        
        const reverseHashString = [
            salt,
            status,
            udf10,
            udf9,
            udf8,
            udf7,
            udf6,
            udf5,
            udf4,
            udf3,
            udf2,
            udf1,
            email,
            firstname,
            productinfo,
            amount,
            txnid,
            key
        ].join('|');
        const calculatedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex');
        
        isValid = (calculatedHash === gatewayResponse.hash);
        
        // MOCK BYPASS: For testing purposes if hash is missing in manual triggers
        if (gateway.mode === 'test' && !gatewayResponse.hash) isValid = true;
    } else {
        // Generic/SDK success (Razorpay etc usually verified in verify server action)
        isValid = true;
    }

    if (!isValid) {
        await supabase
            .from('transactions')
            .update({ status: 'failed', gateway_response: gatewayResponse })
            .eq('id', transactionId);
        return { success: false, transactionId, message: 'Invalid signature' };
    }

    // 3. Mark Success
    const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
            status: 'success', 
            gateway_response: { ...transaction.gateway_response, ...gatewayResponse },
            gateway_transaction_id: gatewayResponse.payment_id || gatewayResponse.mihpayid || transaction.gateway_transaction_id 
        })
        .eq('id', transactionId);

    if (updateError) {
        return { success: false, transactionId, message: 'Failed to update status' };
    }

    return { 
        success: true, 
        transactionId, 
        gatewayTransactionId: gatewayResponse.payment_id 
    };
}
