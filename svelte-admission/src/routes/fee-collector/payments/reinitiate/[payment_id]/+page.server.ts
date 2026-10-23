import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { createFeeReceipt } from '$lib/server/receipt';
import { generateEnrollmentNumber } from '$lib/server/enrollment';

export const load: PageServerLoad = async ({ params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    const { payment_id } = params;
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch Target Payment & Application Details
    let paymentQuery = supabaseAdmin
        .from('payments')
        .select(`
            *,
            applications!inner(
                id,
                student_id,
                student_user:users!applications_student_id_fkey(
                    full_name,
                    email,
                    student_profiles(enrollment_number)
                ),
                course_id,
                branch_id,
                assigned_fee_scheme_id,
                form_type,
                admission_type,
                courses!inner(
                    id,
                    name,
                    code,
                    college_id,
                    colleges(
                        name,
                        code,
                        address,
                        logo_url,
                        universities(name, logo_url, contact_email, address)
                    )
                ),
                branches(id, name, code),
                admission_cycles(academic_year_id, academic_years(name))
            )
        `)
        .eq('id', payment_id);

    paymentQuery = applyRoleBasedCollegeFilter(paymentQuery, userProfile, 'applications.courses');
    const { data: targetPayment, error: paymentError } = await paymentQuery.single();

    if (paymentError || !targetPayment) {
        console.error('Error fetching target payment:', paymentError?.message);
        throw redirect(303, `/fee-collector/payments?error=${encodeURIComponent('Payment record not found')}`);
    }

    // 2. Fetch All Courses & Branches
    const { data: allCoursesWithBranches } = await supabaseAdmin
        .from('courses')
        .select(`
            id,
            name,
            code,
            college_id,
            branches(id, name, code)
        `)
        .order('name');

    // 3. Fetch Fee Schemes
    const { data: feeSchemes } = await supabaseAdmin
        .from('fee_schemes')
        .select('id, name')
        .order('name');

    // 4. Fetch Fee Structures
    const { data: feeStructures } = await supabaseAdmin
        .from('fee_structures')
        .select('*, fee_schemes(name)')
        .order('created_at', { ascending: false });

    // 5. Fetch Previous Payments History for Student
    const { data: studentPayments } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('application_id', targetPayment.application_id)
        .eq('status', 'completed')
        .order('payment_date', { ascending: false });

    return {
        targetPayment,
        allCoursesWithBranches: allCoursesWithBranches || [],
        feeSchemes: feeSchemes || [],
        feeStructures: feeStructures || [],
        studentPayments: studentPayments || [],
        userProfile
    };
};

export const actions: Actions = {
    reinitiateAdmissionAndCollect: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            return fail(403, { error: true, message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const applicationId = formData.get('application_id') as string;
        const paymentId = formData.get('payment_id') as string;
        const newCourseId = formData.get('new_course_id') as string;
        const newBranchId = formData.get('new_branch_id') as string;
        const newFeeSchemeId = formData.get('new_fee_scheme_id') as string;
        const feePeriod = (formData.get('fee_period') as string) || 'year';
        const paymentDate = (formData.get('payment_date') as string) || new Date().toISOString().split('T')[0];
        const prefixLetter = ((formData.get('enrollment_prefix_letter') as string) || 'F').toUpperCase();
        const remarks = (formData.get('remarks') as string) || '';
        const totalAmount = parseFloat(formData.get('amount') as string) || 0;
        const paymentBreakdownRaw = formData.get('payment_breakdown') as string;

        let paymentBreakdown: any[] = [];
        try {
            paymentBreakdown = paymentBreakdownRaw ? JSON.parse(paymentBreakdownRaw) : [];
        } catch (e) {
            paymentBreakdown = [];
        }

        if (!applicationId || totalAmount <= 0) {
            return fail(400, { error: true, message: 'Valid application ID and positive fee amount are required.' });
        }

        const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch application details
        const { data: application, error: appError } = await adminSupabase
            .from('applications')
            .select(`
                id,
                student_id,
                course_id,
                branch_id,
                assigned_fee_scheme_id,
                form_type,
                admission_type,
                cycle_id,
                courses(college_id),
                admission_cycles(academic_year_id, academic_years(name)),
                student_user:users!applications_student_id_fkey(
                    full_name,
                    email,
                    student_profiles(enrollment_number)
                )
            `)
            .eq('id', applicationId)
            .single();

        if (appError || !application) {
            console.error('Application fetch error on re-initiation:', appError);
            return fail(404, { error: true, message: `Application not found: ${appError?.message || ''}` });
        }

        const studentProfiles = application.student_user?.student_profiles;
        const profile = Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles;
        const previousEnrollmentNumber = profile?.enrollment_number || 'N/A';

        // 1. Log transfer history
        await adminSupabase.from('student_transfer_history').insert({
            application_id: applicationId,
            student_id: application.student_id,
            previous_enrollment_number: previousEnrollmentNumber,
            previous_course_id: application.course_id,
            previous_branch_id: application.branch_id,
            transferred_by: authenticatedUser.id,
            transferred_at: new Date().toISOString()
        });

        // 2. Update Application with new target selections and set status to approved
        const targetCourseId = (newCourseId && newCourseId.trim() !== '' && newCourseId !== 'null') ? newCourseId.trim() : application.course_id;
        const targetBranchId = (newBranchId && newBranchId.trim() !== '' && newBranchId !== 'null') ? newBranchId.trim() : (application.branch_id || null);
        const targetFeeSchemeId = (newFeeSchemeId && newFeeSchemeId.trim() !== '' && newFeeSchemeId !== 'null') ? newFeeSchemeId.trim() : application.assigned_fee_scheme_id;

        await adminSupabase
            .from('applications')
            .update({
                course_id: targetCourseId,
                branch_id: targetBranchId,
                assigned_fee_scheme_id: targetFeeSchemeId,
                status: 'approved'
            })
            .eq('id', applicationId);

        // 3. Generate Official Enrollment Number using System Sequence Generator
        let collegeId = (application.courses as any)?.college_id;
        if (!collegeId && targetCourseId) {
            const { data: cData } = await adminSupabase.from('courses').select('college_id').eq('id', targetCourseId).single();
            collegeId = cData?.college_id;
        }

        let academicYearId = (application.admission_cycles as any)?.academic_year_id;
        if (!academicYearId && application.cycle_id) {
            const { data: cycData } = await adminSupabase.from('admission_cycles').select('academic_year_id').eq('id', application.cycle_id).single();
            academicYearId = cycData?.academic_year_id;
        }

        console.log('[Re-Initiate Action] Sequence generation inputs:', {
            collegeId,
            targetCourseId,
            academicYearId,
            targetBranchId,
            formType: application.form_type,
            prefixLetter,
            admissionType: application.admission_type
        });

        let newEnrollmentNumber = previousEnrollmentNumber;
        if (collegeId && academicYearId) {
            try {
                newEnrollmentNumber = await generateEnrollmentNumber(
                    adminSupabase,
                    collegeId,
                    targetCourseId,
                    academicYearId,
                    targetBranchId,
                    application.form_type || 'MQ/NRI',
                    prefixLetter,
                    application.admission_type || 'Regular'
                );

                console.log('[Re-Initiate Action] Successfully generated enrollment number:', newEnrollmentNumber);

                // Update student_profiles & users table by student_id
                await adminSupabase
                    .from('student_profiles')
                    .update({
                        enrollment_number: newEnrollmentNumber,
                        admission_status: 'Admitted'
                    })
                    .eq('user_id', application.student_id);

                await adminSupabase
                    .from('users')
                    .update({ college_id: collegeId })
                    .eq('id', application.student_id);
            } catch (e: any) {
                console.error('[Re-Initiate Action] ERROR generating official enrollment sequence:', e?.message || e);
            }
        } else {
            console.warn('[Re-Initiate Action] Missing collegeId or academicYearId, skipping sequence generation:', { collegeId, academicYearId });
        }

        // 4. Fetch Fee Structure for itemized receipt printing (match by form_type without maybeSingle failure)
        const { data: matchingFsList } = await adminSupabase
            .from('fee_structures')
            .select('*')
            .eq('course_id', targetCourseId)
            .eq('fee_scheme_id', targetFeeSchemeId);

        const matchingFs = matchingFsList?.find(f => f.form_type === application.form_type) || matchingFsList?.[0];
        const feeBreakdown = matchingFs?.fee_components || matchingFs?.fee_components_breakdown || [];

        // 5. Create Transaction
        const gatewayTxId = `HYBRID-REINIT-${Date.now()}`;
        const { data: txData } = await adminSupabase.from('transactions').insert({
            student_id: application.student_id,
            application_id: applicationId,
            amount: totalAmount,
            currency: 'INR',
            status: 'success',
            gateway_transaction_id: gatewayTxId,
            gateway_response: {
                payment_type: 'tuition_fee',
                payment_date: new Date(paymentDate).toISOString(),
                payment_breakdown: paymentBreakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                fee_components_breakdown: feeBreakdown,
                collected_by: userProfile.id
            }
        }).select().single();

        // 6. Generate Official Receipt Number using System Receipt Generator
        const academicYearName = (application.admission_cycles as any)?.academic_years?.name || '2026-27';
        let receiptNo = `RCP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        let createdReceipt: any = null;

        if (txData && collegeId && academicYearId) {
            try {
                createdReceipt = await createFeeReceipt(adminSupabase, {
                    transactionId: txData.id,
                    studentId: application.student_id,
                    applicationId: applicationId,
                    amount: totalAmount,
                    generatedBy: userProfile.id,
                    paymentType: 'tuition_fee',
                    admissionType: application.admission_type || 'Regular',
                    academicYearId: academicYearId,
                    yearName: academicYearName,
                    collegeId: collegeId,
                    courseId: targetCourseId,
                    paymentBreakdown: paymentBreakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                    feeComponentsBreakdown: feeBreakdown
                });
                if (createdReceipt?.receipt_no) {
                    receiptNo = createdReceipt.receipt_no;
                }
            } catch (e) {
                console.error('Error generating official receipt sequence:', e);
            }
        }

        // 7. Insert New Payment Record
        const mainBreakdown = paymentBreakdown[0] || { mode: 'cash', ref: '' };
        const { data: createdPayment, error: paymentInsertError } = await adminSupabase
            .from('payments')
            .insert({
                application_id: applicationId,
                amount: totalAmount,
                payment_type: 'tuition_fee',
                transaction_id: gatewayTxId,
                receipt_number: receiptNo,
                status: 'completed',
                fee_period: feePeriod || 'year',
                payment_date: new Date(paymentDate).toISOString(),
                payment_mode: paymentBreakdown.length === 1 ? mainBreakdown.mode : 'hybrid',
                payment_breakdown: paymentBreakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                fee_components_breakdown: feeBreakdown,
                reference_no: remarks || `Re-initiated from ${previousEnrollmentNumber} to ${newEnrollmentNumber}`
            })
            .select('*')
            .single();

        if (paymentInsertError) {
            console.error('Error inserting payment record:', paymentInsertError.message);
            return fail(500, { error: true, message: `Failed to save payment: ${paymentInsertError.message}` });
        }

        // 8. Auto set Account Status to Cleared in account_admissions
        await adminSupabase
            .from('account_admissions')
            .update({ account_status: 'cleared' })
            .eq('application_id', applicationId);

        return {
            reinitiated: true,
            success: true,
            message: `Re-initiation successful! New Enrollment ID: ${newEnrollmentNumber}`,
            previousEnrollmentNumber,
            newEnrollmentNumber,
            receiptNo,
            amount: totalAmount,
            paymentMode: paymentBreakdown.length > 0 ? paymentBreakdown[0].mode : 'cash',
            referenceNo: remarks,
            studentName: application.student_user?.full_name || application.student_user?.email || 'Student',
            createdPayment
        };
    }
};
