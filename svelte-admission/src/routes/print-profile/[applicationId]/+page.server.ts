import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ params, url, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || !['admin', 'adm_officer', 'deo', 'fee_collector', 'univ_auth', 'university_auth', 'college_auth'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    const { applicationId } = params;
    const templateId = url.searchParams.get('templateId');

    if (!templateId) {
        throw error(400, 'Missing templateId');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch Template
    const { data: template, error: tmplError } = await supabaseAdmin
        .from('report_templates')
        .select('html_content, name, report_type, configuration')
        .eq('id', templateId)
        .single();

    if (tmplError || !template) {
        throw error(404, 'Template not found');
    }

    // Pass IDs to frontend so Svelte can fetch data via API and interpolate
    return {
        applicationId,
        templateId,
        templateName: template.name,
        reportType: template.report_type,
        configuration: template.configuration,
        rawHtml: template.html_content || '<div>No HTML content defined in template.</div>'
    };
};
