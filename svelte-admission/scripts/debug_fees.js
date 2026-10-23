import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugFees() {
    console.log('--- Debugging Fee Structures ---');

    // 1. Dump all fee structures (lightweight)
    const { data: structures, error: fsError } = await supabase
        .from('fee_structures')
        .select('id, course_id, academic_year_id, form_type, fee_components');
    
    if (fsError) {
        console.error('Error fetching fee_structures:', fsError);
    } else {
        console.log(`Found ${structures.length} fee structures.`);
        structures.forEach(fs => {
            console.log(`- ID: ${fs.id}, Course: ${fs.course_id}, Year: ${fs.academic_year_id}, Type: ${fs.form_type}, Components: ${JSON.stringify(fs.fee_components)?.slice(0, 50)}...`);
        });
    }

    // 2. Dump Payment/App Details
    // We don't have the payment ID from the user context here easily unless provided.
    // So we'll list the latest payment.
    const { data: payment, error: pError } = await supabase
        .from('payments')
        .select(
            `
            id, amount, payment_type, fee_components_breakdown,
            applications (
                id, course_id, cycle_id, form_type,
                admission_cycles (academic_year_id)
            )
        `
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (pError) {
        console.error('Error fetching latest payment:', pError);
    } else if (payment) {
        console.log('\n--- Latest Payment ---');
        console.log('Payment ID:', payment.id);
        console.log('Amount:', payment.amount);
        console.log('Breakdown Snapshot:', payment.fee_components_breakdown ? 'Present' : 'NULL');
        
        const app = payment.applications;
        if (app) {
            console.log('App Course ID:', app.course_id);
            console.log('App Cycle ID:', app.cycle_id);
            console.log('App Form Type:', app.form_type);
            console.log('App Academic Year ID:', app.admission_cycles?.academic_year_id);

            // Attempt match
            const match = structures.find(fs => 
                fs.course_id === app.course_id && 
                fs.academic_year_id === app.admission_cycles?.academic_year_id &&
                fs.form_type === app.form_type
            );
            
            if (match) {
                console.log('✅ MATCH FOUND in Fee Structures!');
                console.log('Matched Components:', JSON.stringify(match.fee_components, null, 2));
            } else {
                console.log('❌ NO MATCH found in Fee Structures.');
                console.log('Expected:', {
                    course: app.course_id,
                    year: app.admission_cycles?.academic_year_id,
                    type: app.form_type
                });
            }
        }
    }
}

debugFees();
