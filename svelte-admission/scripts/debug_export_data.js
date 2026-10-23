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

async function debugExport() {
    console.log('--- Debugging Export Query ---');

    const { data: payments, error } = await supabase
        .from('payments')
        .select(
            `
            id,
            applications (
                id,
                branches(name),
                account_admissions(admission_number)
            )
        `
        )
        .limit(5);

    if (error) {
        console.error('Query Error:', error);
        return;
    }

    if (!payments || payments.length === 0) {
        console.log('No payments found.');
        return;
    }

    payments.forEach((p, index) => {
        console.log(`\nPayment ${index + 1}:`);
        const app = p.applications;
        if (!app) {
            console.log('  Application: NULL');
            return;
        }
        
        console.log('  Branches Raw:', JSON.stringify(app.branches));
        const branchName = app.branches?.name || '-';
        console.log('  => Branch Accessor:', branchName);

        console.log('  Account Adm Raw:', JSON.stringify(app.account_admissions));
        
        let admNo = '';
        const aa = app.account_admissions;
        if (Array.isArray(aa)) {
            admNo = aa[0]?.admission_number || '';
            console.log('  => Admission (Array):', admNo);
        } else {
            admNo = aa?.admission_number || '';
            console.log('  => Admission (Object):', admNo);
        }
    });
}

debugExport();
