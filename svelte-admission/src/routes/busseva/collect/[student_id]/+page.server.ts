import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

async function generateReceiptNumber(supabaseAdmin: any, academicYearId: string): Promise<string> {
    const { data: yearData } = await supabaseAdmin
        .from('academic_years')
        .select('name, short_code')
        .eq('id', academicYearId)
        .single();
        
    const yearShortCode = yearData?.short_code || yearData?.name.replace(/[^0-9]/g, '') || '2425';
    
    let { data: seqRecord } = await supabaseAdmin
        .from('busseva_receipt_sequences')
        .select('id, current_sequence')
        .eq('academic_year_id', academicYearId)
        .maybeSingle();

    if (!seqRecord) {
        const { data: newSeq } = await supabaseAdmin
            .from('busseva_receipt_sequences')
            .insert({ academic_year_id: academicYearId, current_sequence: 0 })
            .select()
            .single();
        seqRecord = newSeq;
    }

    const nextSeq = (seqRecord?.current_sequence || 0) + 1;
    
    await supabaseAdmin
        .from('busseva_receipt_sequences')
        .update({ current_sequence: nextSeq })
        .eq('id', seqRecord.id);

    const padSeq = nextSeq.toString().padStart(5, '0');
    return `TR${yearShortCode}${padSeq}`;
}

export const load: PageServerLoad = async ({ params, locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
        throw redirect(303, '/login');
    }

    const { data: studentProfile, error: studentError } = await supabase
        .from('student_profiles')
        .select(`
            user_id,
            enrollment_number,
            users!inner (
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
        .eq('user_id', params.student_id)
        .single();

    if (studentError || !studentProfile) {
        throw redirect(303, '/busseva?error=Student+not+found');
    }

    let activeApp = studentProfile.applications;
    if (!activeApp) {
        // Fallback: Query the student's approved application directly from the applications table
        const { data: fallbackApps } = await supabase
            .from('applications')
            .select(`
                id,
                courses!inner (
                    name,
                    college_id,
                    colleges ( name )
                ),
                branches ( name )
            `)
            .eq('student_id', params.student_id)
            .eq('status', 'approved')
            .order('updated_at', { ascending: false })
            .limit(1);

        if (fallbackApps && fallbackApps.length > 0) {
            activeApp = fallbackApps[0];
            (studentProfile as any).applications = activeApp;
        }
    }

    const studentCollegeId = (activeApp as any)?.courses?.college_id || studentProfile.users?.college_id;

    // Role-based college security check
    if (userProfile.college_id && studentCollegeId !== userProfile.college_id) {
        throw redirect(303, '/busseva?error=Unauthorized');
    }

    const { data: activeYear } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('is_active', true)
        .single();

    const { data: qrConfig } = await supabase
        .from('busseva_qr_configs')
        .select('qr_image_url')
        .eq('academic_year_id', activeYear?.id)
        .maybeSingle();

    // Check for existing payment
    const enrollmentNumber = studentProfile.enrollment_number;
    const { data: existingFee } = await supabase
        .from('busseva_fees')
        .select('id, receipt_number')
        .eq('academic_year_id', activeYear?.id)
        .or(`student_id.eq.${params.student_id}${enrollmentNumber ? `,enrollment_number.eq.${enrollmentNumber}` : ''}`)
        .maybeSingle();

    return { studentProfile, activeApp, activeYear, qrConfig, existingFee };
};

export const actions: Actions = {
    default: async ({ request, params, locals: { supabase, userProfile } }) => {
        if (!userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
            return fail(403, { message: 'Unauthorized action.' });
        }

        const formData = await request.formData();
        const transactionNumber = formData.get('transaction_number') as string;
        const paidAmount = Number(formData.get('paid_amount'));
        const academicYearId = formData.get('academic_year_id') as string;
        const enrollmentNumber = formData.get('enrollment_number') as string;
        const collegeId = formData.get('college_id') as string;
        const routeName = formData.get('route_name') as string;
        const location = formData.get('location') as string;

        if (!transactionNumber || transactionNumber.trim() === '') {
            return fail(400, { message: 'Transaction ID is required.' });
        }
        if (isNaN(paidAmount) || paidAmount <= 0) {
            return fail(400, { message: 'Please enter a valid paid amount.' });
        }
        if (!collegeId) {
            return fail(400, { message: 'College ID is required.' });
        }
        if (!routeName || routeName.trim() === '') {
            return fail(400, { message: 'Route Name is required.' });
        }
        if (!location || location.trim() === '') {
            return fail(400, { message: 'Location/Stop is required.' });
        }

        // Bypassing RLS for sequences and insert via admin client
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const receiptNumber = await generateReceiptNumber(supabaseAdmin, academicYearId);

        const { data: record, error } = await supabaseAdmin
            .from('busseva_fees')
            .insert({
                student_id: params.student_id,
                enrollment_number: enrollmentNumber,
                academic_year_id: academicYearId,
                college_id: collegeId,
                total_amount: paidAmount,
                receipt_number: receiptNumber,
                transaction_number: transactionNumber.trim(),
                collected_by: userProfile.id,
                route_name: routeName.trim(),
                location: location.trim()
            })
            .select()
            .single();

        if (error) {
            console.error('Error inserting bus seva fee record:', error.message);
            return fail(500, { message: 'Failed to record payment.' });
        }

        throw redirect(303, `/busseva/receipt/${record.id}`);
    }
};
