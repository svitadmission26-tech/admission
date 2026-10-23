import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { getAuthenticatedUser, userProfile } }) => {
    // 1. Authorize user
    const user = await getAuthenticatedUser();
    if (!user || !['admin', 'adm_officer', 'university_auth', 'college_auth', 'deo'].includes(userProfile?.role || '')) {
        return new Response('Unauthorized', { status: 401 });
    }

    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Get filter parameters
    const academicYearId = url.searchParams.get('academicYearId') || '';
    const courseId = url.searchParams.get('courseId') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';
    const conversionFilter = url.searchParams.get('conversionFilter') || '';

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
        `);

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
            return json([]);
        }
    }

    // 4. Fetch all matching inquiries (no range limit for export)
    const { data: allInquiries, error: inqError } = await query.order('created_at', { ascending: false });
    if (inqError) {
        console.error('Error fetching inquiries for export:', inqError);
        return json([], { status: 500 });
    }

    let inquiries = allInquiries || [];

    // 5. Apply conversion filters in memory if selected
    if (conversionFilter) {
        // Fetch form types
        const { data: provFormTypes } = await supabase
            .from('form_types')
            .select('name')
            .eq('is_prov', true);
        const provNames = provFormTypes?.map(f => f.name) || [];

        if (conversionFilter === 'prov_converted' || conversionFilter === 'not_converted') {
            const { data: apps } = await supabase
                .from('applications')
                .select('student_user:users!student_id(email)')
                .in('form_type', provNames);
            
            const emails = new Set((apps || []).map(a => {
                const userObj = (a as any).student_user;
                return (Array.isArray(userObj) ? userObj[0]?.email : userObj?.email)?.toLowerCase();
            }).filter(Boolean));

            if (conversionFilter === 'prov_converted') {
                inquiries = inquiries.filter(i => i.email && emails.has(i.email.toLowerCase()));
            } else {
                inquiries = inquiries.filter(i => !i.email || !emails.has(i.email.toLowerCase()));
            }
        } else if (conversionFilter === 'fees_paid') {
            const { data: payments } = await supabase
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

            inquiries = inquiries.filter(i => i.email && emails.has(i.email.toLowerCase()));
        }
    }

    // 6. Build report data for the full list of filtered inquiries
    let conversionReportData: any[] = [];
    if (inquiries.length > 0) {
        const emails = inquiries.map(i => i.email).filter(Boolean);
        if (emails.length > 0) {
            // Chunk email queries to prevent header overflow
            const chunkSize = 100;
            const emailChunks: string[][] = [];
            for (let i = 0; i < emails.length; i += chunkSize) {
                emailChunks.push(emails.slice(i, i + chunkSize));
            }

            const userResults = await Promise.all(
                emailChunks.map(chunk => supabase
                    .from('users')
                    .select('id, email')
                    .in('email', chunk)
                )
            );
            const usersData = userResults.flatMap(r => r.data || []);
            const userMap = new Map(usersData.map(u => [(u.email || '').toLowerCase(), u]));
            const userIds = usersData.map(u => u.id);

            let appsData: any[] = [];
            if (userIds.length > 0) {
                const userIdChunks: string[][] = [];
                for (let i = 0; i < userIds.length; i += chunkSize) {
                    userIdChunks.push(userIds.slice(i, i + chunkSize));
                }

                const appResults = await Promise.all(
                    userIdChunks.map(chunk => supabase
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
                        .in('student_id', chunk)
                    )
                );
                appsData = appResults.flatMap(r => r.data || []);
            }

            const { data: formTypes } = await supabase
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

    return json(conversionReportData);
};
