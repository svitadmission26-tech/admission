
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function backfillDocuments() {
    console.log('--- Starting Document Backfill ---');
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

    // 2. Fetch all form schemas to identify file fields
    const { data: forms } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, schema_json');

    const schemaMap = new Map();
    forms?.forEach(f => {
        const key = `${f.course_id}_${f.cycle_id}_${f.form_type}`;
        schemaMap.set(key, f.schema_json);
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const app of applications) {
        if (!app.form_data) continue;

        const schemaKey = `${app.course_id}_${app.cycle_id}_${app.form_type}`;
        const schema = schemaMap.get(schemaKey);

        if (!schema || !schema.fields) {
            console.log(`No schema found for App ${app.id} (${schemaKey})`);
            continue;
        }

        const fileFields = schema.fields.filter(f => f.type === 'file');
        
        for (const field of fileFields) {
            const fieldKey = field.key || field.name;
            const filePath = app.form_data[fieldKey];

            if (filePath && typeof filePath === 'string') {
                // Check if document record already exists
                const { data: existingDoc } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('application_id', app.id)
                    .eq('document_type', field.label)
                    .maybeSingle();

                const docData = {
                    application_id: app.id,
                    user_id: app.student_id,
                    file_path: filePath,
                    file_name: filePath.split('/').pop() || 'uploaded_file',
                    document_type: field.label,
                    status: 'pending',
                    uploaded_by: app.student_id // Assume student for backfill
                };

                if (existingDoc) {
                    const { error: updateErr } = await supabase
                        .from('documents')
                        .update(docData)
                        .eq('id', existingDoc.id);
                    if (!updateErr) updatedCount++;
                } else {
                    const { error: insertErr } = await supabase
                        .from('documents')
                        .insert(docData);
                    if (!insertErr) createdCount++;
                }
            }
        }
    }

    console.log('--- Backfill Complete ---');
    console.log(`Created: ${createdCount}`);
    console.log(`Updated: ${updatedCount}`);
}

backfillDocuments();
