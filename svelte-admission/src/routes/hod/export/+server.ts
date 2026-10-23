import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';
import * as XLSX from 'xlsx';

export const GET: RequestHandler = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== 'hod' || !userProfile?.branch_id) {
        return new Response('Unauthorized', { status: 401 });
    }

    const fieldsParam = url.searchParams.get('fields');
    const selectedFields = fieldsParam ? fieldsParam.split(',') : null;

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch HOD Department (Branch) details and college
    const { data: branchInfo } = await supabaseAdmin
        .from('branches')
        .select(`
            name, 
            code,
            courses(college_id)
        `)
        .eq('id', userProfile.branch_id)
        .single();

    // 2. Fetch students
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id,
            form_type,
            admission_type,
            submitted_at,
            form_data,
            branch_id,
            courses!inner(name, college_id, colleges(name)),
            branches(name, code),
            student_user:users!student_id(
                full_name, 
                email, 
                student_profiles(enrollment_number, admission_status, profile_data)
            ),
            account_admissions(admission_number),
            merit_list_entries(merit_score)
        `)
        .neq('status', 'draft');

    const hodScope: string = (userProfile as any).hod_scope || 'branch';
    const resolvedCollegeId = userProfile.college_id || (branchInfo?.courses as any)?.college_id;
    const isCollegeScope = hodScope === 'college' && resolvedCollegeId;

    if (isCollegeScope) {
        query = query.eq('courses.college_id', resolvedCollegeId);
    } else {
        query = query.eq('branch_id', userProfile.branch_id);
        // Apply the college filter
        query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');
    }

    const { data: applications } = await query;

    // Filter in-memory to only include final 'Admitted' students with college ID assigned
    // Filter in-memory to only include final 'Admitted' students with college ID assigned
    const admittedStudentsRaw = (applications || []).filter((app: any) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.admission_status === 'Admitted' && app.courses?.college_id;
    });

    // Apply active filters (form type, admission type, search query)
    const formTypeParam = url.searchParams.get('form_type') || 'all';
    const admissionTypeParam = url.searchParams.get('admission_type') || 'all';
    const searchParam = url.searchParams.get('search') || '';

    const admittedStudents = admittedStudentsRaw.filter((app: any) => {
        const studentName = app.student_user?.full_name || '';
        const studentEmail = app.student_user?.email || '';
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const enrollmentNo = profile?.enrollment_number || '';
        const admissions = app.account_admissions;
        const admissionEntry = Array.isArray(admissions) ? admissions[0] : admissions;
        const admissionNo = admissionEntry?.admission_number || '';

        const matchesSearch = searchParam.trim() === '' ? true : (
            studentName.toLowerCase().includes(searchParam.toLowerCase()) ||
            studentEmail.toLowerCase().includes(searchParam.toLowerCase()) ||
            enrollmentNo.toLowerCase().includes(searchParam.toLowerCase()) ||
            admissionNo.toLowerCase().includes(searchParam.toLowerCase())
        );

        const matchesForm = 
            formTypeParam === 'all' ? true :
            formTypeParam === 'exclude_provisional' ? app.form_type !== 'Provisional' :
            app.form_type === formTypeParam;

        const matchesAdmission = 
            admissionTypeParam === 'all' ? true :
            app.admission_type === admissionTypeParam;

        return matchesSearch && matchesForm && matchesAdmission;
    });

    if (admittedStudents.length === 0) {
        return new Response('No admitted student records found in your department to export.', { status: 404 });
    }

    // 3. Extract all dynamic form data keys across all records
    const dynamicKeys = new Set<string>();
    admittedStudents.forEach((app: any) => {
        if (app.form_data && typeof app.form_data === 'object') {
            Object.keys(app.form_data).forEach(k => dynamicKeys.add(k));
        }
    });
    const sortedDynamicKeys = Array.from(dynamicKeys).sort();

    // 4. Construct sheet rows
    const rows = admittedStudents.map((app: any, index: number) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const meritEntry = Array.isArray(app.merit_list_entries) ? app.merit_list_entries[0] : app.merit_list_entries;
        const admissionEntry = Array.isArray(app.account_admissions) ? app.account_admissions[0] : app.account_admissions;

        const profileData = profile?.profile_data || {};
        const pAddr = [
            profileData.p_address_line_1,
            profileData.p_address_line_2,
            profileData.p_city,
            profileData.p_state,
            profileData.p_zip_code
        ].filter(Boolean).join(', ') || '';
        const cAddr = [
            profileData.c_address_line_1,
            profileData.c_address_line_2,
            profileData.c_city,
            profileData.c_state,
            profileData.c_zip_code
        ].filter(Boolean).join(', ') || '';

        const fullRow: Record<string, any> = {
            'Sr. No': index + 1,
            'College Name': app.courses?.colleges?.name || 'N/A',
            'Branch': app.branches?.name || 'N/A',
            'College ID (Enrollment No)': profile?.enrollment_number || 'Pending',
            'Admission ID': admissionEntry?.admission_number || 'N/A',
            'Student Name': app.student_user?.full_name || '',
            'Email': app.student_user?.email || '',
            'Admission Status': profile?.admission_status || 'pending',
            'Form Type': app.form_type || '',
            'Admission Mode': app.admission_type || 'Regular',
            'Admitted Date': app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '',
            // Expose profile_data fields
            'Profile: Contact Number': profileData.contact_number || '',
            'Profile: Alternate Contact': profileData.alternate_contact_number || '',
            'Profile: Gender': profileData.gender || '',
            'Profile: Category': profileData.category || '',
            'Profile: Religion': profileData.religion || '',
            'Profile: Caste': profileData.caste || '',
            'Profile: Birth Date': profileData.birth_date || '',
            'Profile: Aadhar Card No': profileData.aadhar_card_number || '',
            'Profile: Father Name': profileData.father_full_name || '',
            'Profile: Father Contact': profileData.father_contact_number || '',
            'Profile: Mother Name': profileData.mother_full_name || '',
            'Profile: Mother Contact': profileData.mother_contact_number || '',
            'Profile: Permanent Address': pAddr,
            'Profile: Correspondence Address': cAddr
        };

        // Populate dynamic form keys
        sortedDynamicKeys.forEach(key => {
            const val = app.form_data?.[key];
            fullRow[`Form Field: ${key}`] = (val !== null && val !== undefined)
                ? (typeof val === 'object' ? JSON.stringify(val) : String(val))
                : '';
        });

        if (selectedFields) {
            const filteredRow: Record<string, any> = {};
            selectedFields.forEach(f => {
                filteredRow[f] = fullRow[f] !== undefined ? fullRow[f] : '';
            });
            return filteredRow;
        }

        return fullRow;
    });

    // 5. Build SheetJS Workbook
    const worksheet = selectedFields 
        ? XLSX.utils.json_to_sheet(rows, { header: selectedFields })
        : XLSX.utils.json_to_sheet(rows);
        
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Admitted Students');

    // 6. Generate binary Buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Admitted_Students_${(branchInfo?.name || 'Department').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new Response(excelBuffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });
};
