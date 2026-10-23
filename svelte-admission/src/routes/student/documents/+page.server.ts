import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'student') {
        throw redirect(303, '/login'); // Redirect non-student users
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const applicationId = url.searchParams.get('applicationId');
    let documents = [];

    try {
        console.log(`[DocumentsLoad] Start for User: ${userProfile.id} (${userProfile.email})`);
        console.log(`[DocumentsLoad] Target ApplicationId: ${applicationId}`);

        // Fetch student's applications to link documents to (using Admin to bypass RLS)
        const { data: applicationsRaw, error: appsError } = await supabaseAdmin
            .from('applications')
            .select('id, form_type, branch_id, student_id, status, courses!left(name), admission_cycles!left(name, academic_years(name))')
            .eq('student_id', userProfile.id)
            .order('updated_at', { ascending: false });

        if (appsError) {
            console.error('[DocumentsLoad] Apps Fetch Error:', appsError.message);
        }

        // Fetch documents only for the selected application
        if (applicationId) {
            console.log(`[DocumentsLoad] Fetching for appId: ${applicationId}`);
            
            try {
                // 1. Fetch existing documents (Admin)
                const { data: docs, error: docsError } = await supabaseAdmin
                    .from('documents')
                    .select('*')
                    .eq('application_id', applicationId);
                    
                if (docsError) {
                    console.error('[DocumentsLoad] Docs Fetch Error:', docsError.message);
                } else {
                    documents = docs || [];
                }
                console.log(`[DocumentsLoad] DB Docs found: ${documents.length}`);

                // 2. Fetch Application Data for Security & Self-Healing (Admin)
                const { data: appData, error: appFetchError } = await supabaseAdmin
                    .from('applications')
                    .select('*')
                    .eq('id', applicationId)
                    .single();

                if (appFetchError) {
                    console.error('[DocumentsLoad] App Fetch Error:', appFetchError.message);
                } else if (appData) {
                    console.log(`[DocumentsLoad] Ownership Check - User: ${userProfile.id}, AppOwner: ${appData.student_id}`);
                    
                    if (appData.student_id !== userProfile.id) {
                        console.error('[DocumentsLoad] Security Alert: ID Mismatch!');
                        // Don't leak other people's documents
                        return { applications: [], documents: [] };
                    }

                    // 3. Self-Healing check
                    if (appData.form_data) {
                        console.log(`[DocumentsLoad] Checking form_data keys: ${Object.keys(appData.form_data).join(', ')}`);
                        
                        try {
                            const { data: formSchema, error: schemaError } = await supabaseAdmin
                                .from('admission_forms')
                                .select('schema_json')
                                .eq('course_id', appData.course_id)
                                .eq('cycle_id', appData.cycle_id)
                                .eq('form_type', appData.form_type)
                                .maybeSingle();

                            if (schemaError) {
                                console.error('[DocumentsLoad] Schema Fetch Error:', schemaError.message);
                            } else if (formSchema?.schema_json?.fields) {
                                const fileFields = formSchema.schema_json.fields.filter((f: any) => f.type === 'file');
                                console.log(`[DocumentsLoad] Schema found with ${fileFields.length} file fields.`);
                                
                                for (const field of fileFields) {
                                    const key = field.key || field.name;
                                    const filePath = appData.form_data[key];
                                    // Match by document_type (label)
                                    const alreadyExists = documents.some(d => d.document_type === field.label);
                                    
                                    console.log(`[DocumentsLoad] Field [${field.label}] -> Key: ${key}, Path: ${filePath ? 'PRESENT' : 'NULL'}, inDB: ${alreadyExists}`);

                                    if (filePath && !alreadyExists) {
                                        console.log(`[DocumentsLoad] RE-CREATING document record for: ${field.label}`);
                                        const { data: restored, error: insertErr } = await supabaseAdmin
                                            .from('documents')
                                            .insert({
                                                application_id: applicationId,
                                                user_id: userProfile.id,
                                                file_path: filePath,
                                                file_name: filePath.split('/').pop() || 'restored_file',
                                                document_type: field.label,
                                                status: 'pending',
                                                uploaded_by: userProfile.id
                                            })
                                            .select()
                                            .single();

                                        if (insertErr) {
                                            console.error(`[DocumentsLoad] Insert Error for ${field.label}:`, insertErr.message);
                                        } else if (restored) {
                                            console.log(`[DocumentsLoad] Successfully restored: ${restored.id}`);
                                            documents.push(restored);
                                        }
                                    }
                                }
                            } else {
                                console.log('[DocumentsLoad] No matching form schema found for self-healing.');
                            }
                        } catch (err) {
                            console.error('[DocumentsLoad] Exception during self-healing:', err);
                        }
                    }
                }
            } catch (err) {
                console.error('[DocumentsLoad] Exception fetching documents for application:', err);
                // Continue with empty documents list
                documents = [];
            }
        }

        // Prepare applications list with branch names
        let applications = applicationsRaw || [];
        
        try {
            const branchIds = [...new Set(applications.map(app => app.branch_id).filter(Boolean))];
            if (branchIds.length > 0) {
                const { data: branchesData, error: branchError } = await supabaseAdmin.from('branches').select('id, name').in('id', branchIds);
                
                if (branchError) {
                    console.error('[DocumentsLoad] Branch Fetch Error:', branchError.message);
                    applications = applications.map(app => ({ ...app, branches: null }));
                } else {
                    const branchMap = new Map(branchesData?.map(b => [b.id, b]) || []);
                    applications = applications.map(app => ({ 
                        ...app, 
                        branches: app.branch_id ? branchMap.get(app.branch_id) : null 
                    }));
                }
            } else {
                applications = applications.map(app => ({ ...app, branches: null }));
            }
        } catch (err) {
            console.error('[DocumentsLoad] Exception processing branch data:', err);
            applications = applications.map(app => ({ ...app, branches: null }));
        }

        console.log(`[DocumentsLoad] Returning ${documents.length} documents.`);
        return {
            applications: applications,
            documents: documents
        };
    } catch (err) {
        console.error('[DocumentsLoad] Unexpected error:', err);
        // Return minimal safe data instead of crashing with 500
        return {
            applications: [],
            documents: []
        };
    }
};

