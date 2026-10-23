import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { evaluate, parse } from 'mathjs';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login'); // Redirect non-admin users
    }

    const courseId = url.searchParams.get('courseId');
    const cycleId = url.searchParams.get('cycleId');
    const formType = url.searchParams.get('formType');
    const search = url.searchParams.get('search');
    const sortBy = url.searchParams.get('sortBy') || 'merit_rank';
    const sortOrder = url.searchParams.get('sortOrder') || 'asc';

    // Use standard supabase client for metadata lookups
    const { data: courses } = await supabase.from('courses').select('id, name');
    const { data: cycles } = await supabase.from('admission_cycles').select('id, name');

    // Use Service Role ONLY for applications to bypass RLS
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch applications that are eligible for merit calculation
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id,
            status,
            application_fee_status,
            course_id,
            cycle_id,
            form_type,
            form_data,
            merit_list_entries(merit_score, merit_rank),
            users:users!applications_student_id_fkey(full_name, email),
            courses(id, name, colleges(name)),
            admission_cycles(name, academic_years(name))
        `)
        .or('status.in.("verified","approved","waitlisted"),and(status.eq.submitted,application_fee_status.eq.paid)');

    // Apply Filters
    if (courseId) query = query.eq('course_id', courseId);
    if (cycleId) query = query.eq('cycle_id', cycleId);
    if (formType) query = query.eq('form_type', formType);
    
    if (search) {
        // Search in users table
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: 'users!applications_student_id_fkey' });
    }

    const { data: applications, error: appError } = await query;

    if (appError) {
        console.error('Error fetching applications for merit calculation:', appError.message);
    }

    // Flatten the data for easier consumption in the frontend
    let flattenedApps = applications?.map(app => {
        const meritEntry = Array.isArray(app.merit_list_entries) ? app.merit_list_entries[0] : app.merit_list_entries;
        return {
            ...app,
            merit_score: meritEntry?.merit_score ?? null,
            merit_rank: meritEntry?.merit_rank ?? null
        };
    }) || [];

    // --- ENHANCEMENT: Pre-calculate preview scores if missing or zero ---
    const { data: formulaData } = await supabaseAdmin
        .from('merit_formulas')
        .select('rules_json, course_id, form_type');

    flattenedApps = flattenedApps.map(app => {
        if (app.merit_score && app.merit_score !== 0) return app;

        const formula = formulaData?.find(f => f.course_id === app.course_id && f.form_type === app.form_type);
        if (!formula || (formula.rules_json as any).mode !== 'expression') return app;

        try {
            const context: any = {};
            const flatten = (obj: any, prefix = '') => {
                for (const [key, val] of Object.entries(obj)) {
                    const newKey = prefix ? `${prefix}_${key}` : key;
                    if (typeof val === 'object' && val !== null && ('value' in val || 'max_score' in val)) {
                        if ('value' in val) context[newKey] = Number((val as any).value) || 0;
                        if ('max_score' in val) context[`${newKey}_max`] = Number((val as any).max_score) || 1;
                        else context[`${newKey}_max`] = context[`${newKey}_max`] || 100;
                    } else if (typeof val === 'object' && val !== null) {
                        flatten(val, newKey);
                    } else if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                        context[newKey] = Number(val);
                    }
                }
            };
            if (app.form_data) flatten(app.form_data);

            const rules = formula.rules_json as any;
            const node = parse(rules.expression);
            node.traverse((n: any) => {
                if (n.isSymbolNode) {
                    const isMathFunc = typeof (evaluate as any)[n.name] === 'function';
                    if (!isMathFunc && (!(n.name in context) || context[n.name] === 0)) {
                        if (n.name.endsWith('_max')) context[n.name] = 100;
                        else if (!(n.name in context)) context[n.name] = 0;
                    }
                }
            });

            const score = evaluate(rules.expression, context);
            return { ...app, preview_score: score };
        } catch (e) {
            return app;
        }
    });

    // Apply Sorting in-memory (Supabase JS client order() on foreign tables doesn't sort parent rows)
    if (sortBy === 'merit_rank' || sortBy === 'merit_score') {
        flattenedApps.sort((a, b) => {
            const valA = a[sortBy] !== null ? parseFloat(a[sortBy]) : null;
            const valB = b[sortBy] !== null ? parseFloat(b[sortBy]) : null;

            if (valA === null && valB === null) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default sort by status if not merit sorting
        flattenedApps.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
    }

    return {
        applications: flattenedApps,
        courses: courses || [],
        cycles: cycles || [],
        filters: { courseId, cycleId, formType, search, sortBy, sortOrder },
        message: appError ? `Error: ${appError.message}` : (applications?.length === 0 ? `No applications found. (Courses: ${courses?.length || 0}, Cycles: ${cycles?.length || 0})` : null)
    };
};

export const actions: Actions = {
    updateMeritScore: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const scoreStr = formData.get('merit_score') as string;
        const merit_score = parseFloat(scoreStr);

        if (!application_id || isNaN(merit_score)) {
             return fail(400, { message: 'Invalid application ID or Score', error: true });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error: updateError } = await supabaseAdmin
            .from('merit_list_entries')
            .update({ 
                merit_score: merit_score
            })
            .eq('application_id', application_id);

        if (updateError) {
            console.error('Error updating merit score:', updateError.message);
            return fail(500, { message: 'Failed to update merit score.', error: true });
        }

        return { success: true, message: `Merit score updated to ${merit_score.toFixed(5)}` };
    },

    recalculateRanks: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;
        const start_rank_str = formData.get('start_rank') as string;
        const start_rank = parseInt(start_rank_str) || 1;

        if (!course_id || !cycle_id) {
            return fail(400, { message: 'Course and Cycle ID are required to recalculate ranks.', error: true });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch the Formula first
        const { data: formula } = await supabaseAdmin
            .from('merit_formulas')
            .select('rules_json')
            .eq('course_id', course_id)
            .eq('form_type', form_type || 'Provisional')
            .maybeSingle();

        // Fetch ALL eligible applications
        const { data: apps, error: fetchError } = await supabaseAdmin
            .from('applications')
            .select(`
                id, 
                form_data,
                status,
                application_fee_status,
                submitted_at,
                merit_list_entries(merit_score)
            `)
            .eq('course_id', course_id)
            .eq('cycle_id', cycle_id)
            .eq('form_type', form_type || 'Provisional')
            .or('status.in.("verified","approved","waitlisted"),and(status.eq.submitted,application_fee_status.eq.paid)');

        if (fetchError) {
            console.error('Error fetching applications for ranking:', fetchError.message);
            return fail(500, { message: 'Failed to fetch applications.', error: true });
        }

        if (!apps || apps.length === 0) {
            return fail(404, { message: 'No applications found to rank.', error: true });
        }

        // Prepare scores and data for sorting
        const entriesToRank = apps.map(app => {
            const meritEntry = Array.isArray(app.merit_list_entries) ? app.merit_list_entries[0] : app.merit_list_entries;
            
            let score = 0;
            if (meritEntry && meritEntry.merit_score !== null && meritEntry.merit_score !== 0) {
                score = meritEntry.merit_score;
            } else if ((formula?.rules_json as any)?.mode === 'expression' && (formula.rules_json as any).expression) {
                // EVALUATE FORMULA
                try {
                    const context: any = {};
                    const flatten = (obj: any, prefix = '') => {
                        for (const [key, val] of Object.entries(obj)) {
                            const newKey = prefix ? `${prefix}_${key}` : key;
                            if (typeof val === 'object' && val !== null && ('value' in val || 'max_score' in val)) {
                                if ('value' in val) context[newKey] = Number((val as any).value) || 0;
                                if ('max_score' in val) context[`${newKey}_max`] = Number((val as any).max_score) || 1;
                                else context[`${newKey}_max`] = context[`${newKey}_max`] || 100;
                            } else if (typeof val === 'object' && val !== null) {
                                flatten(val, newKey);
                            } else if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                                context[newKey] = Number(val);
                            }
                        }
                    };
                    if (app.form_data) flatten(app.form_data);

                    const rules = formula.rules_json as any;
                    const node = parse(rules.expression);
                    node.traverse((n: any) => {
                        if (n.isSymbolNode) {
                            const isMathFunc = typeof (evaluate as any)[n.name] === 'function';
                            if (!isMathFunc && (!(n.name in context) || context[n.name] === 0)) {
                                if (n.name.endsWith('_max')) context[n.name] = 100;
                                else if (!(n.name in context)) context[n.name] = 0;
                            }
                        }
                    });
                    score = evaluate(rules.expression, context);
                } catch (e) {
                    score = 0;
                }
            } else if (app.form_data) {
                // Fallback to legacy keys
                const rawScore = (app.form_data as any)['merit_score'] || (app.form_data as any)['total_percentage'] || 0;
                score = parseFloat(rawScore);
            }

            return {
                application_id: app.id,
                merit_score: score || 0,
                submitted_at: app.submitted_at
            };
        });

        // Sort by Score (Descending), then by submitted_at (Ascending)
        entriesToRank.sort((a, b) => {
            if (b.merit_score !== a.merit_score) {
                return b.merit_score - a.merit_score;
            }
            return new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime();
        });

        // Assign new ranks
        const updates = entriesToRank.map((entry, index) => ({
            application_id: entry.application_id,
            merit_score: entry.merit_score,
            merit_rank: start_rank + index,
            created_at: new Date().toISOString()
        }));

        // Batch update using upsert
        const { error: updateError } = await supabaseAdmin
            .from('merit_list_entries')
            .upsert(updates, { onConflict: 'application_id' });

        if (updateError) {
            console.error('Error updating ranks:', updateError.message);
            return fail(500, { message: 'Failed to update ranks.', error: true });
        }

        return { success: true, message: `Successfully recalculated ranks for ${updates.length} applications starting from #${start_rank}.` };
    }
};