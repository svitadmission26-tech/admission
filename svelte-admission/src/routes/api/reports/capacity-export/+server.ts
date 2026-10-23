import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { userProfile } }) => {
    // 1. Security Check
    if (!userProfile || (userProfile.role !== 'adm_officer' && userProfile.role !== 'admin')) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use Service Role for comprehensive aggregation
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    try {
        // 2. Fetch all Courses and Branches with Intake Capacity
        // If the user is an adm_officer, they should only see data for their college.
        let coursesQuery = supabaseAdmin
            .from('courses')
            .select('id, name, intake_capacity, branches(id, name, intake_capacity)');
        
        if (userProfile.role === 'adm_officer' && userProfile.college_id) {
            coursesQuery = coursesQuery.eq('college_id', userProfile.college_id);
        }

        const { data: courses, error: coursesError } = await coursesQuery;
        if (coursesError) throw coursesError;

        // 3. Fetch Approved Applications count per branch
        const { data: appCounts, error: appError } = await supabaseAdmin
            .from('applications')
            .select('branch_id, id')
            .eq('status', 'approved');
        
        if (appError) throw appError;

        // 4. Fetch Admissions Done count (account_admissions) per branch
        const { data: admCounts, error: admError } = await supabaseAdmin
            .from('account_admissions')
            .select('id, applications(branch_id)');
        
        if (admError) throw admError;

        // 5. Aggregate metrics
        const approvedMap: Record<string, number> = {};
        appCounts?.forEach(app => {
            if (app.branch_id) {
                approvedMap[app.branch_id] = (approvedMap[app.branch_id] || 0) + 1;
            }
        });

        const admissionsMap: Record<string, number> = {};
        admCounts?.forEach(adm => {
            const branchId = (adm.applications as any)?.branch_id;
            if (branchId) {
                admissionsMap[branchId] = (admissionsMap[branchId] || 0) + 1;
            }
        });

        // 6. Format for the report
        const reportData = courses.map(course => {
            return {
                courseName: course.name,
                branches: course.branches?.map((branch: any) => ({
                    name: branch.name,
                    capacity: branch.intake_capacity || 0,
                    approved: approvedMap[branch.id] || 0,
                    admissions: admissionsMap[branch.id] || 0
                })) || []
            };
        });

        return json(reportData);
    } catch (e: any) {
        console.error('Capacity Export API Error:', e);
        return json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
};
