
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'receipt_sequences' });
    if (error) {
        // Fallback: try a query that will fail if column missing
        const { error: queryError } = await supabase.from('receipt_sequences').select('payment_type').limit(1);
        if (queryError) {
            console.log('payment_type column likely MISSING:', queryError.message);
        } else {
            console.log('payment_type column EXISTS.');
        }
    } else {
        console.log('Columns:', data);
    }
}

checkColumns();
