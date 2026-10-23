import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || userProfile?.role !== 'college_auth') {
        throw redirect(303, '/login');
    }

    const collegeId = userProfile.college_id;
    if (!collegeId) return { circulars: [] };

    // We use service role for storage signing if needed, but RLS on table usually allows read for authenticated.
    // However, circulars might have RLS restricting visibility.
    // Assuming 'circulars' table is readable by authenticated users or public.
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get Course IDs for this college
    const { data: courses } = await supabase
        .from('courses')
        .select('id')
        .eq('college_id', collegeId);
    
    const courseIds = courses?.map(c => c.id) || [];

    // Params
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // 2. Fetch Circulars
    // Logic: Active circulars where (course_id IS NULL) OR (course_id IN courseIds)
    let query = supabaseAdmin
        .from('circulars')
        .select('*, courses(name, code)', { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (courseIds.length > 0) {
        // Complex OR logic in Supabase via .or()
        // course_id.is.null,course_id.in.(ids)
        // Syntax: .or(`course_id.is.null,course_id.in.(${courseIds.join(',')})`)
        query = query.or(`course_id.is.null,course_id.in.(${courseIds.join(',')})`);
    } else {
        query = query.is('course_id', null);
    }

    const { data: circulars, count, error: circError } = await query;

    if (circError) {
        console.error('Error fetching circulars:', circError.message);
    }

    // Generate Signed URLs
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
        count: count || 0,
        page,
        limit
    };
};
