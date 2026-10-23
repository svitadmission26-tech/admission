import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function repairDocumentLinks() {
    console.log('--- Starting Document Link Repair ---');

    // 1. Fetch all applications with form_data
    const { data: applications, error: appError } = await supabase
        .from('applications')
        .select('id, form_data, student_id');

    if (appError) {
        console.error('Error fetching applications:', appError);
        return;
    }

    console.log(`Found ${applications.length} applications. Checking for missing documents...`);

    let fixedCount = 0;

    for (const app of applications) {
        if (!app.form_data) continue;

        // Iterate through form_data values to find file paths
        for (const [key, value] of Object.entries(app.form_data)) {
            if (typeof value === 'string') {
                // Heuristic: Check if string looks like a storage path
                // Pattern: {user_id}/{filename} or just a path containing extensions like .pdf, .jpg, .png
                // Using a simple check for known extensions or if it matches the upload pattern
                
                const isFile = value.match(/\.(pdf|jpg|jpeg|png|webp)$/i);
                
                if (isFile) {
                    // Check if this document exists in the 'documents' table
                    const { data: existingDoc, error: docError } = await supabase
                        .from('documents')
                        .select('id')
                        .eq('application_id', app.id)
                        .eq('file_path', value)
                        .maybeSingle();

                    if (!existingDoc) {
                        console.log(`[Fixing] App ${app.id}: Found file in form_data but missing in DB: ${value}`);
                        
                        // Insert the missing document record
                        // We guess the document_type from the key (e.g. "hsc_marksheet" -> "Hsc Marksheet")
                        const docType = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        const fileName = value.split('/').pop() || 'file';

                        const { error: insertError } = await supabase
                            .from('documents')
                            .insert({
                                application_id: app.id,
                                // user_id: app.student_id, // REMOVED: Violates check constraint (one association only)
                                file_path: value,
                                file_name: fileName,
                                document_type: docType,
                                status: 'pending'
                            });

                        if (insertError) {
                            console.error(`  Failed to insert document: ${insertError.message}`);
                        } else {
                            console.log(`  Successfully restored document record.`);
                            fixedCount++;
                        }
                    }
                }
            }
        }
    }

    console.log('--- Repair Complete ---');
    console.log(`Total documents restored: ${fixedCount}`);
}

repairDocumentLinks();
