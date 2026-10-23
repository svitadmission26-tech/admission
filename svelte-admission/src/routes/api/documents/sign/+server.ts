import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || !['deo', 'adm_officer', 'college_auth', 'admin'].includes(userProfile?.role || '')) {
        throw error(403, 'Unauthorized');
    }

    const { filePath } = await request.json();
    if (!filePath) {
        throw error(400, 'File path is required');
    }

    // Use Service Role to sign URLs
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error: signError } = await supabaseAdmin.storage
        .from('documents')
        .createSignedUrl(filePath, 3600);

    if (signError) {
        console.error('Error signing URL:', signError);
        throw error(500, 'Failed to sign URL');
    }

    return json({ signedUrl: data.signedUrl });
};
