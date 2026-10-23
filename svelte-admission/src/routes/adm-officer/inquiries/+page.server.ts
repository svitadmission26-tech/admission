import { fail, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const user = await getAuthenticatedUser();
    if (!user || !['admin', 'adm_officer', 'university_auth', 'college_auth', 'deo'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get filter parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '100');
    const academicYearId = url.searchParams.get('academicYearId') || '';
    const courseId = url.searchParams.get('courseId') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';
    const activeTab = url.searchParams.get('tab') || 'inquiries';
    const conversionFilter = url.searchParams.get('conversionFilter') || '';

    // 2. Fetch Helper Data (Filters)
    const [yearsRes, coursesRes] = await Promise.all([
        supabase.from('academic_years').select('id, name').order('name', { ascending: false }),
        supabase.from('courses').select('id, name').order('name')
    ]);

    // 3. Build Inquiry Query
    let query = supabase
        .from('inquiries')
        .select(`
            *,
            form:inquiry_forms(name),
            academic_year:academic_years(name),
            preferences:inquiry_preferences(
                priority,
                course:courses(id, name),
                branch:branches(name)
            )
        `, { count: 'exact' });

    // Apply Filters
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);
    if (status === 'processed') query = query.eq('is_processed', true);
    if (status === 'new') query = query.eq('is_processed', false);
    
    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }



    if (courseId) {
        const { data: prefIds } = await supabase
            .from('inquiry_preferences')
            .select('inquiry_id')
            .eq('course_id', courseId);
        
        const ids = (prefIds || []).map(p => p.inquiry_id);
        if (ids.length > 0) {
            query = query.in('id', ids);
        } else {
            return {
                inquiries: [],
                totalCount: 0,
                academicYears: yearsRes.data || [],
                courses: coursesRes.data || [],
                filters: { page, pageSize, academicYearId, courseId, status, search, tab: activeTab, conversionFilter },
                conversionReportData: []
            };
        }
    }

    let inquiries: any[] = [];
    let totalCount = 0;

    if (conversionFilter) {
        // Fetch all matching inquiries (without range) so we can filter in memory
        const { data: allInquiries, error } = await query
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching inquiries for filtering:', error);
        
        const rawInquiries = allInquiries || [];

        // 1. Fetch form types
        const { data: provFormTypes } = await supabaseAdmin
            .from('form_types')
            .select('name')
            .eq('is_prov', true);
        const provNames = provFormTypes?.map(f => f.name) || [];

        // 2. Fetch converted/paid emails
        if (conversionFilter === 'prov_converted' || conversionFilter === 'not_converted') {
            const { data: apps } = await supabaseAdmin
                .from('applications')
                .select('student_user:users!student_id(email)')
                .in('form_type', provNames);
            
            const emails = new Set((apps || []).map(a => {
                const userObj = (a as any).student_user;
                return (Array.isArray(userObj) ? userObj[0]?.email : userObj?.email)?.toLowerCase();
            }).filter(Boolean));

            if (conversionFilter === 'prov_converted') {
                inquiries = rawInquiries.filter(i => i.email && emails.has(i.email.toLowerCase()));
            } else {
                inquiries = rawInquiries.filter(i => !i.email || !emails.has(i.email.toLowerCase()));
            }
        } else if (conversionFilter === 'fees_paid') {
            const { data: payments } = await supabaseAdmin
                .from('payments')
                .select('application:applications(form_type, student_user:users!student_id(email))')
                .eq('payment_type', 'tuition_fee')
                .eq('status', 'completed');
            
            const emails = new Set(
                (payments || [])
                    .map(p => (p as any).application)
                    .filter((app: any) => app)
                    .map((app: any) => {
                        const userObj = app.student_user;
                        return (Array.isArray(userObj) ? userObj[0]?.email : userObj?.email)?.toLowerCase();
                    })
                    .filter(Boolean)
            );

            inquiries = rawInquiries.filter(i => i.email && emails.has(i.email.toLowerCase()));
        }

        totalCount = inquiries.length;
        // Paginate in memory
        const from = (page - 1) * pageSize;
        inquiries = inquiries.slice(from, from + pageSize);
    } else {
        // Standard database-level pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) console.error('Error fetching inquiries:', error);
        inquiries = data || [];
        totalCount = count || 0;
    }

    let conversionReportData: any[] = [];
    if (activeTab === 'report' && inquiries && inquiries.length > 0) {
        const emails = inquiries.map(i => i.email).filter(Boolean);
        if (emails.length > 0) {
            const { data: usersData } = await supabaseAdmin
                .from('users')
                .select('id, email')
                .in('email', emails);

            const userMap = new Map(usersData?.map(u => [(u.email || '').toLowerCase(), u]) || []);
            const userIds = usersData?.map(u => u.id) || [];

            let appsData: any[] = [];
            if (userIds.length > 0) {
                const { data } = await supabaseAdmin
                    .from('applications')
                    .select(`
                        id,
                        student_id,
                        status,
                        submitted_at,
                        form_type,
                        course:courses(id, name),
                        account_admissions(admission_number),
                        payments(id, amount, status, payment_type, transaction_id)
                    `)
                    .in('student_id', userIds);
                appsData = data || [];
            }

            const { data: formTypes } = await supabaseAdmin
                .from('form_types')
                .select('name, is_prov');
            const isProvMap = new Map(formTypes?.map(ft => [ft.name, ft.is_prov]) || []);

            conversionReportData = inquiries.map(inquiry => {
                const emailKey = (inquiry.email || '').toLowerCase();
                const matchedUser = userMap.get(emailKey);
                const userApps = matchedUser ? appsData.filter(app => app.student_id === matchedUser.id) : [];
                const provApp = userApps.find(app => isProvMap.get(app.form_type) === true);
                const anyApp = userApps[0];

                const inquiryCourses = (inquiry.preferences || [])
                    .map((p: any) => p.course?.name)
                    .filter(Boolean);
                const inquiryCourseList = Array.from(new Set(inquiryCourses)).join(', ');

                const allPayments = userApps.flatMap(app => app.payments || []);
                const provFeePayment = allPayments.find(p => p.payment_type === 'provisional_fee' && p.status === 'completed');
                const tuitionFeePayment = allPayments.find(p => p.payment_type === 'tuition_fee' && p.status === 'completed');

                return {
                    inquiry,
                    is_registered: !!matchedUser,
                    prov_app_id: provApp?.id || null,
                    prov_app_status: provApp?.status || null,
                    prov_app_course: provApp?.course?.name || anyApp?.course?.name || inquiryCourseList || null,
                    prov_admission_no: provApp?.account_admissions?.[0]?.admission_number || null,
                    prov_fee_paid: !!provFeePayment,
                    prov_fee_amount: provFeePayment?.amount || null,
                    prov_fee_tx: provFeePayment?.transaction_id || null,
                    tuition_fee_paid: !!tuitionFeePayment,
                    tuition_fee_amount: tuitionFeePayment?.amount || null,
                    tuition_fee_tx: tuitionFeePayment?.transaction_id || null,
                };
            });
        }
    }



    return {
        inquiries: inquiries || [],
        totalCount: totalCount,
        academicYears: yearsRes.data || [],
        courses: coursesRes.data || [],
        filters: { page, pageSize, academicYearId, courseId, status, search, tab: activeTab, conversionFilter },
        conversionReportData
    };
};

export const actions: Actions = {
    deleteInquiries: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const user = await getAuthenticatedUser();
        if (!user || !['admin', 'adm_officer'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized: Only Admin and Admission Officers can delete inquiries.' });
        }

        const formData = await request.formData();
        const idsRaw = formData.get('ids') as string;
        
        if (!idsRaw) return fail(400, { message: 'No IDs provided' });
        
        let ids: string[] = [];
        try {
            ids = JSON.parse(idsRaw);
        } catch (e) {
            return fail(400, { message: 'Invalid format for IDs' });
        }

        if (!Array.isArray(ids) || ids.length === 0) return fail(400, { message: 'No records selected' });

        // Bypass RLS for admin deletion using Service Role
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabaseAdmin
            .from('inquiries')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('Admin Delete Error:', error);
            return fail(500, { message: 'Failed to delete records: ' + error.message });
        }

        return { success: true };
    }
};
