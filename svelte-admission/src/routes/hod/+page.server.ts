import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== 'hod' || !userProfile?.branch_id) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const hodScope: string = (userProfile as any).hod_scope || 'branch';

    // 1. Fetch HOD's assigned branch details
    const { data: branchInfo, error: branchError } = await supabaseAdmin
        .from('branches')
        .select(`
            id,
            name, 
            code,
            courses(
                id,
                name, 
                code,
                college_id,
                colleges(id, name, university_id, universities(id, name))
            )
        `)
        .eq('id', userProfile.branch_id)
        .single();

    if (branchError || !branchInfo) {
        console.error('HOD Load Error: Department info not found.', branchError);
        return {
            department: { branchName: 'Unknown', courseName: 'N/A', collegeName: 'N/A', hodScope },
            students: [],
            filterOptions: { colleges: [], courses: [], branches: [] },
            error: 'Department configuration missing.'
        };
    }

    const branchCourse = branchInfo.courses as any;
    const branchCollege = branchCourse?.colleges as any;
    const branchUniversity = branchCollege?.universities as any;

    const resolvedCollegeId = userProfile.college_id || branchCourse?.college_id;
    const resolvedUniversityId = userProfile.university_id || branchCollege?.university_id;

    const isCollegeScope = hodScope === 'college' && resolvedCollegeId;
    const isUniversityScope = hodScope === 'university';

    // 2. Build filter options based on scope
    let filterColleges: any[] = [];
    let filterCourses: any[] = [];
    let filterBranches: any[] = [];

    if (isCollegeScope && resolvedCollegeId) {
        // Fetch all courses under the HOD's college
        const { data: courses } = await supabaseAdmin
            .from('courses')
            .select('id, name, code')
            .eq('college_id', resolvedCollegeId)
            .order('name');

        filterCourses = courses || [];

        // Fetch all branches under those courses
        if (filterCourses.length > 0) {
            const courseIds = filterCourses.map((c: any) => c.id);
            const { data: branches } = await supabaseAdmin
                .from('branches')
                .select('id, name, code, course_id')
                .in('course_id', courseIds)
                .order('name');
            filterBranches = branches || [];
        }
    } else if (isUniversityScope) {
        // Fetch colleges under the HOD's university (derive from their branch's college's university)
        const universityId = resolvedUniversityId || branchUniversity?.id;
        if (universityId) {
            const { data: colleges } = await supabaseAdmin
                .from('colleges')
                .select('id, name')
                .eq('university_id', universityId)
                .order('name');
            filterColleges = colleges || [];

            // Fetch all courses & branches across all those colleges
            if (filterColleges.length > 0) {
                const collegeIds = filterColleges.map((c: any) => c.id);
                const { data: courses } = await supabaseAdmin
                    .from('courses')
                    .select('id, name, code, college_id')
                    .in('college_id', collegeIds)
                    .order('name');
                filterCourses = courses || [];

                if (filterCourses.length > 0) {
                    const courseIds = filterCourses.map((c: any) => c.id);
                    const { data: branches } = await supabaseAdmin
                        .from('branches')
                        .select('id, name, code, course_id')
                        .in('course_id', courseIds)
                        .order('name');
                    filterBranches = branches || [];
                }
            }
        }
    }

    // 3. Query applications
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id,
            status,
            form_type,
            admission_type,
            submitted_at,
            form_data,
            branch_id,
            course_id,
            courses!inner(id, name, code, college_id, colleges(id, name)),
            branches(id, name, code),
            student_user:users!student_id(
                full_name, 
                email, 
                student_profiles(enrollment_number, admission_status, profile_data)
            ),
            account_admissions(admission_number),
            merit_list_entries(merit_score)
        `)
        .neq('status', 'draft');

    if (isUniversityScope) {
        // University-wide: all apps (apply no college/branch restriction; RLS handles it)
        // If branch info has a university, restrict to it — but typically global
        query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');
    } else if (isCollegeScope) {
        query = query.eq('courses.college_id', resolvedCollegeId);
    } else {
        // Branch-scoped HOD
        query = query.eq('branch_id', userProfile.branch_id);
        query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');
    }

    const { data: applications, error: appsError } = await query;
    if (appsError) console.error('HOD Load Error: Applications query failed.', appsError);

    // 4. Map to flat student records
    const admittedStudents = (applications || [])
        .filter((app: any) => app.courses?.college_id)
        .map((app: any, index: number) => {
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

            return {
                srNo: index + 1,
                id: app.id,
                fullName: app.student_user?.full_name || 'N/A',
                email: app.student_user?.email || 'N/A',
                contactNumber: profileData.contact_number || '',
                city: profileData.p_city || profileData.c_city || '',
                enrollmentNumber: profile?.enrollment_number || 'Pending',
                admissionNumber: admissionEntry?.admission_number || 'N/A',
                admissionStatus: profile?.admission_status || 'pending',
                applicationStatus: app.status || 'N/A',
                branchId: app.branches?.id || '',
                branchName: app.branches?.name || 'N/A',
                courseId: app.courses?.id || '',
                courseName: app.courses?.name || 'N/A',
                courseCode: app.courses?.code || '',
                collegeId: app.courses?.college_id || '',
                collegeName: app.courses?.colleges?.name || 'N/A',
                meritScore: meritEntry?.merit_score || 'N/A',
                formType: app.form_type || 'N/A',
                admissionType: app.admission_type || 'Regular',
                submittedAt: app.submitted_at,
                formData: app.form_data,
                profileFields: {
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
                }
            };
        });

    const courseName = branchCourse?.name || 'N/A';
    const collegeName = branchCollege?.name || (userProfile.college_id ? 'N/A' : 'All Colleges');
    const universityName = branchUniversity?.name || '';

    return {
        department: {
            branchName: branchInfo?.name || 'N/A',
            courseName,
            collegeName,
            universityName,
            hodScope
        },
        students: admittedStudents,
        filterOptions: {
            colleges: filterColleges,
            courses: filterCourses,
            branches: filterBranches
        }
    };
};
