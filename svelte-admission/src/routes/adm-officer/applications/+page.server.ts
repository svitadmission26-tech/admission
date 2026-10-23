import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin', 'college_auth'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    // Service Role to bypass RLS for complex joins/filtering if needed
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch Form Types for provisional logic and filtering
    const { data: formTypesData } = await supabaseAdmin.from('form_types').select('id, name, is_prov').order('name');
    const formTypesMap = Object.fromEntries((formTypesData || []).map(ft => [(ft.name || '').toLowerCase(), ft.is_prov]));
    const defaultFormType = formTypesData?.find(ft => ft.is_prov)?.name || '';

    // --- Params ---
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search') || '';
    const statusParam = url.searchParams.get('status') || 'submitted';
    const status = statusParam.toLowerCase();
    const courseId = url.searchParams.get('course_id') || '';
    const branchId = url.searchParams.get('branch_id') || '';

    // Standard params to exclude from custom filters
    const standardParams = ['page', 'limit', 'search', 'status', 'form_type', 'sort', 'order', 'course_id', 'branch_id'];

    // Default form type filter only if on 'Pending Verification' and not explicitly provided
    let formTypeFilter = url.searchParams.get('form_type');
    if (!formTypeFilter && status === 'submitted' && defaultFormType) {
        formTypeFilter = defaultFormType;
    }

    const offset = (page - 1) * limit;
    const sortField = url.searchParams.get('sort') || 'submitted_at';
    const sortOrder = url.searchParams.get('order') || 'desc';

    // 2. Fetch Applications
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id, status, form_type, admission_type, submitted_at, course_id, cycle_id,
            admission_cycles(academic_year_id),
            student_user:users!student_id!inner (
                full_name, 
                email,
                student_profiles(enrollment_number)
            ),
            courses (name, code),
            branches (name),
            payments (id, amount, status, payment_type, receipt_number)
        `, { count: 'exact' });

    // Apply Security Filter
    query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');

    // Filter by status tab (Case-Insensitive)
    if (status === 'submitted') {
        query = query.in('status', ['submitted', 'needs_correction', 'SUBMITTED', 'NEEDS_CORRECTION']);
    } else if (status === 'processed') {
        query = query.in('status', ['verified', 'approved', 'rejected', 'cancelled', 'VERIFIED', 'APPROVED', 'REJECTED', 'CANCELLED']);
    } else {
        query = query.ilike('status', status);
    }

    // Explicitly exclude drafts unless the status filter is explicitly set to 'draft'
    if (status !== 'draft') {
        query = query.neq('status', 'draft');
    }

    // Apply Form Type Filter (Case-Insensitive)
    if (formTypeFilter && formTypeFilter.toLowerCase() !== 'all') {
        const canonicalType = formTypesData?.find(ft => ft.name.toLowerCase() === formTypeFilter!.toLowerCase())?.name;
        if (canonicalType) {
            formTypeFilter = canonicalType;
            query = query.eq('form_type', formTypeFilter);
        } else {
            query = query.ilike('form_type', formTypeFilter);
        }
    }

    // Apply Course & Branch Filters
    if (courseId && courseId !== 'all') {
        query = query.eq('course_id', courseId);
    }
    if (branchId && branchId !== 'all') {
        query = query.eq('branch_id', branchId);
    }

    // Apply Custom Filters (Case-Insensitive)
    url.searchParams.forEach((value, key) => {
        if (!standardParams.includes(key) && value) {
            query = query.ilike(key, value);
        }
    });

    // Search (Improved to match placeholder: Name, College ID, Receipt)
    if (search) {
        query = query.or(`full_name.ilike.%${search}%, email.ilike.%${search}%`, { foreignTable: 'student_user' });
    }

    // Sort & Paginate
    // If NOT sorting by receipt, use server-side sort and range
    if (sortField !== 'receipt_number') {
        query = query.order(sortField, { ascending: sortOrder === 'asc' })
                     .range(offset, offset + limit - 1);
    }

    const { data: rawApplications, count: totalCount, error } = await query;

    if (error) {
        console.error('Error fetching applications:', error);
    }

    let processedApplications = rawApplications || [];

    // Helper to extract sorting receipt
    const getSortReceipt = (app: any) => {
        const isProvType = formTypesMap[(app.form_type || '').toLowerCase()] === true;
        const payment = (app.payments || []).find((p: any) => (p.payment_type || '').toLowerCase() === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) 
                     || (app.payments || []).find((p: any) => p.receipt_number);
        if (!payment?.receipt_number) return { num: '', seq: 0 };
        const seqMatch = payment.receipt_number.match(/(\d+)$/);
        return {
            num: payment.receipt_number,
            seq: seqMatch ? parseInt(seqMatch[1]) : 0
        };
    };

    // In-memory sorting for receipt_number
    if (sortField === 'receipt_number') {
        processedApplications.sort((a, b) => {
            const rA = getSortReceipt(a);
            const rB = getSortReceipt(b);
            if (rA.seq !== rB.seq) {
                return sortOrder === 'asc' ? rA.seq - rB.seq : rB.seq - rA.seq;
            }
            return sortOrder === 'asc' ? rA.num.localeCompare(rB.num) : rB.num.localeCompare(rA.num);
        });
    }

    // Final pagination for in-memory sort
    const finalApplications = (sortField === 'receipt_number') 
        ? processedApplications.slice(offset, offset + limit) 
        : processedApplications;

    // --- NEW: Fetch Print Profile Templates ---
    const { data: printTemplates } = await supabaseAdmin
        .from('report_templates')
        .select('id, name, target_form_type_id, target_academic_year_id, target_course_id')
        .eq('report_type', 'html_profile')
        .contains('allowed_roles', [userProfile?.role]);

    // Add ID to formTypesMap for frontend filtering
    const formTypeIdentityMap = Object.fromEntries((formTypesData || []).map(ft => [(ft.name || '').toLowerCase(), (ft as any).id]));

    // Fetch courses and branches for dropdown filters
    const { data: courses } = await supabaseAdmin.from('courses').select('id, name, code').order('name');
    const { data: branches } = await supabaseAdmin.from('branches').select('id, name, course_id').order('name');

    return {
        applications: finalApplications,
        count: totalCount || 0,
        page,
        limit,
        search,
        status,
        formTypeFilter: formTypeFilter || 'all',
        availableFormTypes: formTypesData || [],
        formTypesMap,
        formTypeIdentityMap,
        sort: sortField,
        order: sortOrder,
        printTemplates: printTemplates || [],
        courses: courses || [],
        branches: branches || [],
        courseId,
        branchId
    };
};
