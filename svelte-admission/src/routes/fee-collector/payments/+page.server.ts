import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { createFeeReceipt } from '$lib/server/receipt';
import { generateEnrollmentNumber } from '$lib/server/enrollment';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    const searchTerm = url.searchParams.get('search') || '';
    const courseIdFilter = url.searchParams.get('course_id') || '';
    const activeTab = (url.searchParams.get('type') || 'tuition') as 'tuition' | 'application' | 'provisional';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '25');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const tabToDbType = {
        'tuition': 'tuition_fee',
        'application': 'application_fee',
        'provisional': 'provisional_fee'
    };
    const dbPaymentType = tabToDbType[activeTab] || 'tuition_fee';

    // Use Service Role client for fast, reliable staff queries
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build optimized payments query
    let paymentsQuery = supabaseAdmin
        .from('payments')
        .select(`
            id,
            application_id,
            amount,
            payment_type,
            payment_date,
            payment_mode,
            payment_breakdown,
            fee_components_breakdown,
            fee_period,
            status,
            receipt_number,
            transaction_id,
            created_at,
            applications!inner (
                id,
                course_id,
                branch_id,
                assigned_fee_scheme_id,
                form_type,
                student_user:users!student_id (
                    full_name, 
                    email, 
                    student_profiles(enrollment_number)
                ),
                courses!inner (
                    id,
                    name, 
                    college_id
                ),
                branches(name),
                admission_cycles(academic_years(name)),
                account_admissions(admission_number)
            )
        `, { count: 'exact' })
        .eq('payment_type', dbPaymentType);

    if (courseIdFilter) {
        paymentsQuery = paymentsQuery.eq('applications.course_id', courseIdFilter);
    }
    if (searchTerm) {
        const [usersRes, profilesRes] = await Promise.all([
            supabaseAdmin.from('users').select('id').or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`),
            supabaseAdmin.from('student_profiles').select('user_id').ilike('enrollment_number', `%${searchTerm}%`)
        ]);

        const matchedStudentIds = [
            ...(usersRes.data || []).map(u => u.id),
            ...(profilesRes.data || []).map(p => p.user_id)
        ];

        if (matchedStudentIds.length > 0) {
            paymentsQuery = paymentsQuery.in('applications.student_id', matchedStudentIds);
        } else {
            paymentsQuery = paymentsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        }
    }
    paymentsQuery = applyRoleBasedCollegeFilter(paymentsQuery, userProfile, 'payments');

    // Build courses query
    let coursesQuery = supabaseAdmin.from('courses').select('id, name');
    coursesQuery = applyRoleBasedCollegeFilter(coursesQuery, userProfile, 'courses');

    // Execute critical queries in PARALLEL
    const [paymentsRes, coursesRes, coursesBranchesRes, feeSchemesRes, feeStructuresRes] = await Promise.all([
        paymentsQuery.order('created_at', { ascending: false }).range(from, to),
        coursesQuery.order('name'),
        supabaseAdmin.from('courses').select('id, name, code, collegeid_code, college_id, branches(id, name, code, collegeid_code)').order('name'),
        supabaseAdmin.from('fee_schemes').select('id, name').eq('is_active', true).order('name'),
        supabaseAdmin.from('fee_structures').select('*, fee_schemes(id, name)')
    ]);

    if (paymentsRes.error) {
        console.error('Error fetching payments:', paymentsRes.error);
    }

    const allPayments = paymentsRes.data || [];
    const totalPaymentsCount = paymentsRes.count || 0;
    const courses = coursesRes.data || [];

    // Stream non-blocking metadata queries
    const profileTemplates = supabaseAdmin
        .from('report_templates')
        .select('id, name, target_form_type_id')
        .eq('report_type', 'html_profile')
        .contains('allowed_roles', ['fee_collector'])
        .then(r => r.data || []);

    const formTypes = supabaseAdmin
        .from('form_types')
        .select('id, name')
        .then(r => r.data || []);

    return {
        payments: allPayments,
        tuitionPayments: activeTab === 'tuition' ? allPayments : [],
        applicationFeePayments: activeTab === 'application' ? allPayments : [],
        provisionalFeePayments: activeTab === 'provisional' ? allPayments : [],
        courses,
        allCoursesWithBranches: coursesBranchesRes.data || [],
        feeSchemes: feeSchemesRes.data || [],
        feeStructures: feeStructuresRes.data || [],
        userProfile,
        pagination: {
            page,
            limit,
            total: totalPaymentsCount,
            totalPages: Math.ceil(totalPaymentsCount / limit)
        },
        searchTerm,
        selectedCourseId: courseIdFilter,
        activeTab,
        streamed: {
            profileTemplates,
            formTypes
        }
    };
};

export const actions: Actions = {
    reinitiateAdmissionAndCollect: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            return fail(403, { message: 'Unauthorized action.' });
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const new_course_id = (formData.get('new_course_id') as string) || null;
        const new_branch_id = (formData.get('new_branch_id') as string) || null;
        const new_fee_scheme_id = (formData.get('new_fee_scheme_id') as string) || null;
        const amount = parseFloat(formData.get('amount') as string);
        const payment_mode = (formData.get('payment_mode') as string) || 'cash';
        const reference_no = (formData.get('reference_no') as string) || 'RECOLLECT';
        const enrollment_prefix_letter = (formData.get('enrollment_prefix_letter') as string) || 'F';

        if (!application_id || isNaN(amount) || amount <= 0) {
            return fail(400, { message: 'Invalid application ID or fee amount.', error: true });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Fetch current application & profile
        const { data: currentApp, error: appErr } = await supabaseAdmin
            .from('applications')
            .select('*, student_user:users!student_id(full_name, email)')
            .eq('id', application_id)
            .single();

        if (appErr || !currentApp) {
            return fail(404, { message: 'Application not found.', error: true });
        }

        const targetCourseId = new_course_id || currentApp.course_id;

        const { data: studentProfile } = await supabaseAdmin
            .from('student_profiles')
            .select('enrollment_number, user_id')
            .eq('user_id', currentApp.student_id)
            .maybeSingle();

        // 2. Log previous state to student_transfer_history
        await supabaseAdmin.from('student_transfer_history').insert({
            application_id: application_id,
            previous_course_id: currentApp.course_id,
            previous_branch_id: currentApp.branch_id,
            previous_enrollment_number: studentProfile?.enrollment_number,
            transferred_by: userProfile.id,
            remarks: `Re-initiated admission with course (${targetCourseId}), new branch (${new_branch_id || 'same'}) & fee scheme (${new_fee_scheme_id || 'same'}).`
        });

        // 3. Fetch target course data & cycle data for sequence generation
        const { data: courseData } = await supabaseAdmin
            .from('courses')
            .select('code, collegeid_code, college_id, branches(id, code, collegeid_code)')
            .eq('id', targetCourseId)
            .single();

        const { data: cycleData } = await supabaseAdmin
            .from('admission_cycles')
            .select('academic_year_id, academic_years(name)')
            .eq('id', currentApp.cycle_id)
            .single();

        const updatedBranch = new_branch_id || currentApp.branch_id;
        const updatedFeeScheme = new_fee_scheme_id || currentApp.assigned_fee_scheme_id;
        const collegeId = courseData?.college_id || currentApp.college_id;
        const academicYearId = cycleData?.academic_year_id;
        const admissionType = currentApp.admission_type || 'Regular';
        const yearName = cycleData?.academic_years?.name || '2026-27';

        let newEnrollmentNumber = studentProfile?.enrollment_number || 'N/A';
        if (collegeId && academicYearId) {
            try {
                newEnrollmentNumber = await generateEnrollmentNumber(
                    supabaseAdmin,
                    collegeId,
                    targetCourseId,
                    academicYearId,
                    updatedBranch,
                    currentApp.form_type || 'MQ/NRI',
                    enrollment_prefix_letter,
                    admissionType
                );

                // Update student_profiles & users table by student_id
                await supabaseAdmin
                    .from('student_profiles')
                    .update({
                        enrollment_number: newEnrollmentNumber,
                        admission_status: 'Admitted'
                    })
                    .eq('user_id', currentApp.student_id);

                await supabaseAdmin
                    .from('users')
                    .update({ college_id: collegeId })
                    .eq('id', currentApp.student_id);
            } catch (e) {
                console.error('Error generating official enrollment sequence:', e);
            }
        }

        await supabaseAdmin
            .from('applications')
            .update({
                course_id: targetCourseId,
                branch_id: updatedBranch,
                assigned_fee_scheme_id: updatedFeeScheme
            })
            .eq('id', application_id);

        // 5. Create Transaction & Issue Receipt
        const gatewayTxId = `RECOLLECT-PAY-${Date.now()}`;
        const { data: txData } = await supabaseAdmin
            .from('transactions')
            .insert({
                student_id: currentApp.student_id,
                application_id: application_id,
                amount: amount,
                currency: 'INR',
                status: 'success',
                gateway_transaction_id: gatewayTxId,
                gateway_response: {
                    payment_type: 'tuition_fee',
                    payment_mode,
                    reference_no,
                    old_enrollment_number: studentProfile?.enrollment_number,
                    new_enrollment_number: newEnrollmentNumber,
                    collected_by: userProfile.id
                }
            })
            .select()
            .single();

        const fee_components_breakdown_raw = (formData.get('fee_components_breakdown') as string) || '';
        let feeComponentsBreakdown: any[] = [];
        try {
            feeComponentsBreakdown = JSON.parse(fee_components_breakdown_raw || '[]');
        } catch (e) {
            console.error('Error parsing fee components breakdown:', e);
        }

        let receiptNo = '';
        let createdPayment = null;
        const paymentBreakdown = [{ mode: payment_mode, amount, ref: reference_no }];

        if (txData) {
            try {
                const receipt = await createFeeReceipt(supabaseAdmin, {
                    transactionId: txData.id,
                    studentId: currentApp.student_id,
                    applicationId: application_id,
                    amount: amount,
                    generatedBy: userProfile.id,
                    paymentType: 'tuition_fee',
                    admissionType,
                    academicYearId: cycleData?.academic_year_id,
                    yearName,
                    collegeId: courseData?.college_id,
                    courseId: targetCourseId,
                    paymentBreakdown,
                    feeBreakdown: feeComponentsBreakdown.length > 0 ? feeComponentsBreakdown : undefined,
                    details: { transfer_note: `Fresh fee collected on re-initiation for ${newEnrollmentNumber}` }
                });
                receiptNo = receipt.receipt_no;

                const { data: pData } = await supabaseAdmin.from('payments').insert({
                    application_id,
                    amount,
                    payment_type: 'tuition_fee',
                    transaction_id: gatewayTxId,
                    receipt_number: receipt.receipt_no,
                    status: 'completed',
                    fee_period: 'Fresh Collection / Branch Transfer',
                    payment_date: new Date().toISOString(),
                    payment_mode,
                    reference_no,
                    fee_components_breakdown: feeComponentsBreakdown.length > 0 ? feeComponentsBreakdown : null,
                    payment_breakdown: paymentBreakdown
                }).select(`
                    *,
                    applications (
                        id, course_id, form_type,
                        student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
                        courses(name, college_id, colleges(name, code, address, logo_url, universities(name, logo_url, contact_email))),
                        branches(name),
                        admission_cycles(academic_years(name)),
                        account_admissions(admission_number)
                    )
                `).single();
                createdPayment = pData;
            } catch (rErr) {
                console.error('Error generating receipt on re-initiation:', rErr);
            }
        }

        const studentUser = Array.isArray(currentApp.student_user) ? currentApp.student_user[0] : currentApp.student_user;

        return {
            success: true,
            reinitiated: true,
            studentName: studentUser?.full_name || studentUser?.email || 'N/A',
            previousEnrollmentNumber: studentProfile?.enrollment_number || 'N/A',
            newEnrollmentNumber,
            receiptNo,
            amount,
            paymentMode: payment_mode,
            referenceNo: reference_no,
            createdPayment,
            message: `Re-initiation successful! New Enrollment ID: ${newEnrollmentNumber}. Receipt #${receiptNo} issued.`
        };
    }
};
