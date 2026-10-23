import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== 'admin') {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const course_id = url.searchParams.get('course_id');
    const cycle_id = url.searchParams.get('cycle_id');
    const form_type = url.searchParams.get('form_type');
    const exclude_id = url.searchParams.get('exclude_id'); // For Edit page

    if (!course_id || !cycle_id || !form_type) {
        return json({ error: 'Missing parameters' }, { status: 400 });
    }

    let query = supabase
        .from('admission_forms')
        .select('id')
        .eq('course_id', course_id)
        .eq('cycle_id', cycle_id)
        .eq('form_type', form_type);

    if (exclude_id) {
        query = query.neq('id', exclude_id);
    }

    const { data: existingForm, error } = await query.maybeSingle();

    if (error) {
        console.error('Error checking form:', error);
        return json({ error: 'Database error' }, { status: 500 });
    }

    if (existingForm) {
        return json({ exists: true, formId: existingForm.id });
    } else {
        return json({ exists: false });
    }
};
