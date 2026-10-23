import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluate, parse } from 'mathjs';

/**
 * Calculates merit scores for all verified applications in a specific course and cycle.
 * Then assigns ranks based on the scores.
 */
export async function calculateAndRankMerit(
    supabase: SupabaseClient, 
    courseId: string, 
    cycleId: string,
    formType: string = 'Provisional', // Default
    targetStatus: string = 'verified' // New parameter
) {
    console.log(`Starting Merit Calculation for Course: ${courseId}, Cycle: ${cycleId}, Type: ${formType}, Target: ${targetStatus}`);

    // 1. Fetch Applications based on Target Status
    let query = supabase
        .from('applications')
        .select(`
            id, 
            student_id, 
            form_data,
            submitted_at,
            marks (*)
        `)
        .eq('course_id', courseId)
        .eq('cycle_id', cycleId)
        .eq('form_type', formType)
        .eq('application_fee_status', 'paid'); // STRICTURE: Must be paid

    if (targetStatus === 'verified') {
        // 'Verified' pool includes verified, approved, and waitlisted applications
        query = query.in('status', ['verified', 'approved', 'waitlisted']);
    } else if (targetStatus === 'submitted_paid') {
        query = query.eq('status', 'submitted');
    } else if (targetStatus === 'both') {
        query = query.in('status', ['verified', 'approved', 'waitlisted', 'submitted']);
    } else {
        // Fallback to verified pool
        query = query.in('status', ['verified', 'approved', 'waitlisted']);
    }

    const { data: applications, error: appError } = await query;

    if (appError) {
        console.error('Error fetching applications for merit list:', appError.message);
        return { success: false, message: 'Failed to fetch applications.' };
    }

    console.log(`Found ${applications?.length || 0} applications matching criteria.`);

    if (!applications || applications.length === 0) {
        return { success: true, message: `No applications found to process for target: ${targetStatus}.` };
    }

    // --- STEP: Clear existing ranks for this cohort to prevent stale/duplicate ranks ---
    // Fetch ALL application IDs for this cohort (regardless of current status) to clear them
    const { data: appsToClear } = await supabase
        .from('applications')
        .select('id')
        .eq('course_id', courseId)
        .eq('cycle_id', cycleId)
        .eq('form_type', formType);

    if (appsToClear && appsToClear.length > 0) {
        const clearIds = appsToClear.map(a => a.id);
        console.log(`Clearing ${clearIds.length} existing merit entries...`);
        // Batch delete from merit_list_entries
        for (let i = 0; i < clearIds.length; i += 500) {
            const chunk = clearIds.slice(i, i + 500);
            await supabase.from('merit_list_entries').delete().in('application_id', chunk);
        }
        console.log(`Cleared ${clearIds.length} existing merit entries for Course: ${courseId}, Cycle: ${cycleId}, Type: ${formType}`);
    }

    // 2. Fetch Merit Formula
    const { data: formulaData, error: formulaError } = await supabase
        .from('merit_formulas')
        .select('rules_json')
        .eq('course_id', courseId)
        .eq('form_type', formType)
        .maybeSingle();

    if (formulaError) {
        console.error('Error fetching formula:', formulaError.message);
    }
    console.log(`Formula found: ${formulaData ? 'Yes' : 'No (Fallback to form_data)'}`);

    // Default formula if none exists (e.g., just sum of marks or straight percentage)
    // For now, we assume a simple 'total_percentage' if available in form_data, or 0.
    const rules = formulaData?.rules_json || {};

    // 3. Calculate Scores
    const updates = [];
    for (const app of applications) {
        let score = 0;

        // --- CALCULATION LOGIC ---
        
        // C. Expression Mode (New)
        if (rules.mode === 'expression' && rules.expression) {
            try {
                // Build Context
                const context: any = {};
                
                // PREFERRED: Build context from form_data directly as it has the keys
                if (app.form_data) {
                    const flattenContext = (obj: any, prefix = '') => {
                        for (const [key, val] of Object.entries(obj)) {
                            const newKey = prefix ? `${prefix}_${key}` : key;
                            if (typeof val === 'object' && val !== null && ('value' in val || 'max_score' in val)) {
                                // Structured Merit Field (even if one part is missing)
                                if ('value' in val) {
                                    context[newKey] = Number(val.value) || 0;
                                }
                                if ('max_score' in val) {
                                    context[`${newKey}_max`] = Number(val.max_score) || 1;
                                } else {
                                    // Fallback if max_score is missing but value is present
                                    context[`${newKey}_max`] = context[`${newKey}_max`] || 100;
                                }
                            } else if (typeof val === 'object' && val !== null) {
                                // Nested datagrid or object
                                flattenContext(val, newKey);
                            } else if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                                // Simple field
                                context[newKey] = Number(val);
                            }
                        }
                    };
                    flattenContext(app.form_data);
                }

                // SECURITY: Pre-parse the expression and ensure all symbols exist in context
                // This prevents "Undefined symbol" errors if some apps are missing fields
                const node = parse(rules.expression);
                if (node) {
                    node.traverse((n: any) => {
                        if (n.isSymbolNode) {
                            const isMathFunc = typeof (evaluate as any)[n.name] === 'function';
                            if (!isMathFunc) {
                                // If missing OR zero (to prevent division by zero), set defaults
                                if (!(n.name in context) || context[n.name] === 0) {
                                    if (n.name.endsWith('_max')) {
                                        context[n.name] = 100; // Default max score to 100
                                    } else if (!(n.name in context)) {
                                        context[n.name] = 0; // Default score to 0
                                    }
                                }
                            }
                        }
                    });
                }

                score = evaluate(rules.expression, context);
                if (isNaN(score) || !isFinite(score)) {
                    console.warn(`Evaluation returned invalid result (${score}) for app ${app.id}.`);
                    score = 0;
                }
            } catch (e: any) {
                console.error(`Error evaluating formula for app ${app.id}:`, e.message);
                score = 0;
            }
        }
        
        // B. Weighted Average (Legacy)
        // If rules exist, e.g., { "weight_hsc": 0.6, "weight_entrance": 0.4 }
        else if (Object.keys(rules).length > 0 && rules.mode !== 'expression') {
             // ... implementation of weighted average ...
             // Iterate through rules keys starting with "weight_"
             for (const [rKey, weight] of Object.entries(rules)) {
                 if (rKey.startsWith('weight_')) {
                     const fieldKey = rKey.replace('weight_', '');
                     let fieldVal = 0;
                     
                     // Try to find value in form_data
                     if (app.form_data && app.form_data[fieldKey]) {
                         const raw = app.form_data[fieldKey];
                         if (typeof raw === 'object' && raw.value) {
                             fieldVal = Number(raw.value);
                         } else {
                             fieldVal = Number(raw);
                         }
                     }
                     
                     if (!isNaN(fieldVal)) {
                         score += fieldVal * (Number(weight) || 0);
                     }
                 }
             }
        }
        // A. Fallback: Check form_data for direct score 
        else if (app.form_data && (app.form_data['merit_score'] || app.form_data['total_percentage'])) {
            score = parseFloat(app.form_data['merit_score'] || app.form_data['total_percentage']);
        } 

        // Ensure score is a number
        if (isNaN(score)) score = 0;

        updates.push({ 
            id: app.id, 
            merit_score: score,
            submitted_at: app.submitted_at || new Date().toISOString()
        });
    }

    console.log(`Calculated scores for ${updates.length} applications.`);

    // 4. Sort by Score (Descending) to determine Rank
    // TIE BREAKER: If scores are equal, earlier submission (submitted_at) wins.
    updates.sort((a, b) => {
        if (b.merit_score !== a.merit_score) {
            return b.merit_score - a.merit_score;
        }
        // Earlier date is "smaller", so a - b for ascending order
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    });

    // 5. Update Database (Batch or Loop)
    // We update both score and rank in the new table
    let rank = 1;
    let successCount = 0;
    for (const update of updates) {
        const { error } = await supabase
            .from('merit_list_entries')
            .upsert({ 
                application_id: update.id,
                merit_score: update.merit_score,
                merit_rank: rank,
                created_at: new Date().toISOString()
            }, { onConflict: 'application_id' });
        
        if (error) {
            console.error(`Failed to update merit for app ${update.id}:`, error.message);
        } else {
            successCount++;
        }
        rank++;
    }

    console.log(`Successfully assigned ranks to ${successCount} entries.`);
    return { 
        success: true, 
        message: `Successfully calculated and ranked ${successCount} applications.`,
        details: {
            total_found: applications.length,
            ranked: successCount,
            skipped: applications.length - successCount
        }
    };
}
