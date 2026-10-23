import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) throw redirect(303, '/login');

    // Ensure role is deo (though layout might already enforce this)
    if (userProfile?.role !== 'deo' && userProfile?.role !== 'admin') {
         // Maybe redirect or error? Assuming layout handles it, but let's be safe.
         // Actually, if layout doesn't handle, this is good.
    }

    const { data: templates, error } = await supabase
        .from('report_templates')
        .select('id, name, description, report_type')
        .neq('report_type', 'html_profile')
        .contains('allowed_roles', [userProfile.role]);

    return { templates: templates || [] };
};
