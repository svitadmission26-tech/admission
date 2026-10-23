import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
    try {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'adm_officer') {
            throw error(401, 'Unauthorized: Only admission officers can update approval comments');
        }

        const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { applicationId, comment } = await request.json();

        if (!applicationId) {
            throw error(400, 'Application ID is required');
        }

        // Update the approval_comment field
        const { error: updateError } = await supabase
            .from('applications')
            .update({
                approval_comment: comment,
                updated_at: new Date().toISOString()
            })
            .eq('id', applicationId);

        if (updateError) {
            console.error('Error updating approval comment:', updateError);
            throw error(500, 'Failed to update approval comment');
        }

        return json({ success: true });

    } catch (err) {
        console.error('Error in update-comment endpoint:', err);
        if (err instanceof Error && 'status' in err) {
            throw err;
        }
        throw error(500, 'Internal server error');
    }
};