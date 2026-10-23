import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile, supabase }, url }) => {
    const session = await getSession();
    if (!session || !userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
        throw redirect(303, '/login');
    }

    const search = url.searchParams.get('q') || '';
    if (!search) return { students: [] };

    const term = `%${search}%`;

    // We do LEFT JOIN on applications so that students show up even if active_application_id is null,
    // and we filter by users.college_id to enforce college restrictions.
    let qName = supabase
        .from('student_profiles')
        .select(`
            user_id,
            enrollment_number,
            admission_status,
            users!inner (
                id,
                full_name,
                email,
                college_id
            ),
            applications:applications!student_profiles_active_application_id_fkey (
                id,
                courses (
                    name,
                    college_id,
                    colleges ( name )
                ),
                branches ( name )
            )
        `)
        .not('enrollment_number', 'is', null)
        .ilike('users.full_name', term)
        .limit(15);

    let qEnroll = supabase
        .from('student_profiles')
        .select(`
            user_id,
            enrollment_number,
            admission_status,
            users!inner (
                id,
                full_name,
                email,
                college_id
            ),
            applications:applications!student_profiles_active_application_id_fkey (
                id,
                courses (
                    name,
                    college_id,
                    colleges ( name )
                ),
                branches ( name )
            )
        `)
        .not('enrollment_number', 'is', null)
        .ilike('enrollment_number', term)
        .limit(15);

    if (userProfile.college_id) {
        qName = qName.eq('users.college_id', userProfile.college_id);
        qEnroll = qEnroll.eq('users.college_id', userProfile.college_id);
    }

    const [resName, resEnroll] = await Promise.all([qName, qEnroll]);
    
    if (resName.error) {
        console.error('Error searching students by name for bus seva fee:', resName.error.message);
    }
    if (resEnroll.error) {
        console.error('Error searching students by enrollment for bus seva fee:', resEnroll.error.message);
    }

    const merged = [...(resName.data || []), ...(resEnroll.data || [])];
    
    // Deduplicate by user_id
    const unique = [];
    const seen = new Set();
    for (const student of merged) {
        if (!seen.has(student.user_id)) {
            seen.add(student.user_id);
            unique.push(student);
        }
    }

    return { students: unique.slice(0, 15) };
};
