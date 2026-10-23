
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function backfillDocuments() {
    console.log('--- Starting Final Robust Document Backfill ---');
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: applications, error: appError } = await supabase
        .from('applications')
        .select('id, student_id, form_data');

    if (appError) return console.error('Error fetching applications:', appError.message);

    console.log(`Processing ${applications.length} applications...`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const app of applications) {
        if (!app.form_data) continue;

        for (const [key, value] of Object.entries(app.form_data)) {
            if (typeof value === 'string' && value.includes('/') && 
                (value.endsWith('.pdf') || value.endsWith('.jpg') || value.endsWith('.png') || value.endsWith('.jpeg'))) {
                
                let docType = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                if (docType.toLowerCase().endsWith(' document')) docType = docType.substring(0, docType.length - 9);

                // Check if already exists
                const { data: existingDoc } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('application_id', app.id)
                    .eq('file_path', value)
                    .maybeSingle();

                const docData = {
                    application_id: app.id,
                    user_id: app.student_id, // We will use both for maximum compatibility
                    file_path: value,
                    file_name: value.split('/').pop() || 'file',
                    document_type: docType,
                    status: 'pending',
                    uploaded_by: app.student_id
                };

                if (existingDoc) {
                    await supabase.from('documents').update(docData).eq('id', existingDoc.id);
                    updatedCount++;
                } else {
                    // Try to insert with BOTH. If it fails, try with ONLY application_id
                    const { error: insertErr } = await supabase.from('documents').insert(docData);
                    
                    if (insertErr && insertErr.message.includes('check constraint')) {
                        console.log(`Constraint hit for ${docType}, falling back to exclusive application_id association...`);
                        const fallbackData = { ...docData, user_id: null };
                        const { error: fallbackErr } = await supabase.from('documents').insert(fallbackData);
                        if (!fallbackErr) createdCount++;
                    } else if (!insertErr) {
                        createdCount++;
                    }
                }
            }
        }
    }

    console.log('--- Backfill Complete ---');
    console.log(`Created: ${createdCount}, Updated: ${updatedCount}`);
}

backfillDocuments();
