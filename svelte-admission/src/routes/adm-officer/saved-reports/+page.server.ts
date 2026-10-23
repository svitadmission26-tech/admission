import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) throw redirect(303, '/login');

    const { data: templates } = await supabase
        .from('report_templates')
        .select('id, name, description, report_type')
        .neq('report_type', 'html_profile')
        .contains('allowed_roles', [userProfile.role]);

    return { templates: templates || [] };
};
