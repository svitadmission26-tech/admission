import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { applicationId } = await request.json();

    if (!applicationId) {
        return json({ error: 'Missing applicationId' }, { status: 400 });
    }

    try {
        console.log('[API] Fetching data for ID:', applicationId);
        
        // 1. Primary Fetch with joins
        let { data: appData, error: appError } = await supabaseAdmin
            .from('applications')
            .select(`
                *,
                course:courses(
                    *,
                    college:colleges(
                        *,
                        university:universities(*)
                    )
                ),
                branch:branches(*),
                admission_cycles(*, academic_years(*)),
                student:users!applications_student_id_fkey(
                    id, full_name, email,
                    student_profiles(*)
                ),
                marks(*),
                account_admissions(*),
                payments(*),
                admission_forms:public_admission_forms_fkey(*)
            `)
            .eq('id', applicationId)
            .single();

        if (appError || !appData) {
            console.error('[API] Primary Data fetch error:', appError);
            // Try to fetch application without joins if primary failed
            const { data: retryData } = await supabaseAdmin.from('applications').select('*').eq('id', applicationId).single();
            if (retryData) {
                appData = retryData;
            } else {
                return json({ error: 'Failed to fetch application data' }, { status: 500 });
            }
        }

        // 2. Fallback Fetches for missing relations
        if (appData) {
            // Student Fallback
            if (!appData.student && appData.student_id) {
                const { data: student } = await supabaseAdmin
                    .from('users')
                    .select('id, full_name, email, student_profiles(*)')
                    .eq('id', appData.student_id)
                    .single();
                if (student) appData.student = student;
            }
            
            // Course/College Fallback
            if (!appData.course && appData.course_id) {
                const { data: course } = await supabaseAdmin
                    .from('courses')
                    .select('*, college:colleges(*, university:universities(*))')
                    .eq('id', appData.course_id)
                    .single();
                if (course) appData.course = course;
            }

            // Branch Fallback
            if (!appData.branch && appData.branch_id) {
                const { data: branch } = await supabaseAdmin
                    .from('branches')
                    .select('*')
                    .eq('id', appData.branch_id)
                    .single();
                if (branch) appData.branch = branch;
            }

            // Admission Cycle Fallback
            if (!appData.admission_cycles && appData.cycle_id) {
                const { data: cycle } = await supabaseAdmin
                    .from('admission_cycles')
                    .select('*, academic_years(*)')
                    .eq('id', appData.cycle_id)
                    .single();
                if (cycle) appData.admission_cycles = cycle;
            }

            // NEW: Admission Form Fallback for schema
            if (!appData.admission_forms) {
                const { data: form } = await supabaseAdmin
                    .from('admission_forms')
                    .select('*')
                    .eq('course_id', appData.course_id)
                    .eq('cycle_id', appData.cycle_id)
                    .eq('form_type', appData.form_type)
                    .limit(1)
                    .maybeSingle();
                if (form) appData.admission_forms = form;
            }
        }

        console.log('[API] Data resolution complete');

        // Extract relevant payment receipt
        const isProvType = (appData.form_type || '').toLowerCase().includes('provisional');
        const payment = (appData.payments || []).find((p: any) => 
            (p.payment_type || '').toLowerCase() === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number
        ) || (appData.payments || []).find((p: any) => p.receipt_number);

        // Structure the data
        const studentUser = appData.student;
        const profileObj = Array.isArray(studentUser?.student_profiles) 
            ? studentUser.student_profiles[0] 
            : studentUser?.student_profiles;
            
        const profileData = (profileObj?.profile_data && typeof profileObj.profile_data === 'object') ? profileObj.profile_data : {};
        const marksData = appData.marks || [];
        const formData = (appData.form_data && typeof appData.form_data === 'object') ? appData.form_data : {};

        // NEW: Enhanced Reconstruction from Schema + FormData
        let reconstructedBoardMarks = [];
        let reconstructedEntranceMarks = [];

        const schema = appData.admission_forms?.schema_json || appData.course?.admission_forms?.schema_json;
        if (schema && schema.fields && schema.sections) {
            const meritSections = schema.sections.filter((s: any) => 
                s.layout === 'table' && s.tableColumns?.some((c: any) => c.is_merit)
            );

            schema.fields.forEach((f: any) => {
                const section = meritSections.find((s: any) => s.id === f.sectionId);
                const sectionTitle = (section?.title || '').toLowerCase();
                const isEntranceSection = sectionTitle.includes('entrance') || sectionTitle.includes('gujcet') || f.key.includes('gujcet');

                // Logic: 
                // 1. If it's an entrance section, include if in datagrid (user wants all entrance subjects)
                // 2. If it's board marks, ONLY include if explicitly marked as is_merit
                if (f.inDatagrid !== false) {
                    const markItem: any = {
                        subject: f.label,
                        subject_key: f.key,
                        score: 0,
                        max_score: f.max_score || 0 // Start at 0 to allow sum
                    };

                    // Extract column defaults from section for theory/practical
                    if (section && section.tableColumns) {
                        const theoryCol = section.tableColumns.find((c: any) => c.key === 'theory' || c.label?.toLowerCase().includes('theory'));
                        const practicalCol = section.tableColumns.find((c: any) => c.key === 'practical' || c.label?.toLowerCase().includes('practical'));
                        if (theoryCol) markItem.theory_max = theoryCol.default_max_score || theoryCol.max_score;
                        if (practicalCol) markItem.practical_max = practicalCol.default_max_score || practicalCol.max_score;
                    }

                    if (isEntranceSection) {
                        reconstructedEntranceMarks.push(markItem);
                    } else if (section || f.is_merit === true) { // Include all board subjects from table layout sections, plus any other explicit merit fields
                        reconstructedBoardMarks.push(markItem);
                    }
                }
            });
        }

        // Merge DB marks with reconstructed schema board marks to ensure all subjects are present
        let baseMarksForEnhancement = [...reconstructedBoardMarks];
        if (marksData.length > 0) {
            marksData.forEach((dbMark: any) => {
                const existingIndex = baseMarksForEnhancement.findIndex(m => 
                    (m.subject_key && m.subject_key === dbMark.subject_key) || 
                    (m.subject && m.subject.toLowerCase() === dbMark.subject?.toLowerCase())
                );
                if (existingIndex > -1) {
                    baseMarksForEnhancement[existingIndex] = {
                        ...baseMarksForEnhancement[existingIndex],
                        ...dbMark,
                        subject_key: baseMarksForEnhancement[existingIndex].subject_key || dbMark.subject_key
                    };
                } else {
                    baseMarksForEnhancement.push(dbMark);
                }
            });
        }
        
        // NEW: Map schema defaults by subject key AND lowercased label for easy lookup
        const schemaDefaults: Record<string, any> = {};
        reconstructedBoardMarks.forEach(m => {
            if (m.subject_key) schemaDefaults[m.subject_key] = m;
            if (m.subject) schemaDefaults[m.subject.toLowerCase()] = m;
        });

        // NEW: Enhance marksData with granular fields from formData for dynamic tables
        const enhancedMarksData = baseMarksForEnhancement.map((m: any) => {
            const enhanced = { ...m };
            const subjectKey = m.subject_key || m.key;
            const subjectLower = (m.subject || '').toLowerCase();
            
            // Apply schema defaults first as baseline (try key then label)
            const defaults = schemaDefaults[subjectKey] || schemaDefaults[subjectLower] || {};
            enhanced.theory_max = enhanced.theory_max || defaults.theory_max;
            enhanced.practical_max = enhanced.practical_max || defaults.practical_max;
            if (enhanced.max_score === 0) enhanced.max_score = defaults.max_score;

            // Look for matching key in formData (subjects often mapped to keys)
            let nestedData = formData[subjectKey] || formData[m.subject] || formData[subjectLower];
            
            // Fuzzy match for common subjects if no direct key match
            if (!nestedData) {
                if (subjectLower.includes('physics')) nestedData = formData.physics;
                else if (subjectLower.includes('math')) nestedData = formData.math || formData.mathematics;
                else if (subjectLower.includes('chemistry')) nestedData = formData.chemistry;
                else if (subjectLower.includes('computer')) nestedData = formData.computer;
                else if (subjectLower.includes('english')) nestedData = formData.english;
                else if (subjectLower.includes('gujarati')) nestedData = formData.gujarati;
                else if (subjectLower.includes('science')) nestedData = formData.science;
            }

            if (nestedData && typeof nestedData === 'object') {
                // Extract Theory
                const theory = nestedData.theory || nestedData.theory_score || nestedData.theory_marks;
                if (theory && typeof theory === 'object') {
                    enhanced.theory_obtained = theory.value;
                    if (theory.max_score || theory.max) enhanced.theory_max = theory.max_score || theory.max;
                } else if (nestedData.theory_obtained !== undefined) {
                    enhanced.theory_obtained = nestedData.theory_obtained;
                    if (nestedData.theory_max) enhanced.theory_max = nestedData.theory_max;
                }

                // Extract Practical
                const practical = nestedData.practical || nestedData.practical_score || nestedData.practical_marks;
                if (practical && typeof practical === 'object') {
                    enhanced.practical_obtained = practical.value;
                    if (practical.max_score || practical.max) enhanced.practical_max = practical.max_score || practical.max;
                } else if (nestedData.practical_obtained !== undefined) {
                    enhanced.practical_obtained = nestedData.practical_obtained;
                    if (nestedData.practical_max) enhanced.practical_max = nestedData.practical_max;
                }

                // Extract Generic 'obtained' (often used in entrance marks)
                const generic = nestedData.obtained || nestedData.value || nestedData.gujcet;
                if (generic && typeof generic === 'object') {
                    enhanced.obtained = generic.value;
                    enhanced.total = generic.max_score || generic.max || 100;
                } else {
                    enhanced.obtained = nestedData.obtained || nestedData.value;
                    enhanced.total = nestedData.total || nestedData.max_score;
                }

                // NEW: If top-level score is missing or 0, but theory/practical exist, sum them up
                const tScore = Number(enhanced.theory_obtained || 0);
                const pScore = Number(enhanced.practical_obtained || 0);
                const tMax = Number(enhanced.theory_max || 0);
                const pMax = Number(enhanced.practical_max || 0);

                if ((enhanced.score === 0 || enhanced.score === undefined) && (tScore > 0 || pScore > 0)) {
                    enhanced.score = tScore + pScore;
                }
                if ((enhanced.max_score === 0 || enhanced.max_score === 100 || enhanced.max_score === undefined) && (tMax > 0 || pMax > 0)) {
                    enhanced.max_score = tMax + pMax;
                }
                
                // Final fallback for max_score if it's still 0
                if (!enhanced.max_score && (tMax > 0 || pMax > 0)) {
                    enhanced.max_score = tMax + pMax;
                } else if (!enhanced.max_score) {
                    enhanced.max_score = 100;
                }
            } else if (nestedData !== undefined && (typeof nestedData === 'number' || typeof nestedData === 'string')) {
                // Handle simple scalar marks in formData
                if (enhanced.score === 0 || enhanced.score === undefined) {
                    enhanced.score = Number(nestedData);
                }
                enhanced.obtained = Number(nestedData);
            }
            return enhanced;
        });

        // Also process entrance marks if they were reconstructed from schema
        const finalEntranceMarksList = reconstructedEntranceMarks.map((m: any) => {
            const data = formData[m.subject_key];
            const enhanced = { ...m };
            if (data && typeof data === 'object') {
                const inner = data.gujcet || data.obtained || data.value || data;
                enhanced.obtained = inner.value || inner.obtained || 0;
                enhanced.total = inner.max_score || inner.total || 40;
                enhanced.score = enhanced.obtained;
            } else if (data !== undefined) {
                enhanced.obtained = data;
                enhanced.total = 100;
            }
            return enhanced;
        });

        // Convert marks array to object mapped by subject with fuzzy matching
        const formattedMarks: Record<string, any> = {};
        enhancedMarksData.forEach((m: any) => {
             const subject = (m.subject || '').toLowerCase();
             formattedMarks[subject] = m;
             
             if (subject.includes('math')) formattedMarks['math'] = m;
             if (subject.includes('physics')) formattedMarks['physics'] = m;
             if (subject.includes('chemistry')) formattedMarks['chemistry'] = m;
             if (subject.includes('computer')) formattedMarks['computer'] = m;
             if (subject.includes('english') || subject.includes('gujarat')) formattedMarks['english'] = m;
             if (subject.includes('biology')) formattedMarks['biology'] = m;
        });

        // Try to fetch photo url
        let photoUrl = '';
        try {
            const userId = appData.student_id || studentUser?.id;
            
            // 1. Check documents table first
            if (userId || applicationId) {
                const { data: docs } = await supabaseAdmin
                    .from('documents')
                    .select('file_path, document_type')
                    .or(`application_id.eq.${applicationId}${userId ? `,user_id.eq.${userId}` : ''}`)
                    .ilike('document_type', '%photo%')
                    .order('created_at', { ascending: false });
                    
                if (docs && docs.length > 0) {
                    const { data: urlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(docs[0].file_path, 3600);
                    if (urlData) photoUrl = urlData.signedUrl;
                }
            }
            
            // 2. Fallback to profile_data.photo if still no URL
            if (!photoUrl && profileData?.photo) {
                console.log('[API] Falling back to profile_data.photo path:', profileData.photo);
                const { data: urlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(profileData.photo, 3600);
                if (urlData) photoUrl = urlData.signedUrl;
            }
        } catch (e) {
            console.error('[API] Photo fetch error:', e);
        }

        const studentObj = {
            id: studentUser?.id || '',
            full_name: studentUser?.full_name || 'N/A',
            email: studentUser?.email || '',
            enrollment_number: profileObj?.enrollment_number || '',
            photo_url: photoUrl,
            student_photo_url: photoUrl, // Alias for template compatibility
            profile_data: profileData,
            ...profileData
        };

        const cycleObj = appData.admission_cycles ? {
            ...appData.admission_cycles,
            academic_year: appData.admission_cycles.academic_years
        } : null;

        // NEW: Transform entrance_marks into a list for dynamic tables
        const entranceMarksObj = formData?.entrance_marks || {};
        let entranceMarksList = Object.entries(entranceMarksObj)
            .filter(([key]) => key !== 'total' && typeof entranceMarksObj[key] === 'object')
            .map(([subject, data]: [string, any]) => ({
                subject: subject.charAt(0).toUpperCase() + subject.slice(1),
                obtained: data.obtained || data.value || 0,
                total: data.total || data.max_score || data.max || 100
            }));

        // If primary transformation yielded nothing, use the reconstructed list from schema
        if (entranceMarksList.length === 0) {
            entranceMarksList = finalEntranceMarksList;
        }

        const flatData: any = {
            student: studentObj,
            students: studentObj, // Alias
            student_profile: studentObj, // Alias
            photo_url: photoUrl, // Root level alias
            student_photo_url: photoUrl, // Root level alias
            branch_name: appData.branch?.name || formData?.branch_name || '',
            branch_code: appData.branch?.code || formData?.branch_code || '',
            cycle: cycleObj,
            admission_cycle: cycleObj,
            university: appData.course?.college?.university,
            college: {
                ...appData.course?.college,
                trust_name: 'The New English School Trust'
            },
            course: {
                ...appData.course,
                college: {
                    ...appData.course?.college,
                    trust_name: 'The New English School Trust',
                    university: appData.course?.college?.university
                }
            },
            courses: appData.course, // Alias
            branch: appData.branch,
            branches: appData.branch, // Alias
            marks: formattedMarks,
            marks_list: enhancedMarksData.filter((m: any) => {
                const subject = (m.subject || '').toLowerCase();
                return subject.includes('math') || subject.includes('physics') || subject.includes('chemistry') || subject.includes('science') || subject.includes('english');
            }),
            marcs_list: enhancedMarksData.filter((m: any) => {
                const subject = (m.subject || '').toLowerCase();
                return subject.includes('math') || subject.includes('physics') || subject.includes('chemistry') || subject.includes('science') || subject.includes('english');
            }), // Alias for spelling compatibility
            merit_marks: enhancedMarksData.filter((m: any) => {
                const subject = (m.subject || '').toLowerCase();
                return subject.includes('math') || subject.includes('physics') || subject.includes('chemistry') || subject.includes('science') || subject.includes('english');
            }), // Alias for standard names
            payments: appData.payments || [],
            entrance_marks: entranceMarksObj,
            entrance_marks_list: entranceMarksList,
            application: {
                ...appData, // Include all base table fields
                admission_number: appData.account_admissions?.admission_number,
                receipt_number: payment?.receipt_number || 'N/A',
                academic_year: appData.admission_cycles?.academic_years?.name,
                cycle: cycleObj,
                form_data: formData,
                board_name: formData?.board || 'N/A',
                ...formData,
                student: studentObj,
                course: appData.course
            }
        };
        
        // Alias for the base table
        flatData.applications = flatData.application;

        // Root level spreading for maximum compatibility
        Object.keys(studentObj).forEach(k => { if (!flatData[k]) flatData[k] = studentObj[k]; });
        Object.keys(formData).forEach(k => { if (!flatData[k]) flatData[k] = formData[k]; });
        // Also add application level fields to root
        Object.keys(appData).forEach(k => { if (typeof appData[k] !== 'object' && !flatData[k]) flatData[k] = appData[k]; });

        console.log('[API] Returning robust flatData. Root keys:', Object.keys(flatData).length);
        
        return json({ success: true, data: flatData });
    } catch (e: any) {
        console.error('[API] Fatal Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};