
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { executeReportQuery } from '$lib/server/reportQueryBuilder';
import { generateCSV } from '$lib/server/reportExporter';

export const GET: RequestHandler = async ({ url, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) throw error(401, 'Unauthorized');

    const templateId = url.searchParams.get('id');
    if (!templateId) throw error(400, 'Template ID required');

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: template } = await supabaseAdmin
        .from('report_templates')
        .select('name, allowed_roles, base_table, configuration')
        .eq('id', templateId)
        .single();

    if (!template) throw error(404, 'Template not found');

    // Check permissions
    if (!userProfile.role || (!template.allowed_roles.includes(userProfile.role) && userProfile.role !== 'admin')) {
        throw error(403, 'Forbidden');
    }

    const visibleColsParam = url.searchParams.get('visible_columns');
    const expandColsParam = url.searchParams.get('expand_columns') || '';
    const expandColumns = expandColsParam ? expandColsParam.split(',') : [];

    // Filter configuration columns list based on visibility
    let columns = template.configuration.columns || [];
    if (visibleColsParam) {
        const visiblePaths = visibleColsParam.split(',');
        columns = columns.filter((c: any) => visiblePaths.includes(c.path));
    }
    const configCopy = { ...template.configuration, columns };

    // Extract filters from query params
    const userFilters: Record<string, any> = {};
    let deduplicate = false;
    url.searchParams.forEach((value, key) => {
        if (key === 'deduplicate_student') {
            deduplicate = value === 'true';
        } else if (key !== 'id' && key !== 'visible_columns' && key !== 'expand_columns') {
            userFilters[key] = value;
        }
    });

    try {
        console.log(`Generating report for template: ${template.name} (${templateId})`);
        const { data, columns: outputColumns, queryString } = await executeReportQuery(supabaseAdmin, userProfile, template.base_table, configCopy, { userFilters, deduplicate, expandColumns }); 
        
        const rowCount = data ? data.length : 0;
        console.log(`Report generated. Rows: ${rowCount}. Query: ${queryString}`);

        const csv = generateCSV(data as any[], outputColumns);

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${template.name.replace(/\s+/g, '_')}_${Date.now()}.csv"`
            }
        });
    } catch (e) {
        console.error(e);
        throw error(500, 'Report generation failed');
    }
};
