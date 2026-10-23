import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    // Fallback: If userProfile is missing from locals (hooks issue) but user exists, try to fetch it now.
    let currentRole = userProfile?.role;
    let currentProfile: any = userProfile;

    if (!currentRole) {
        console.warn('Student Load: User authenticated but profile missing in locals. Fetching directly...');
        const { data: profile } = await supabase
            .from('users')
            .select('id, role')
            .eq('id', authenticatedUser.id)
            .single();
        
        if (profile) {
            currentRole = profile.role;
            currentProfile = profile; // Use this as the profile
        }
    }

    if (currentRole !== 'student') {
        console.warn('Student Load: Role mismatch or profile not found. Role:', currentRole);
        throw redirect(303, '/login'); 
    }

    const profileId = currentProfile?.id || authenticatedUser.id;

    // Use Service Role to bypass RLS for documents if needed (as per local commit intent)
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Initialize default values
    let activeYears: any[] = [];
    let applications: any[] = [];
    let enabledForms: any[] = [];
    let formTypes: any[] = [];
    let availableCourses: any[] = [];
    let circulars: any[] = [];

    try {
        // Fetch independent data concurrently
        const [activeYearsResult, appsResult, enabledFormsResult, formTypesResult] = await Promise.all([
            supabase
                .from('academic_years')
                .select('id, name, admission_cycles(id, name, is_active)')
                .eq('is_active', true),
            supabaseAdmin
                .from('applications')
                .select(`
                    *,
                    courses(name),
                    branches(name),
                    admission_cycles(name, academic_years(name)),
                    account_admissions(admission_number),
                    merit_list_entries(merit_rank, merit_score),
                    documents(*),
                    payments(*)
                `)
                .eq('student_id', profileId),
            supabase
                .from('admission_forms')
                .select('course_id, cycle_id, form_type, is_enabled, is_merit_published')
                .eq('is_enabled', true),
            supabase
                .from('form_types')
                .select('name, student_can_apply')
        ]);

        // Handle results
        activeYears = activeYearsResult.data || [];
        applications = appsResult.data || [];
        enabledForms = enabledFormsResult.data || [];
        formTypes = formTypesResult.data || [];

        // Filter form types that students are allowed to apply for
        const allowedFormTypeNames = (formTypes || [])
            .filter(ft => ft.student_can_apply !== false)
            .map(ft => ft.name);

        // Filter enabled forms by allowed form types
        const allowedEnabledForms = (enabledForms || []).filter(f => 
            allowedFormTypeNames.includes(f.form_type)
        );

        // Get unique course IDs that have at least one allowed enabled form
        const enabledCourseIds = Array.from(new Set(allowedEnabledForms.map(f => f.course_id)));

        // Fetch courses
        if (enabledCourseIds.length > 0) {
            const { data: coursesData } = await supabase
                .from('courses')
                .select('id, name, code, colleges(name, universities(name))')
                .in('id', enabledCourseIds);
            availableCourses = coursesData || [];
        }

        const courseIds = applications?.map(a => a.course_id) || [];

        // Attach merit status and generate signed URLs for documents
        const appsWithMeritStatus = await Promise.all((applications?.map(async app => {
            const appFormType = app.form_type || 'MQ/NRI';
            const form = allowedEnabledForms?.find(f => 
                f.course_id === app.course_id && 
                f.cycle_id === app.cycle_id &&
                (f.form_type === appFormType || (!f.form_type && appFormType === 'MQ/NRI'))
            );
            
            const meritEntry = Array.isArray(app.merit_list_entries) 
                ? app.merit_list_entries[0] 
                : app.merit_list_entries;

            // Generate signed URLs for documents
            const documentsWithUrls = await Promise.all((app.documents || []).map(async (doc: any) => {
                let signedUrl = null;
                if (doc.file_path) {
                    const { data } = await supabase.storage
                        .from('documents')
                        .createSignedUrl(doc.file_path, 3600);
                    signedUrl = data?.signedUrl;
                }
                return { ...doc, signed_url: signedUrl };
            }));

            return {
                ...app,
                documents: documentsWithUrls,
                merit_rank: meritEntry?.merit_rank,
                is_merit_published: form?.is_merit_published || false
            };
        }) || []));

        // --- Fetch Active Circulars ---
        let circularQuery = supabase
            .from('circulars')
            .select('id, title, description, file_path, created_at, course_id, courses(name)')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (courseIds.length > 0) {
            circularQuery = circularQuery.or(`course_id.is.null,course_id.in.(${courseIds.join(',')})`);
        } else {
            circularQuery = circularQuery.is('course_id', null);
        }

        const { data: circularsData } = await circularQuery;
        circulars = circularsData || [];

        // Generate signed URLs for circulars
        const circularsWithUrls = await Promise.all((circulars || []).map(async (c) => {
            let signedUrl = null;
            if (c.file_path) {
                const { data } = await supabase
                    .storage
                    .from('circulars')
                    .createSignedUrl(c.file_path, 3600);
                signedUrl = data?.signedUrl || null;
            }
            return { ...c, signedUrl };
        }));

        // Filter applications to only show those where the corresponding form is enabled for students
        const visibleApplications = appsWithMeritStatus.filter(app => {
            const appFormType = app.form_type || 'MQ/NRI';
            return allowedEnabledForms.some(f => 
                f.course_id === app.course_id && 
                f.cycle_id === app.cycle_id &&
                (f.form_type === appFormType)
            );
        });

        return {
            applications: visibleApplications,
            activeYears: activeYears,
            availableCourses: availableCourses,
            circulars: circularsWithUrls || []
        };

    } catch (err) {
        console.error('Error in student dashboard load:', err);
        return {
            applications: [],
            activeYears: [],
            availableCourses: [],
            circulars: []
        };
    }
};
