
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable() {
    console.log('Probing receipt_sequences table...');

    // Probe insertion
    const probeData = {
        payment_type: 'probe_test_' + Date.now(),
        current_sequence: 0,
        prefix: 'TEST-'
        // academic_year_id left out initially to see if it's required or missing
    };

    // Try inserting without academic_year_id first (to see if column exists/is nullable)
    // Actually, let's try selecting first to see if table exists
    const { error: selectError } = await supabase.from('receipt_sequences').select('id').limit(1);
    if (selectError && selectError.code === '42P01') {
        console.log('Result: Table does NOT exist.');
        return;
    } else if (selectError) {
        console.log('Result: Table exists but select failed:', selectError.message);
    } else {
        console.log('Result: Table exists.');
    }

    // Attempt to insert with all expected columns to verify schema match
    // We need a valid academic_year_id if the column exists and has FK constraint?
    // FK constraints might block insert if I send a fake ID.
    // I'll try sending `null` for academic_year_id (if nullable).
    
    const fullProbe = {
        payment_type: 'probe_check',
        academic_year_id: null,
        current_sequence: 0,
        prefix: 'TEST-'
    };

    const { data, error } = await supabase.from('receipt_sequences').insert(fullProbe).select();

    if (error) {
        console.log('Schema Mismatch/Error:', error.message);
        console.log('Code:', error.code);
        // If error is "column academic_year_id does not exist", we know.
    } else {
        console.log('Schema Match: Insert successful. Columns exist.');
        // Cleanup
        if (data && data[0]) {
            await supabase.from('receipt_sequences').delete().eq('id', data[0].id);
            console.log('Cleanup successful.');
        }
    }
}

checkTable();
