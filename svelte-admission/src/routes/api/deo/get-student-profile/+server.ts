import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ url, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== 'deo') {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = url.searchParams.get('student_id');
    if (!studentId) {
        return json({ error: 'Student ID required' }, { status: 400 });
    }

    // Use Service Role to bypass RLS and ensure we get the profile
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: profile, error } = await supabaseAdmin
        .from('student_profiles')
        .select('profile_data, enrollment_number, admission_status')
        .eq('user_id', studentId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching student profile for DEO:', error);
        return json({ error: 'Database error' }, { status: 500 });
    }

    return json({ profile: profile || null });
};
