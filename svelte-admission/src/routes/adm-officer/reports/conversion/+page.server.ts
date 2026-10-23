
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

function getMatchKeys(app: any) {
    const student = app.student_user || app.student;
    const profile = Array.isArray(student?.student_profiles) ? student.student_profiles[0] : student?.student_profiles;
    const profileData = profile?.profile_data || {};
    const formData = app.form_data || {};

    const firstName = (profileData.first_name || formData.first_name || '').trim();
    const middleName = (profileData.middle_name || formData.middle_name || '').trim();
    const lastName = (profileData.last_name || formData.last_name || '').trim();
    const combinedName = `${firstName} ${middleName} ${lastName}`.trim().toLowerCase();
    const fatherName = (profileData.father_full_name || formData.father_full_name || '').trim().toLowerCase();
    const contact = (profileData.contact_number || formData.contact_number || profileData.mobile_number || '').trim().toLowerCase();
    const email = (student?.email || '').trim().toLowerCase();
    const fullName = (student?.full_name || '').trim().toLowerCase();

    return {
        combinedName,
        fatherName,
        lastName: lastName.toLowerCase(),
        contact,
        email,
        fullName
    };
}

export const load: PageServerLoad = async ({ locals: { getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch Form Types Map (Name -> is_prov)
    const { data: formTypes } = await supabaseAdmin
        .from('form_types')
        .select('name, is_prov');
    
    const provMap = new Map<string, boolean>();
    formTypes?.forEach(ft => provMap.set(ft.name, ft.is_prov));

    // 2. Fetch ALL Applications (non-draft)
    // We need student_id, dates, IDs, form_type, form_data
    const { data: applications, error } = await supabaseAdmin
        .from('applications')
        .select(`
            id, 
            student_id, 
            form_type, 
            status,
            form_data,
            submitted_at, 
            account_admissions(admission_number),
            student_user:users!student_id(
                full_name, 
                email,
                student_profiles(enrollment_number, profile_data)
            ),
            payments(payment_date, status, payment_type),
            merit_list_entries(merit_rank)
        `)
        .neq('status', 'draft')
        .order('submitted_at', { ascending: true });

    if (error) {
        console.error('Report Error:', error);
        return { reportData: [], stats: {} };
    }

    // 3. Process Data
    const provApps: any[] = [];
    const finalApps: any[] = [];

    // Split into Prov and MQ/NRI
    applications?.forEach((app: any) => {
        const isProv = provMap.get(app.form_type);
        if (isProv) {
            // Take merit rank from merit_list_entries table and match with provisional records
            const meritEntry = app.merit_list_entries;
            const rank = Array.isArray(meritEntry) ? meritEntry[0]?.merit_rank : meritEntry?.merit_rank;
            if (rank !== undefined && rank !== null) {
                provApps.push(app);
            }
        } else if (app.form_type === 'MQ/NRI') {
            // Only match with active MQ/NRI applications
            if (app.status !== 'draft') {
                finalApps.push(app);
            }
        }
    });

    // Match
    const reportData = provApps.map(provApp => {
        const provKeys = getMatchKeys(provApp);
        
        let convertedApp = null;
        if (finalApps.length > 0) {
            // Find matching MQ/NRI application by various criteria to handle duplicate accounts
            const matches = finalApps.filter(fa => {
                if (fa.student_id === provApp.student_id) return true;

                const faKeys = getMatchKeys(fa);

                if (provKeys.email && provKeys.email === faKeys.email) return true;
                if (provKeys.contact && provKeys.contact === faKeys.contact) return true;
                if (provKeys.combinedName && provKeys.combinedName === faKeys.combinedName) return true;
                if (provKeys.fullName && provKeys.fullName === faKeys.fullName) return true;
                
                // Match father name only if surname also matches
                if (provKeys.fatherName && provKeys.fatherName === faKeys.fatherName && 
                    provKeys.lastName && provKeys.lastName === faKeys.lastName) return true;

                return false;
            });

            if (matches.length > 0) {
                // Find an MQ/NRI app created AFTER or SAME TIME as provisional
                convertedApp = matches.find(fa => new Date(fa.submitted_at) >= new Date(provApp.submitted_at));
                // Fallback: just take the latest MQ/NRI app
                if (!convertedApp) convertedApp = matches[matches.length - 1];
            }
        }

        const studentProfile = provApp.student_user?.student_profiles;
        const college_id = (Array.isArray(studentProfile) ? studentProfile[0]?.enrollment_number : studentProfile?.enrollment_number) || '-';

        // Payment date from the MQ/NRI (converted) application, fallback to provisional application
        const finalPayments = convertedApp?.payments || [];
        const provPayments = provApp?.payments || [];
        const completedPayment = finalPayments.find((p: any) => p.status === 'completed' || p.status === 'success') || 
                                 finalPayments[0] ||
                                 provPayments.find((p: any) => p.status === 'completed' || p.status === 'success') ||
                                 provPayments[0];
        const payment_date = completedPayment?.payment_date || null;

        // Retrieve merit rank of the provisional application from the merit_list_entries table
        const provMeritEntry = provApp?.merit_list_entries;
        const merit_rank = (Array.isArray(provMeritEntry) ? provMeritEntry[0]?.merit_rank : provMeritEntry?.merit_rank) || '-';

        // Extract admission number safely since account_admissions can be returned as an object or an array
        const provAdmission = provApp.account_admissions;
        const prov_admission_no = (Array.isArray(provAdmission) ? provAdmission[0]?.admission_number : provAdmission?.admission_number) || 
                                  (provApp.id ? `App: ${provApp.id.slice(0, 8)}` : '-');

        const finalAdmission = convertedApp?.account_admissions;
        const final_admission_no = (Array.isArray(finalAdmission) ? finalAdmission[0]?.admission_number : finalAdmission?.admission_number) || 
                                   (convertedApp?.id ? `App: ${convertedApp.id.slice(0, 8)}` : '-');

        return {
            student_name: provApp.student_user?.full_name || 'Unknown',
            student_email: provApp.student_user?.email || '-',
            college_id,
            prov_admission_no,
            prov_date: provApp.submitted_at,
            prov_type: provApp.form_type,
            final_admission_no,
            final_date: convertedApp?.submitted_at || null,
            final_type: convertedApp?.form_type || null,
            payment_date,
            merit_rank,
            status: convertedApp ? 'Converted' : 'Pending'
        };
    });

    // 4. Calculate Stats
    const totalProv = reportData.length;
    const convertedCount = reportData.filter(r => r.status === 'Converted').length;
    const pendingCount = totalProv - convertedCount;
    const conversionRate = totalProv > 0 ? ((convertedCount / totalProv) * 100).toFixed(1) : '0.0';

    return {
        reportData,
        stats: {
            totalProv,
            convertedCount,
            pendingCount,
            conversionRate
        }
    };
};
