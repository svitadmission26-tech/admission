import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backfillAuditColumns() {
    console.log('Starting backfill for created_by and updated_by in applications table...');

    // Fetch applications where created_by or updated_by is NULL
    const { data: applications, error: fetchError } = await supabaseAdmin
        .from('applications')
        .select('id, student_id, created_by, updated_by');

    if (fetchError) {
        console.error('Error fetching applications:', fetchError.message);
        return;
    }

    if (!applications || applications.length === 0) {
        console.log('No applications found to backfill.');
        return;
    }

    let updatedCount = 0;
    const updates = [];

    for (const app of applications) {
        let needsUpdate = false;
        const updatePayload = {};

        // If student_id is present, assume student created/updated it
        if (app.student_id) {
            if (!app.created_by) {
                updatePayload.created_by = app.student_id;
                needsUpdate = true;
            }
            if (!app.updated_by) {
                updatePayload.updated_by = app.student_id;
                needsUpdate = true;
            }
        }
        // Note: For staff-created/updated applications without student_id (e.g., direct admin/DEO entry in future),
        // we cannot infer who it was from existing data. They will remain NULL until edited by a staff member.

        if (needsUpdate) {
            updates.push(
                supabaseAdmin
                    .from('applications')
                    .update(updatePayload)
                    .eq('id', app.id)
            );
            updatedCount++;
        }
    }

    if (updates.length > 0) {
        console.log(`Attempting to update ${updates.length} applications...`);
        const results = await Promise.all(updates);

        results.forEach((res, index) => {
            if (res.error) {
                console.error(`Error updating application ${applications[index].id}:`, res.error.message);
            }
        });
        console.log(`Backfill process completed. ${updatedCount} applications potentially updated.`);
    } else {
        console.log('No applications needed backfilling.');
    }
}

backfillAuditColumns();
