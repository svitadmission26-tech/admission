import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals: { getAuthenticatedUser } }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
        return json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bucket = 'documents'; 

    if (!file) {
        return json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    const fileExtension = file.name.split('.').pop();
    const fileName = `${user.id}/${uuidv4()}.${fileExtension}`;

    // Use Service Role client to bypass RLS issues for file uploads
    // We already verified the user is authenticated above.
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(fileName, file);

    if (error) {
        console.error('Storage upload error for user:', user.id);
        console.error('Target fileName:', fileName);
        console.error('Full error object:', error);
        return json({ success: false, message: error.message }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(data.path);

    return json({
        success: true,
        path: data.path,
        url: publicUrlData.publicUrl,
        filename: file.name
    });
};

export const DELETE: RequestHandler = async ({ request, locals: { getAuthenticatedUser } }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
        return json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await request.json();

    if (!path) {
        return json({ success: false, message: 'No file path provided' }, { status: 400 });
    }

    // Security check: Ensure user can only delete their own files
    if (!path.startsWith(`${user.id}/`)) {
        return json({ success: false, message: 'Forbidden: You can only delete your own files' }, { status: 403 });
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabaseAdmin.storage
        .from('documents')
        .remove([path]);

    if (error) {
        console.error('Storage delete error:', error);
        return json({ success: false, message: error.message }, { status: 500 });
    }

    return json({ success: true, message: 'File deleted successfully' });
};