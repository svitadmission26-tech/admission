import { redirect } from '@sveltejs/kit'; 
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || (userProfile?.role !== 'univ_auth' && userProfile?.role !== 'university_auth')) {
        throw redirect(303, '/login');
    }

    const universityId = userProfile.university_id;
    if (!universityId) {
        return { error: 'No university assigned.' };
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Params ---
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const sort = url.searchParams.get('sort') || 'newest';
    const type = url.searchParams.get('type') || 'all'; // New param

    const offset = (page - 1) * limit;

    // 1. Get Colleges
    const { data: colleges } = await supabaseAdmin
        .from('colleges')
        .select('id, name')
        .eq('university_id', universityId);
    
    const collegeIds = colleges?.map(c => c.id) || [];
    const collegeMap = new Map(colleges?.map(c => [c.id, c.name]));

    // 2. Get Courses
    const { data: courses } = await supabaseAdmin
        .from('courses')
        .select('id, college_id')
        .in('college_id', collegeIds);
    
    const courseIds = courses?.map(c => c.id) || [];

    let payments = [];
    let paymentsCount = 0;

    // Fetch Payments
    if (courseIds.length > 0) {
        let query = supabaseAdmin
            .from('payments')
            .select(`
                *,
                applications!inner (
                    course_id,
                    users!student_id(full_name, email, student_profiles(enrollment_number)),
                    courses(name, college_id)
                )
            `, { count: 'exact' })
            .in('applications.course_id', courseIds);

        if (search) {
             query = query.or(`applications.users.full_name.ilike.%${search}%,applications.users.student_profiles.enrollment_number.ilike.%${search}%`);
        }

        if (type !== 'all') {
            query = query.eq('payment_type', type);
        }
        
        if (sort === 'newest') query = query.order('payment_date', { ascending: false });
        else query = query.order('payment_date', { ascending: true });

        query = query.range(offset, offset + limit - 1);

        const { data, count } = await query;
        payments = data?.map(p => ({
            ...p,
            college_name: collegeMap.get(p.applications?.courses?.college_id) || 'Unknown',
            applications: {
                ...p.applications,
                student_user: p.applications?.users // Map 'users' to 'student_user' for frontend
            }
        })) || [];
        paymentsCount = count || 0;
    }
    // Calculate total collected fees for the current filters (without pagination)
    let sumQuery = supabaseAdmin
        .from('payments')
        .select('amount, applications!inner(course_id, users!student_id(full_name, student_profiles(enrollment_number)))')
        .in('applications.course_id', courseIds);

    if (search) {
         sumQuery = sumQuery.or(`applications.users.full_name.ilike.%${search}%,applications.users.student_profiles.enrollment_number.ilike.%${search}%`);
    }
    if (type !== 'all') {
        sumQuery = sumQuery.eq('payment_type', type);
    }
    
    const { data: sumData, error: sumError } = await sumQuery;
    const totalCollectedFees = sumData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    return {
        page, limit, search, sort, type,
        payments, paymentsCount,
        totalCollectedFees
    };
};
