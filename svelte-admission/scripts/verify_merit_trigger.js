import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verifyTrigger() {
    console.log('--- Verifying Merit Trigger Integration (Attempt 2) ---');

    const uniqueId = uuidv4().split('-')[0];
    const testPrefix = `[TEST-${uniqueId}]`;

    try {
        // 1. Setup Prerequisites (University, College, Course, Year, Cycle)
        console.log('1. Setting up test environment...');
        
        // Uni
        const { data: univ, error: uErr } = await supabase.from('universities').insert({
            name: `${testPrefix} Univ`, code: `U${uniqueId}`, address: 'Test'
        }).select().single();
        if (uErr) throw new Error(`Univ creation failed: ${uErr.message}`);

        // College
        const { data: college, error: cErr } = await supabase.from('colleges').insert({
            university_id: univ.id, name: `${testPrefix} College`, code: `C${uniqueId}`, address: 'Test'
        }).select().single();
        if (cErr) throw new Error(`College creation failed: ${cErr.message}`);

        // Course
        const { data: course, error: coErr } = await supabase.from('courses').insert({
            college_id: college.id, name: `${testPrefix} Course`, code: `CO${uniqueId}`, duration_years: 4
        }).select().single();
        if (coErr) throw new Error(`Course creation failed: ${coErr.message}`);

        // Year
        const { data: year, error: yErr } = await supabase.from('academic_years').insert({
            name: `${testPrefix} 2026`, start_date: '2026-01-01', end_date: '2026-12-31', is_active: true
        }).select().single();
        if (yErr) throw new Error(`Year creation failed: ${yErr.message}`);

        // Cycle
        const { data: cycle, error: cyErr } = await supabase.from('admission_cycles').insert({
            academic_year_id: year.id, name: `${testPrefix} Cycle`, start_date: '2026-01-01', end_date: '2026-06-30', is_active: true
        }).select().single();
        if (cyErr) throw new Error(`Cycle creation failed: ${cyErr.message}`);

        // Student
        // We need a user in auth.users ideally, but 'public.users' extends it. 
        // Inserting directly into public.users usually fails due to FK constraint if auth user doesn't exist.
        // For this test, we might need to pick an EXISTING student or skip if we can't create one easily without admin API.
        // Let's try to fetch an existing student.
        const { data: existingStudent } = await supabase.from('users').select('id').eq('role', 'student').limit(1).maybeSingle();
        
        let studentId = existingStudent?.id;
        if (!studentId) {
            console.warn('No existing student found. Cannot proceed with Application creation safely without breaking FK.');
            // Skip application test if no student
            throw new Error('No student user found to attach application to.');
        }
        console.log(`   Using Student ID: ${studentId}`);

        // 2. Create Admission Form with 'is_merit' field
        console.log('2. Creating Admission Form with Merit Field...');
        const schema = {
            fields: [
                { key: "full_name", label: "Full Name", type: "text" },
                { key: "hsc_score", label: "HSC Score", type: "number", is_merit: true, max_score: 100 }
            ]
        };

        // Try 'Provisional' which is standard
        const { error: formErr } = await supabase.from('admission_forms').insert({
            course_id: course.id,
            cycle_id: cycle.id,
            schema_json: schema,
            form_type: 'Provisional' 
        });
        if (formErr) throw new Error(`Form creation failed: ${formErr.message}`);

        // 3. Create Application with data
        console.log('3. Creating Application with marks data...');
        const { data: app, error: appErr } = await supabase.from('applications').insert({
            student_id: studentId,
            course_id: course.id,
            cycle_id: cycle.id,
            form_type: 'Provisional',
            status: 'draft',
            form_data: {
                "full_name": "Test Student",
                "hsc_score": 95.5
            }
        }).select().single();
        if (appErr) throw new Error(`Application creation failed: ${appErr.message}`);
        console.log(`   Application created: ${app.id}`);

        // 4. Verify Marks Table
        console.log('4. Checking Marks table for auto-sync...');
        // Give trigger a moment (usually instant, but just in case)
        await new Promise(r => setTimeout(r, 1000));

        const { data: marks, error: markErr } = await supabase
            .from('marks')
            .select('*')
            .eq('application_id', app.id);

        if (markErr) throw new Error(`Fetching marks failed: ${markErr.message}`);

        console.log(`   Found ${marks.length} marks entries.`);
        if (marks.length > 0) {
            console.log('   Entry:', marks[0]);
            if (marks[0].subject === 'HSC Score' && marks[0].score == 95.5) {
                console.log('✅ SUCCESS: Trigger worked! Mark was automatically inserted.');
            } else {
                console.error('❌ FAILURE: Data mismatch.', marks[0]);
            }
        } else {
            console.error('❌ FAILURE: No marks found. Trigger did not fire or failed.');
        }

        // 5. Cleanup
        console.log('5. Cleaning up test data...');
        // Deleting University usually cascades to college -> course -> forms -> applications -> marks
        // Deleting Academic Year cascades to cycles
        await supabase.from('universities').delete().eq('id', univ.id);
        await supabase.from('academic_years').delete().eq('id', year.id);
        console.log('   Cleanup complete.');

    } catch (e) {
        console.error('!!! TEST FAILED !!!');
        console.error(e.message);
    }
}

verifyTrigger();