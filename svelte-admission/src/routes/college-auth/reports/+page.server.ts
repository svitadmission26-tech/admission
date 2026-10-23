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
    if (!collegeId) {
        return { error: 'No college assigned.' };
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Pagination, Search, Sort Params ---
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const sort = url.searchParams.get('sort') || 'newest'; 
    const tab = url.searchParams.get('tab') || 'admitted';
    const type = url.searchParams.get('type') || 'all'; // New: Fee Type Filter

    const offset = (page - 1) * limit;

    // 1. Get Course IDs for this college
    const { data: courses, error: courseError } = await supabaseAdmin
        .from('courses')
        .select('id, name, code')
        .eq('college_id', collegeId);

    if (courseError) {
        console.error('Error fetching courses:', courseError.message);
        return { error: 'Failed to load courses' };
    }

    const courseIds = courses?.map(c => c.id) || [];

    // Data Holders
    let admittedStudents = [];
    let admittedCount = 0;
    
    let payments = [];
    let paymentsCount = 0;

    let meritList = [];

    // 2. Fetch Admitted Students
    if (tab === 'admitted' && courseIds.length > 0) {
        let query = supabaseAdmin
            .from('applications')
            .select(`
                id, 
                status, 
                form_type,
                course_id,
                branch_id,
                users!student_id!inner (full_name, email, student_profiles(enrollment_number)), 
                courses (name),
                branches (name)
            `, { count: 'exact' })
            .in('course_id', courseIds)
            .eq('status', 'approved');

        if (search) {
            // Corrected Filter: Use the foreign key name 'student_id' to traverse the relationship
            query = query.or(`student_id.full_name.ilike.%${search}%,student_id.student_profiles.enrollment_number.ilike.%${search}%`);
        }

        if (sort === 'newest') query = query.order('submitted_at', { ascending: false });
        else if (sort === 'oldest') query = query.order('submitted_at', { ascending: true });
        else query = query.order('id', { ascending: false });

        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;
        if (error) console.error('Error fetching admitted:', error);
        
        admittedStudents = data?.map(s => ({
            ...s,
            student_user: s.users // Map back for frontend
        })) || [];
        admittedCount = count || 0;
    }

    // 3. Fetch Payments
    if (tab === 'payments' && courseIds.length > 0) {
        let query = supabaseAdmin
            .from('payments')
            .select(`
                *,
                applications!inner (
                    course_id,
                    student_user:users!student_id(full_name, student_profiles(enrollment_number)),
                    courses(name)
                )
            `, { count: 'exact' })
            .in('applications.course_id', courseIds);

        if (search) {
             query = query.or(`receipt_number.ilike.%${search}%,transaction_id.ilike.%${search}%`);
        }

        // Apply Fee Type Filter
        if (type !== 'all') {
            query = query.eq('payment_type', type);
        }

        if (sort === 'newest') query = query.order('payment_date', { ascending: false });
        else if (sort === 'oldest') query = query.order('payment_date', { ascending: true });
        
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;
        if (error) console.error('Error fetching payments:', error);
        
        payments = data || [];
        paymentsCount = count || 0;
    }

    // 4. Merit List
    if (tab === 'merit' && courseIds.length > 0) {
         const { data: meritEntries } = await supabaseAdmin
            .from('merit_list_entries')
            .select(`*, applications!inner(course_id, users!student_id(full_name))`)
            .in('applications.course_id', courseIds)
            .limit(100);
        meritList = meritEntries || [];
    }

    // Calculate total collected fees for the current filters (without pagination)
    let sumQuery = supabaseAdmin
        .from('payments')
        .select('amount, applications!inner(course_id)')
        .in('applications.course_id', courseIds);

    if (search) {
         sumQuery = sumQuery.or(`receipt_number.ilike.%${search}%,transaction_id.ilike.%${search}%`);
    }
    if (type !== 'all') {
        sumQuery = sumQuery.eq('payment_type', type);
    }

    const { data: sumData, error: sumError } = await sumQuery;
    const totalCollectedFees = sumData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    return {
        tab, page, limit, search, sort, type,
        admittedStudents, admittedCount,
        payments, paymentsCount,
        meritList,
        totalCollectedFees // New
    };
};
