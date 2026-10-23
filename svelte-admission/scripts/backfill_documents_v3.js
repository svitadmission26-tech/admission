
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function backfillDocuments() {
    console.log('--- Starting Exclusive Association Document Backfill ---');
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch all applications
    const { data: applications, error: appError } = await supabase
        .from('applications')
        .select('id, student_id, form_data, course_id, cycle_id, form_type');

    if (appError) {
        console.error('Error fetching applications:', appError.message);
        return;
    }

    console.log(`Found ${applications.length} applications to process.`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const app of applications) {
        if (!app.form_data) continue;

        const dataEntries = Object.entries(app.form_data);
        
        for (const [key, value] of dataEntries) {
            // Check if value is a storage path
            if (typeof value === 'string' && value.includes('/') && 
                (value.endsWith('.pdf') || value.endsWith('.jpg') || value.endsWith('.png') || value.endsWith('.jpeg'))) {
                
                console.log(`Found potential document: App=${app.id}, Key=${key}, Path=${value}`);

                // Infer document type
                let docType = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                if (docType.toLowerCase().endsWith(' document')) docType = docType.substring(0, docType.length - 9);

                // Check if document record already exists (EXCLUSIVELY by application_id)
                const { data: existingDoc } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('application_id', app.id)
                    .eq('file_path', value)
                    .maybeSingle();

                const docData = {
                    application_id: app.id,
                    user_id: null,       // MUST BE NULL because application_id is set
                    college_id: null,    // MUST BE NULL
                    university_id: null, // MUST BE NULL
                    file_path: value,
                    file_name: value.split('/').pop() || 'uploaded_file',
                    document_type: docType,
                    status: 'pending',
                    uploaded_by: app.student_id
                };

                if (existingDoc) {
                    const { error: updateErr } = await supabase
                        .from('documents')
                        .update(docData)
                        .eq('id', existingDoc.id);
                    if (!updateErr) {
                        updatedCount++;
                    } else {
                        console.error(` -> Update Error: ${updateErr.message}`);
                    }
                } else {
                    const { error: insertErr } = await supabase
                        .from('documents')
                        .insert(docData);
                    if (!insertErr) {
                        createdCount++;
                        console.log(` -> Created: ${docType}`);
                    } else {
                        console.error(` -> Insert Error: ${insertErr.message}`);
                    }
                }
            }
        }
    }

    console.log('--- Backfill Complete ---');
    console.log(`Created: ${createdCount}`);
    console.log(`Updated: ${updatedCount}`);
}

backfillDocuments();
