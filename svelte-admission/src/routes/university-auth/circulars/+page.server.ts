import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();

    if (!session) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'univ_auth' && userProfile?.role !== 'university_auth') {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Params ---
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // Fetch Circulars
    const { data: circulars, count, error: circularsError } = await supabaseAdmin
        .from('circulars')
        .select(`
            *,
            courses(name, code)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (circularsError) {
        console.error('Error fetching circulars:', circularsError);
    }

    // Fetch Courses for Dropdown
    // Maybe restrict to courses in this university?
    // userProfile.university_id
    let courseQuery = supabaseAdmin.from('courses').select('id, name, code, college_id');
    
    if (userProfile.university_id) {
        // We need to filter courses by colleges belonging to this university
        // This is a join: courses -> colleges -> university_id
        // Supabase select with filtering on joined table:
        courseQuery = supabaseAdmin.from('courses')
            .select('id, name, code, colleges!inner(id, university_id)')
            .eq('colleges.university_id', userProfile.university_id)
            .order('name');
    }

    const { data: courses } = await courseQuery;

    // Generate Signed URLs for existing files
    const circularsWithUrls = await Promise.all((circulars || []).map(async (c) => {
        let signedUrl = null;
        if (c.file_path) {
            const { data } = await supabaseAdmin
                .storage
                .from('circulars')
                .createSignedUrl(c.file_path, 3600); 
            signedUrl = data?.signedUrl;
        }
        return { ...c, signedUrl };
    }));

    return {
        circulars: circularsWithUrls,
        courses: courses || [],
        count: count || 0,
        page,
        limit
    };
};

export const actions: Actions = {
    create: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || (userProfile?.role !== 'univ_auth' && userProfile?.role !== 'university_auth')) return fail(401, { message: 'Unauthorized' });

        const formData = await request.formData();
        const title = formData.get('title') as string;
        const description = formData.get('description') as string;
        const courseId = formData.get('course_id') as string || null;
        const file = formData.get('file') as File;

        if (!title) {
            return fail(400, { message: 'Title is required' });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        let filePath = null;

        // Handle File Upload
        if (file && file.size > 0) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            filePath = fileName;

            const { error: uploadError } = await supabaseAdmin
                .storage
                .from('circulars')
                .upload(fileName, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                return fail(500, { message: 'Failed to upload file' });
            }
        }

        // Insert Record
        const { error: insertError } = await supabaseAdmin
            .from('circulars')
            .insert({
                title,
                description,
                course_id: courseId,
                file_path: filePath,
                created_by: session.user.id,
                is_active: true
            });

        if (insertError) {
            console.error('Insert error:', insertError);
            return fail(500, { message: 'Failed to create circular' });
        }

        return { success: true };
    },

    delete: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || (userProfile?.role !== 'univ_auth' && userProfile?.role !== 'university_auth')) return fail(401, { message: 'Unauthorized' });

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const filePath = formData.get('file_path') as string;

        if (!id) return fail(400, { message: 'ID required' });

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        if (filePath) {
            await supabaseAdmin.storage.from('circulars').remove([filePath]);
        }

        const { error: deleteError } = await supabaseAdmin
            .from('circulars')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return fail(500, { message: 'Failed to delete circular' });
        }

        return { success: true };
    },

    toggleStatus: async ({ request, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || (userProfile?.role !== 'univ_auth' && userProfile?.role !== 'university_auth')) return fail(401, { message: 'Unauthorized' });

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const currentStatus = formData.get('current_status') === 'true';

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabaseAdmin
            .from('circulars')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (error) {
            return fail(500, { message: 'Failed to update status' });
        }

        return { success: true };
    }
};
