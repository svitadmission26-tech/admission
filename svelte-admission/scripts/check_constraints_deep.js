import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
    console.log("Inspecting constraints on receipt_sequences...");
    
    // We'll try to find the unique constraints by looking at the index definitions 
    // or by trying a dummy insert and seeing the error (not ideal but definitive).
    
    // Let's try to fetch from information_schema via a trick: 
    // Postgres allows selecting from information_schema.table_constraints
    // PostgREST might block it, but let's try.
    
    const { data: constraints, error: err } = await supabase
        .from('information_schema.table_constraints')
        .select('*')
        .eq('table_name', 'receipt_sequences');
    
    if (err) {
        console.log("Cannot access information_schema directly. Trying to infer from error messages.");
        
        // DUMMY INSERT to trigger constraint error
        // We use a known existing combination but change course_id
        const { data: sample } = await supabase.from('receipt_sequences').select('*').limit(1);
        if (sample && sample.length > 0) {
            const s = sample[0];
            const { error: insertErr } = await supabase
                .from('receipt_sequences')
                .insert({
                    college_id: s.college_id,
                    academic_year_id: s.academic_year_id,
                    course_id: '00000000-0000-0000-0000-000000000000', // Different course
                    payment_type: s.payment_type,
                    current_sequence: 0
                });
            
            if (insertErr) {
                console.log("Constraint Error detected:");
                console.log(insertErr.message);
                console.log(insertErr.details);
            } else {
                console.log("No constraint violation for different course_id. This means course_id IS part of the unique key.");
                // Clean up
                await supabase.from('receipt_sequences').delete().eq('course_id', '00000000-0000-0000-0000-000000000000');
            }
        }
    } else {
        console.table(constraints);
    }
}

checkConstraints();
