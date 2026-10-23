
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkPaymentQuery() {
    console.log('--- Debugging Payment Query ---');

    // 1. Check all payments
    const { data: allPayments, error: allError } = await supabase.from('payments').select('*');
    if (allError) { console.error('Error fetching all payments:', allError); return; }
    console.log(`Total payments in DB: ${allPayments.length}`);
    allPayments.forEach(p => {
        if (p.receipt_number && (p.receipt_number.startsWith('REC-') || p.receipt_number.includes('17'))) {
             console.log(` - [${p.payment_type}] ID: ${p.id}, Receipt: ${p.receipt_number}`);
        }
    });

    // 2. Check application_fee payments
    const appFees = allPayments.filter(p => p.payment_type === 'application_fee');
    console.log(`Payments with payment_type='application_fee': ${appFees.length}`);
    appFees.forEach(p => console.log(` - ID: ${p.id}, Status: ${p.status}, Amount: ${p.amount}, Receipt: ${p.receipt_number}`));

    // 3. Check completed application_fee payments
    const completedAppFees = appFees.filter(p => p.status === 'completed');
    console.log(`Completed 'application_fee' payments: ${completedAppFees.length}`);
    const sum = completedAppFees.reduce((acc, curr) => acc + Number(curr.amount), 0);
    console.log(`Calculated Sum: ${sum}`);

    // 4. Test exact query used in server file
    console.log('\n--- Testing Server Query ---');
    const { data: serverQueryData, error: serverError } = await supabase
        .from('payments')
        .select('amount')
        .eq('payment_type', 'application_fee')
        .eq('status', 'completed');
    
    if (serverError) {
        console.error('Server query error:', serverError);
    } else {
        console.log(`Server query returned ${serverQueryData.length} rows.`);
        const serverSum = serverQueryData.reduce((sum, payment) => sum + payment.amount, 0);
        console.log(`Server Query Sum: ${serverSum}`);
    }
}

checkPaymentQuery();
