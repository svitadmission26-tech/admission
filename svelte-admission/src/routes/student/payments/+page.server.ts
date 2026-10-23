import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'student') {
        throw redirect(303, '/login'); // Redirect non-student users
    }

    // Fetch all student's applications
    const { data: allApplications, error: appError } = await supabase
        .from('applications')
        .select(`
            id,
            status,
            application_fee_status,
            course_id,
            cycle_id,
            form_type,
            admission_type,
            courses(id, name),
            admission_cycles(id, name, academic_years(id, name)),
            account_admissions(admission_number, enrollment_status)
        `)
        .eq('student_id', userProfile.id);
        
    if (appError) {
        console.error('Error fetching applications:', appError.message);
        return { applicationsWithFees: [], tuitionFeeApps: [], provisionalFeeApps: [], feeStructures: [], payments: [] };
    }

    // Fetch all form types to get 'is_prov' status
    const { data: formTypesData, error: ftError } = await supabase
        .from('form_types')
        .select('name, is_prov');
    
    if (ftError) {
        console.error('Error fetching form types:', ftError.message);
        return { applicationsWithFees: [], tuitionFeeApps: [], provisionalFeeApps: [], feeStructures: [], payments: [] };
    }
    const formTypesMap = new Map(formTypesData.map(ft => [ft.name, ft]));

    // Fetch admission forms to get form_fee and prov_fee
    const { data: admissionFormsData, error: afError } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, form_fee, prov_fee');

    if (afError) {
        console.error('Error fetching admission forms:', afError.message);
        return { applicationsWithFees: [], tuitionFeeApps: [], provisionalFeeApps: [], feeStructures: [], payments: [] };
    }

    // Attach form_fee, prov_fee, and is_prov status to applications
    const applicationsWithFeesAndProvFee = allApplications.map(app => {
        const formType = formTypesMap.get(app.form_type as string);
        const admissionForm = admissionFormsData.find(af => 
            af.course_id === app.course_id && 
            af.cycle_id === app.cycle_id &&
            af.form_type === app.form_type // Match on form_type string
        );
        
        return {
            ...app,
            form_fee: admissionForm?.form_fee || 0,
            prov_fee: admissionForm?.prov_fee || 0,
            is_provisional_form_type: formType?.is_prov || false
        };
    });

    // 1. Identify applications with pending Application Fees
    // Logic: 
    // - form_fee > 0 AND status is not paid/waived
    // - OR status is explicitly 'pending' (handles edge cases or data drift)
    const applicationFeeApps = applicationsWithFeesAndProvFee.filter(app => 
        (
            (app.form_fee || 0) > 0 && 
            app.application_fee_status !== 'paid' && 
            app.application_fee_status !== 'waived'
        ) || (
            app.application_fee_status === 'pending'
        )
    );

    // 2. Identify applications eligible for Tuition Fees
    // Logic: status is 'approved' AND has an admission number AND is NOT provisional
    const tuitionFeeApps = applicationsWithFeesAndProvFee.filter(app => 
        app.status === 'approved' && 
        app.account_admissions?.length > 0 &&
        // @ts-ignore - property enrollment_status exists on joined table
        app.account_admissions[0].enrollment_status !== 'provisional'
    );

    // 3. Identify applications eligible for Provisional Fees
    // Logic: has account_admission with enrollment_status 'provisional' AND prov_fee > 0
    const provisionalFeeApps = applicationsWithFeesAndProvFee.filter(app =>
        app.account_admissions?.length > 0 &&
        // @ts-ignore
        app.account_admissions[0].enrollment_status === 'provisional' &&
        app.prov_fee > 0
    );
    // TODO: Filter out already paid provisional fees by checking the payments table.

    // Fetch fee structures for tuition fee apps
    const feeStructuresPromises = tuitionFeeApps.map(async (app) => {
        const { data: feeStructure, error: fsError } = await supabase
            .from('fee_structures')
            .select('id, name, total_amount, metadata')
            .eq('course_id', app.course_id)
            .eq('academic_year_id', app.admission_cycles?.academic_years?.id)
            .single();

        if (fsError) {
            console.error(`Error fetching fee structure for application ${app.id}:`, fsError.message);
            return null;
        }
        return { applicationId: app.id, feeStructure };
    });

    const feeStructures = (await Promise.all(feeStructuresPromises)).filter(Boolean);

    // Fetch existing payments for all applications
    const applicationIds = allApplications.map(app => app.id);
    const { data: payments, error: paymentsError } = await supabase
        .from('transactions')
        .select('id, application_id, gateway_response, amount, status, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false });

    if (paymentsError) {
        console.error('Error fetching payments:', paymentsError.message);
        return { applicationsWithFees: applicationFeeApps, tuitionFeeApps, feeStructures: feeStructures || [], payments: [] };
    }

    return {
        applicationsWithFees: applicationFeeApps,
        tuitionFeeApps,
        feeStructures: feeStructures || [],
        payments: payments || []
    };
};

