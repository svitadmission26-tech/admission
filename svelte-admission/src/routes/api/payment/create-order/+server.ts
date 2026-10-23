import { json } from '@sveltejs/kit';
import { createPaymentOrder } from '$lib/server/payment';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, url, locals: { getSession } }) => {
    const session = await getSession();
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, currency = 'INR', description, studentId, applicationId, metadata } = body;

    if (!amount || !studentId) {
        return json({ error: 'Missing required parameters: amount, studentId' }, { status: 400 });
    }

    // Use Service Role to bypass RLS for transaction creation
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    try {
        const origin = url.origin;
        const orderResponse = await createPaymentOrder(supabaseAdmin, {
            amount,
            currency,
            description,
            studentId,
            applicationId,
            metadata,
            baseUrl: origin
        });

        return json(orderResponse);
    } catch (e: any) {
        console.error('Create Order Error:', e);
        return json({ error: e.message || 'Failed to create order' }, { status: 500 });
    }
};