export const actions: Actions = {
    delete: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'student') {
            throw redirect(303, '/login');
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;

        const { data: documentToDelete, error: docFetchError } = await supabaseAdmin
            .from('documents')
            .select('application_id, file_path, document_type')
            .eq('id', document_id)
            .single();

        if (docFetchError || !documentToDelete) {
            return fail(404, { message: 'Document not found.', error: true });
        }

        const { data: appStatusData } = await supabaseAdmin
            .from('applications')
            .select('id, status, student_id')
            .eq('id', documentToDelete.application_id)
            .single();

        if (!appStatusData || appStatusData.student_id !== userProfile.id) {
            return fail(403, { message: 'Unauthorized action.', error: true });
        }

        if (['verified', 'approved'].includes(appStatusData.status)) {
            return fail(403, { message: 'Application is locked. Cannot delete documents.', error: true });
        }

        if (documentToDelete.file_path) {
            await supabaseAdmin.storage.from('documents').remove([documentToDelete.file_path]);
        }

        await supabaseAdmin.from('documents').delete().eq('id', document_id);

        const { data: appData } = await supabaseAdmin
            .from('applications')
            .select('form_data')
            .eq('id', documentToDelete.application_id)
            .single();

        if (appData && appData.form_data) {
            let updatedFormData = { ...appData.form_data };
            let dataChanged = false;
            for (const key in updatedFormData) {
                if (updatedFormData[key] === documentToDelete.file_path) {
                    delete updatedFormData[key];
                    dataChanged = true;
                }
            }
            if (dataChanged) {
                await supabaseAdmin
                    .from('applications')
                    .update({ form_data: updatedFormData })
                    .eq('id', documentToDelete.application_id);
            }
        }

        return { success: true, message: 'Document deleted successfully!' };
    }
};
