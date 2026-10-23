import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('--- Starting Document Diagnosis ---');

    // 1. Check Applications Count
    const { count: appCount, error: appError } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true });
    
    if (appError) console.error('Error checking applications:', appError);
    else console.log(`Total Applications: ${appCount}`);

    // 2. Check Documents Count
    const { count: docCount, error: docError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true });

    if (docError) console.error('Error checking documents:', docError);
    else console.log(`Total Documents: ${docCount}`);

    // 3. Check for orphaned documents (no application_id)
    const { count: orphanedCount, error: orphanError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .is('application_id', null);
        
    if (orphanError) console.error('Error checking orphaned documents:', orphanError);
    else console.log(`Documents without application_id: ${orphanedCount}`);

    // 4. Sample Applications with Documents
    // Get 5 recent applications
    const { data: recentApps, error: recentError } = await supabase
        .from('applications')
        .select('id, status, users(email)')
        .order('updated_at', { ascending: false })
        .limit(5);

    if (recentError) {
        console.error('Error fetching recent apps:', recentError);
    } else {
        console.log('\n--- Recent 5 Applications Check ---');
        for (const app of recentApps) {
            const { data: docs, error: dError } = await supabase
                .from('documents')
                .select('id, file_name, status, file_path')
                .eq('application_id', app.id);
            
            if (dError) {
                console.error(`Error fetching docs for app ${app.id}:`, dError);
            } else {
                console.log(`App ID: ${app.id} (${app.users?.email}) - Status: ${app.status}`);
                console.log(`   Document Count: ${docs.length}`);
                if (docs.length > 0) {
                    docs.forEach(d => console.log(`   - [${d.status}] ${d.file_name} (Path: ${d.file_path})`));
                }
            }
        }
    }

    // 5. Check RLS Policies on Documents Table (via rpc if available, or just infer from behavior)
    // We can't check policies via client easily, but we can verify if 'documents' table exists and has columns
    // by doing a limit 1 select.
    const { data: schemaCheck, error: schemaError } = await supabase
        .from('documents')
        .select('id, application_id, user_id, status, signed_url') // checking if signed_url column exists in DB? No, it's virtual.
        .limit(1);
    
    if (schemaError) {
        if (schemaError.code === '42703') { // Undefined column
             console.log('\n--- Schema Warning ---');
             console.log('Error checking columns:', schemaError.message);
             console.log('NOTE: "signed_url" should NOT be in the database schema. It is added at runtime.');
        } else {
             console.error('Error checking schema:', schemaError);
        }
    }

    console.log('\n--- Diagnosis Complete ---');
}

diagnose();