export const actions: Actions = {
    makePayment: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'student') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const amount = parseFloat(formData.get('amount') as string);
        const payment_type = formData.get('payment_type') as string; // 'application_fee' or 'tuition_fee'
        const transaction_id = `MOCK_TXN_${Date.now()}`; // Mock transaction ID

        if (isNaN(amount) || amount <= 0) {
            return fail(400, { message: 'Invalid payment amount.', error: true });
        }

        if (!['application_fee', 'tuition_fee', 'provisional_fee'].includes(payment_type)) {
             return fail(400, { message: 'Invalid payment type.', error: true });
        }

        // Verify application ownership
        const { data: appCheck, error: appCheckError } = await supabase
            .from('applications')
            .select('id, status, student_id, account_admissions(enrollment_status)') // Fetch enrollment_status for provisional logic
            .eq('id', application_id)
            .eq('student_id', userProfile.id)
            .single();

        if (appCheckError || !appCheck) {
            console.error('Application not found or unauthorized:', appCheckError?.message);
            return fail(403, { message: 'Unauthorized or invalid application for payment.', error: true });
        }
        
        // Additional checks based on payment type
        if (payment_type === 'provisional_fee') {
            // Ensure this application is actually provisional
            if (appCheck.account_admissions?.length === 0 || appCheck.account_admissions[0].enrollment_status !== 'provisional') {
                return fail(400, { message: 'This application is not provisional.', error: true });
            }
            // TODO: Check if provisional fee already paid.
        }

        // --- Mock Payment Gateway Integration ---
        const paymentSuccess = Math.random() > 0.1; // 90% success rate for mock

        const paymentStatus = paymentSuccess ? 'completed' : 'failed';
        const paymentMessage = paymentSuccess ? 'Payment completed successfully!' : 'Payment failed. Please try again.';

        if (!paymentSuccess) {
            return fail(400, { message: paymentMessage, error: true });
        }

        // Record payment in the transactions table
        const { error: insertError } = await supabase.from('transactions').insert({
            student_id: authenticatedUser.id,
            application_id,
            amount,
            currency: 'INR',
            status: paymentStatus === 'completed' ? 'success' : 'failed',
            gateway_transaction_id: transaction_id,
            gateway_response: { payment_type }
        });

        if (insertError) {
            console.error('Error recording payment:', insertError.message);
            return fail(500, { message: 'Failed to record payment.', error: true });
        }

        // If application fee, update application status
        if (payment_type === 'application_fee' && paymentStatus === 'completed') {
            const { error: updateError } = await supabase
                .from('applications')
                .update({ application_fee_status: 'paid' })
                .eq('id', application_id);
            
            if (updateError) {
                 console.error('Error updating application fee status:', updateError.message);
                 // Note: Payment was recorded but status update failed. In real world, use transaction.
            }
        }
        
        // If provisional fee, update enrollment status to 'confirmed' (or specific provisional paid status)
        if (payment_type === 'provisional_fee' && paymentStatus === 'completed') {
            // This assumes successful provisional fee payment confirms the admission
            const { error: updateError } = await supabase
                .from('account_admissions')
                .update({ enrollment_status: 'confirmed' }) // Change from 'provisional' to 'confirmed'
                .eq('application_id', application_id); // Assuming one-to-one with application
            
            if (updateError) {
                console.error('Error updating provisional enrollment status:', updateError.message);
            }
        }

        return { success: true, message: paymentMessage };
    }
};
