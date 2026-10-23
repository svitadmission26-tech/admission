
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function fixRls() {
    console.log('Attempting to apply RLS fix...');
    
    // We cannot run SQL directly without connection string or RPC.
    // However, we can try to use the 'pg' library if we can GUESS the connection string 
    // or if we can use an RPC function if one was set up in previous migrations.
    
    // Check if 'exec_sql' RPC exists
    const checkRpc = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1' });
    if (!checkRpc.error) {
        console.log('RPC exec_sql available. Using it.');
        const sql = `
            DROP POLICY IF EXISTS "Payments: Adm Officer View" ON public.payments;
            CREATE POLICY "Payments: Adm Officer View" ON public.payments
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.users 
                    WHERE id = auth.uid() 
                    AND role = 'adm_officer'
                )
            );
        `;
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
        if (error) console.error('Error running SQL via RPC:', error);
        else console.log('RLS Policy Applied successfully via RPC.');
        return;
    }

    console.log('RPC exec_sql not available.');
    
    // If no RPC, and we don't have the DB string in .env, we are stuck unless we ask the user.
    // BUT! We can try to use the supabase management API if we had the access token, but we only have service role key.
    
    // WAIT! We can insert a row into a migration table if there is a trigger? No. 
    
    // Let's try to construct the connection string. 
    // Usually: postgres://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
    // We have the project ref: 'sddtytppntogrppkwqdb' from the URL.
    // We DO NOT have the password.
    
    // We can't connect directly.
    
    // HOWEVER, we have 'pg' installed. If the environment is a local dev (unlikely given the URL), we could guess.
    // But the URL is a real supabase.co URL.
    
    console.error('CRITICAL: Cannot apply SQL fix automatically because direct DB access is not configured (missing DATABASE_URL) and no SQL-executing RPC function exists.');
    console.log('\n\n=== ACTION REQUIRED ===');
    console.log('Please execute the following SQL in your Supabase Dashboard SQL Editor:');
    console.log(`
    -- Allow Admission Officers to view payments
    DROP POLICY IF EXISTS "Payments: Adm Officer View" ON public.payments;

    CREATE POLICY "Payments: Adm Officer View" ON public.payments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role = 'adm_officer'
        )
    );
    `);
    console.log('=======================\n');
}

fixRls();
