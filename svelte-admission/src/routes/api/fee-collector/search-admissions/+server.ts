import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const GET: RequestHandler = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const user = await getAuthenticatedUser();
    if (!user || userProfile?.role !== 'fee_collector') {
        throw error(401, 'Unauthorized');
    }

    const search = url.searchParams.get('q') || '';
    
    let query = supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications!inner(
                id,
                status,
                student_user:users!applications_student_id_fkey(full_name, email),
                course_id,
                cycle_id,
                form_type,
                admission_type,
                assigned_fee_scheme_id,
                courses!inner(name, college_id),
                admission_cycles(academic_year_id)
            )
        `)
        .neq('applications.status', 'cancelled');

    if (search) {
        query = query.or(`admission_number.ilike.%${search}%,applications.student_user.full_name.ilike.%${search}%,applications.student_user.email.ilike.%${search}%`);
    }

    query = applyRoleBasedCollegeFilter(query, userProfile, 'admissions');

    const { data: rawAdmissions, error: dbError } = await query
        .order('created_at', { ascending: false })
        .limit(50);

    if (dbError) {
        console.error('Error searching admissions:', dbError.message);
        throw error(500, dbError.message);
    }

    // Fetch form types mappings to filter out provisional forms
    const { data: formTypes } = await supabase.from('form_types').select('name, is_prov');
    const formTypesMap = new Map((formTypes || []).map(ft => [ft.name, ft.is_prov]));

    const admissions = rawAdmissions?.filter(adm => {
        const formType = (adm.applications as any)?.form_type;
        const isProv = formTypesMap.get(formType) || false;
        return !isProv;
    }) || [];

    return json(admissions);
};
