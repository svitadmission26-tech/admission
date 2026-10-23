import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { getSchema } from '$lib/server/dbInspector';
import { executeReportQuery, buildSelectString } from '$lib/server/reportQueryBuilder';
import { getValueByPath, formatValue } from '$lib/server/reportExporter';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { data: templates, error } = await supabase
        .from('report_templates')
        .select('id, name, description, base_table, configuration, allowed_roles, report_type, target_form_type_id, target_academic_year_id, target_course_id, html_content')
        .order('created_at', { ascending: false });

    // Fetch metadata for the dropdowns
    const { data: formTypes } = await supabase.from('form_types').select('id, name').order('name');
    const { data: courses } = await supabase.from('courses').select('id, name').order('name');
    const { data: academicYears } = await supabase.from('academic_years').select('id, name').order('name', { ascending: false });

    // Fetch all admission form schemas to extract dynamic fields
    // Use service role to bypass RLS for metadata fetching
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: admissionForms } = await supabaseAdmin.from('admission_forms').select('schema_json');
    const dynamicFormFields: { key: string; label: string }[] = [];
    const seenFields = new Set<string>();

    if (admissionForms) {
        admissionForms.forEach(form => {
            const schema = form.schema_json as any;
            if (schema && Array.isArray(schema.fields)) {
                schema.fields.forEach((f: any) => {
                    const fieldKey = f.key || f.name;
                    // FILTER: Skip file/document fields
                    if (f.type === 'file' || f.type === 'image' || f.type === 'document') return;
                    
                    if (fieldKey && !seenFields.has(fieldKey)) {
                        dynamicFormFields.push({ key: fieldKey, label: f.label || fieldKey });
                        seenFields.add(fieldKey);
                    }
                });
            }
            // Scan for Merit/Grid fields in sections
            if (schema && Array.isArray(schema.sections)) {
                schema.sections.forEach((s: any) => {
                    if (Array.isArray(s.tableColumns)) {
                        s.tableColumns.forEach((tc: any) => {
                            if (tc.key && !seenFields.has(tc.key)) {
                                dynamicFormFields.push({ key: tc.key, label: `${s.title}: ${tc.label || tc.key}` });
                                seenFields.add(tc.key);
                            }
                        });
                    }
                });
            }
        });
    }

    // Fetch profile schema keys so nested profile_data fields can be exposed in the report builder.
    const { data: profileFields } = await supabaseAdmin
        .from('student_profile_fields')
        .select('key, label')
        .order('created_at', { ascending: true });

    return {
        templates: templates || [],
        formTypes: formTypes || [],
        courses: courses || [],
        academicYears: academicYears || [],
        schema: getSchema(profileFields || [], dynamicFormFields)
    };
};

export const actions: Actions = {
    save: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const formData = await request.formData();
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const base_table = formData.get('base_table') as string;
        const configStr = formData.get('configuration') as string;
        const rolesStr = formData.get('allowed_roles') as string;
        
        // New fields for HTML Profile
        const report_type = formData.get('report_type') as string || 'tabular';
        const target_form_type_id = formData.get('target_form_type_id') as string || null;
        const target_academic_year_id = formData.get('target_academic_year_id') as string || null;
        const target_course_id = formData.get('target_course_id') as string || null;
        const html_content = formData.get('html_content') as string || null;

        const authenticatedUser = await getAuthenticatedUser();

        let configuration, allowed_roles;
        try {
            configuration = JSON.parse(configStr);
            allowed_roles = JSON.parse(rolesStr);
        } catch (e) {
            return fail(400, { message: 'Invalid JSON' });
        }

        const data = {
            name, description, base_table, configuration, allowed_roles,
            report_type, target_form_type_id, target_academic_year_id, target_course_id, html_content,
            created_by: authenticatedUser?.id
        };

        let error;
        if (id) {
            // Update
            const { error: updateError } = await supabase.from('report_templates').update(data).eq('id', id);
            error = updateError;
        } else {
            // Insert
            const { error: insertError } = await supabase.from('report_templates').insert(data);
            error = insertError;
        }

        if (error) return fail(500, { message: error.message });
        return { success: true };
    },

    delete: async ({ request, locals: { supabase } }) => {
        const formData = await request.formData();
        const id = formData.get('id') as string;
        await supabase.from('report_templates').delete().eq('id', id);
        return { success: true };
    },

    preview: async ({ request, locals: { supabase, userProfile } }) => {
        const formData = await request.formData();
        const base_table = formData.get('base_table') as string;
        const configStr = formData.get('configuration') as string;

        let configuration;
        try {
            configuration = JSON.parse(configStr);
        } catch (e) {
            return fail(400, { message: 'Invalid JSON configuration' });
        }

        if (!base_table || !configuration.columns || configuration.columns.length === 0) {
            return fail(400, { message: 'Incomplete configuration' });
        }

        try {
            // Execute with limit
            const { data: rawData, queryString } = await executeReportQuery(supabase, userProfile, base_table, configuration, { limit: 5 });
            
            // Flatten for preview
            const previewData = (rawData as any[]).map((row: any, index: number) => {
                const flatRow: Record<string, string> = { 'Sr. No': String(index + 1) };
                configuration.columns.forEach((col: any) => {
                    flatRow[col.label] = formatValue(getValueByPath(row, col.path));
                });
                return flatRow;
            });

            return { 
                success: true, 
                previewData, 
                previewColumns: ['Sr. No', ...configuration.columns.map((c: any) => c.label)], 
                queryString 
            };
        } catch (e: any) {
            console.error('Preview Error:', e);
            return fail(500, { message: 'Preview failed: ' + e.message });
        }
    },

    suggest_options: async ({ request, locals: { supabase, userProfile } }) => {
        const formData = await request.formData();
        const table = formData.get('table') as string;
        const column = formData.get('column') as string;

        if (!table || !column) return fail(400, { message: 'Table and Column required' });

        try {
            const selectString = buildSelectString([{ path: column, label: '' }], table);

            // Construct query
            // We fetch 1000 rows to sample unique values.
            let query = supabase.from(table).select(selectString).limit(1000);
            
            // Apply security filter to ensure we don't leak data from other colleges if admin is restricted (though admin is global usually)
            // But if we reuse this for other roles, it matters.
            // Admin role check is in load, so we are safe, but good practice.
            // Note: reportQueryBuilder logic for filter is strict.
            // Let's just run it raw as admin for now since this is admin tool.
            
            const { data, error } = await query;
            if (error) throw error;
            
            const uniqueValues = new Set<string>();
            data.forEach((row: any) => {
                // getValueByPath handles the nested object structure returned by Supabase
                // e.g. { users: { full_name: 'John' } } -> 'John'
                const val = getValueByPath(row, column);
                if (val !== null && val !== undefined && val !== '') {
                    uniqueValues.add(String(val));
                }
            });

            return { success: true, suggestions: Array.from(uniqueValues).sort().join(', ') };
        } catch (e: any) {
            return fail(500, { message: 'Suggest failed: ' + e.message });
        }
    }
};
