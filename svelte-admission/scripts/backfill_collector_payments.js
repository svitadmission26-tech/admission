import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backfill() {
    console.log('--- Starting Backfill for Collector Payments ---');

    // 1. Fetch all manual transactions (HYBRID-...) that are successful
    // We look for both gateway_transaction_id starting with HYBRID-
    const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .like('gateway_transaction_id', 'HYBRID-%')
        .eq('status', 'success');

    if (txError) {
        console.error('Error fetching transactions:', txError);
        return;
    }

    console.log(`Found ${txs.length} manual transactions. Checking for missing payment records...`);

    let syncCount = 0;
    for (const tx of txs) {
        // 2. Check if this transaction already exists in the payments table
        const { data: existingPayment, error: checkError } = await supabase
            .from('payments')
            .select('id')
            .eq('transaction_id', tx.gateway_transaction_id)
            .maybeSingle();

        if (!existingPayment) {
            console.log(`Syncing missing payment for Application ${tx.application_id} (Amount: ${tx.amount})...`);
            
            // 3. Extract details from gateway_response JSON
            const meta = tx.gateway_response || {};
            
            // 4. Insert into payments table
            const { error: insertError } = await supabase.from('payments').insert({
                application_id: tx.application_id,
                amount: tx.amount,
                payment_type: meta.payment_type || 'tuition_fee',
                transaction_id: tx.gateway_transaction_id,
                receipt_number: meta.receipt_number,
                status: 'completed',
                payment_date: meta.payment_date || tx.created_at
            });

            if (insertError) {
                console.error(`Failed to sync transaction ${tx.id}:`, insertError.message);
            } else {
                console.log(`Successfully synced.`);
                syncCount++;
            }
        }
    }

    console.log(`--- Backfill Complete. Synced ${syncCount} records. ---`);
}

backfill();
