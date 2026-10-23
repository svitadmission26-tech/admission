import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'college_auth') {
        throw redirect(303, '/login');
    }

    if (!userProfile.college_id) {
        return {
            error: 'No college assigned to this user.',
            stats: null,
            seatMatrix: []
        };
    }

    const collegeId = userProfile.college_id;

    // 1. Fetch Courses and Branches for this college
    // We need intake_capacity.
    // Note: We assume the migration 20260205120000_add_intake_capacity.sql has been run.
    // If not, this might fail or return null for intake_capacity.
    const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select(`
            id, name, code, intake_capacity,
            branches (id, name, code, intake_capacity)
        `)
        .eq('college_id', collegeId);

    if (coursesError) {
        console.error('Error fetching courses:', coursesError.message);
    }

    // 2. Fetch Applications Summary for this college
    // We can't easily filter by college_id directly on applications without joining.
    // Efficient way: Get all course_ids for this college first (we have them in 'courses'),
    // then query applications.
    const courseIds = courses?.map(c => c.id) || [];

    const { data: applications, error: appError } = await supabase
        .from('applications')
        .select('id, status, course_id, branch_id')
        .in('course_id', courseIds);

    if (appError) {
        console.error('Error fetching applications:', appError.message);
    }

    // 3. Process Data for Dashboard

    // A. Overall Stats
    const stats = {
        total: 0,
        pending: 0,
        verified: 0,
        approved: 0,
        rejected: 0,
        submitted: 0,
        needs_correction: 0
    };

    // B. Seat Matrix Map (CourseID -> { admitted: 0, branches: { BranchID -> admitted: 0 } })
    const admissionCounts: Record<string, { total: number, branches: Record<string, number> }> = {};

    // Initialize counts
    courses?.forEach(c => {
        admissionCounts[c.id] = { total: 0, branches: {} };
        c.branches?.forEach(b => {
            admissionCounts[c.id].branches[b.id] = 0;
        });
    });

    applications?.forEach(app => {
        stats.total++;
        if (app.status === 'draft') return; // Don't count drafts in operational stats usually, but maybe 'total' should? Let's keep total as all.
        
        // Update status counts
        if (stats.hasOwnProperty(app.status)) {
            stats[app.status as keyof typeof stats]++;
        } else if (app.status === 'waitlisted') {
             // maybe group waitlisted with verified or separate? let's ignore for simple stats or add if needed
        }

        // Count Admitted Students (Status = 'approved') for Seat Matrix
        if (app.status === 'approved') {
            if (admissionCounts[app.course_id]) {
                admissionCounts[app.course_id].total++;
                if (app.branch_id && admissionCounts[app.course_id].branches[app.branch_id] !== undefined) {
                    admissionCounts[app.course_id].branches[app.branch_id]++;
                }
            }
        }
    });

    // 4. Construct Seat Matrix Data Structure for Frontend
    const seatMatrix = courses?.map(course => {
        const hasBranches = course.branches && course.branches.length > 0;
        const rows = [];

        if (hasBranches) {
            // If branches exist, listing only branches
            course.branches.forEach(branch => {
                const admitted = admissionCounts[course.id]?.branches[branch.id] || 0;
                const capacity = branch.intake_capacity || 0;
                rows.push({
                    type: 'Branch',
                    courseName: course.name,
                    name: branch.name,
                    capacity: capacity,
                    admitted: admitted,
                    vacancy: Math.max(0, capacity - admitted),
                    utilization: capacity > 0 ? (admitted / capacity) * 100 : 0
                });
            });
        } else {
            // Course only
            const admitted = admissionCounts[course.id]?.total || 0;
            const capacity = course.intake_capacity || 0;
            rows.push({
                type: 'Course',
                courseName: course.name,
                name: '-',
                capacity: capacity,
                admitted: admitted,
                vacancy: Math.max(0, capacity - admitted),
                utilization: capacity > 0 ? (admitted / capacity) * 100 : 0
            });
        }
        return rows;
    }).flat();

    return {
        stats,
        seatMatrix
    };
};
