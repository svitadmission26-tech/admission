import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, depends }) => {
    depends('student:profile'); // Tag for invalidation

    const authUser = await getAuthenticatedUser();
    // console.log('Student Layout: User:', authUser?.id, 'Role:', userProfile?.role);

    if (!authUser || !userProfile || userProfile.role !== 'student') {
        console.warn('Student Layout: Access denied. User:', authUser?.id, 'App Role:', userProfile?.role, 'Auth Role:', authUser?.role, 'Redirecting to /login');
        throw redirect(303, '/login'); // Redirect non-students or unauthenticated users
    }

    let studentProfile = null;
    
    try {
        const { data, error: profileError } = await supabase
            .from('student_profiles')
            .select('profile_data, enrollment_number, admission_status')
            .eq('user_id', userProfile.id)
            .maybeSingle();

        if (profileError) {
            // PGRST116 means "no rows found" which is expected - not an error
            if (profileError.code !== 'PGRST116') {
                console.error('Error fetching student profile:', profileError.message);
            }
        } else {
            studentProfile = data;
        }
    } catch (err) {
        console.error('Exception fetching student profile:', err);
        // Continue without profile data rather than crashing
    }

    return {
        userProfile,
        studentProfile: studentProfile || null
    };
};
