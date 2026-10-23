
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { executeReportQuery } from '$lib/server/reportQueryBuilder';
import { getValueByPath, formatValue } from '$lib/server/reportExporter';

export const load: PageServerLoad = async ({ params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) throw error(401, 'Unauthorized');
    
    if (userProfile?.role !== 'deo' && userProfile?.role !== 'admin') {
        throw error(403, 'Forbidden');
    }
    
    const { id } = params;
    const { data: template, error: err } = await supabase
        .from('report_templates')
        .select('id, name, description, allowed_roles, report_type, configuration')
        .eq('id', params.id)
        .single();
        
    if (err || !template) throw error(404, 'Template not found');
    
    if (!userProfile.role || (!template.allowed_roles.includes(userProfile.role) && userProfile.role !== 'admin')) {
        throw error(403, 'Forbidden');
    }
    
    // NEW: Fetch dynamic options for select parameters to ensure they are complete
    if (template.configuration.parameters) {
        for (const param of template.configuration.parameters) {
            if (param.type === 'select') {
                try {
                    let uniqueValues = new Set((param.options || []).map((v: string) => v.trim()));
                    const col = param.column;
 
                    // 1. Check for known master tables based on column path/name
                    if (col.includes('courses') && col.includes('name')) {
                        const { data } = await supabase.from('courses').select('name');
                        data?.forEach((d: any) => uniqueValues.add(d.name?.trim()));
                    } else if (col.includes('branches') && col.includes('name')) {
                        const { data } = await supabase.from('branches').select('name');
                        data?.forEach((d: any) => uniqueValues.add(d.name?.trim()));
                    } else if (col.includes('form_type') || col === 'form_type') {
                        const { data } = await supabase.from('form_types').select('name');
                        data?.forEach((d: any) => uniqueValues.add(d.name?.trim()));
                    } else if (col.includes('admission_cycles') && col.includes('name')) {
                        const { data } = await supabase.from('admission_cycles').select('name');
                        data?.forEach((d: any) => uniqueValues.add(d.name?.trim()));
                    } else {
                        const { data: optionsData } = await supabase
                            .from(template.base_table)
                            .select(param.column)
                            .limit(2000);
                        
                        if (optionsData) {
                            optionsData.forEach((row: any) => {
                                const val = getValueByPath(row, param.column);
                                if (val !== null && val !== undefined && val !== '') {
                                    uniqueValues.add(String(val).trim());
                                }
                            });
                        }
                    }
                    param.options = Array.from(uniqueValues).filter(v => v).sort();
                } catch (e) {
                    console.error(`Failed to fetch dynamic options for ${param.name}:`, e);
                }
            }
        }
    }
    
    const branchCourseMapping: Record<string, string[]> = {};
    try {
        const { data: branchData } = await supabase.from('branches').select('name, courses(name)');
        if (branchData) {
            branchData.forEach((b: any) => {
                const courseName = b.courses && !Array.isArray(b.courses) ? (b.courses as any).name : null;
                if (b.name && courseName) {
                    const branchKey = b.name.trim();
                    if (!branchCourseMapping[branchKey]) {
                        branchCourseMapping[branchKey] = [];
                    }
                    branchCourseMapping[branchKey].push(courseName.trim());
                }
            });
        }
    } catch (e) {
        console.error('Failed to fetch branch course mapping:', e);
    }
    
    return { template, branchCourseMapping };
};

export const actions: Actions = {
    preview: async ({ request, params, locals: { supabase, userProfile } }) => {
        const formData = await request.formData();
        const id = params.id;
        
        const { data: template } = await supabase
            .from('report_templates')
            .select('base_table, configuration, report_type')
            .eq('id', params.id)
            .single();
            
        if (!template) return fail(404, { message: 'Template not found' });
        
        const userFilters: Record<string, any> = {};
        if (template.configuration.parameters) {
            template.configuration.parameters.forEach((param: any) => {
                const value = formData.get(param.name);
                if (value) {
                    userFilters[param.name] = value;
                }
            });
        }
        
        try {
            // Check if it's an HTML profile template
            if (template.report_type === 'html_profile') {
                return fail(400, { message: 'HTML Profile forms cannot be previewed here. They must be printed directly from a specific application details page.' });
            }

            const deduplicate = formData.get('deduplicate_student') === 'true';
            const visibleColsParam = formData.get('visible_columns') as string;
            const expandColsParam = formData.get('expand_columns') as string || '';
            const expandColumns = expandColsParam ? expandColsParam.split(',') : [];

            // Filter columns by visibility
            let columns = template.configuration.columns || [];
            if (visibleColsParam) {
                const visiblePaths = visibleColsParam.split(',');
                columns = columns.filter((c: any) => visiblePaths.includes(c.path));
            }
            const configCopy = { ...template.configuration, columns };

            const { data: rawData, columns: outputColumns, queryString } = await executeReportQuery(
                supabase, 
                userProfile, 
                template.base_table, 
                configCopy, 
                { limit: deduplicate ? 50 : 10, userFilters, deduplicate, expandColumns }
            );
            
            const finalRawData = deduplicate && rawData ? rawData.slice(0, 10) : rawData;
            
             // Flatten for preview
            const previewData = (finalRawData as any[]).map((row: any) => {
                const flatRow: Record<string, string> = {};
                if (outputColumns) {
                    outputColumns.forEach((col: any) => {
                        flatRow[col.label] = formatValue(getValueByPath(row, col.path));
                    });
                }
                return flatRow;
            });
            
            return { 
                success: true, 
                previewData, 
                previewColumns: outputColumns ? outputColumns.map((c: any) => c.label) : [], 
                queryString,
                userFilters,
                deduplicateStudent: deduplicate,
                visibleColumns: visibleColsParam ? visibleColsParam.split(',') : [],
                expandColumns
            };
        } catch (e: any) {
            console.error(e);
            return fail(500, { message: 'Preview failed: ' + e.message });
        }
    }
};
