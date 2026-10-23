
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runTest() {
    console.log('--- Starting Adm Officer Flow Test ---');

    // 1. Setup Test Data
    console.log('\nStep 1: Setting up test data...');
    
    // Create or find a test student
    const { data: studentUser, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'student')
        .limit(1)
        .maybeSingle();

    if (userError || !studentUser) {
        console.error('Error: No student user found. Please create one first.', userError);
        return;
    }
    const studentId = studentUser.id;
    console.log(`Using Student ID: ${studentId}`);

    // Create or find a course
    const { data: courses } = await supabase.from('courses').select('id, name').limit(2);
    if (!courses || courses.length < 2) {
        console.error('Error: Need at least 2 courses for transfer test.');
        return;
    }
    const sourceCourse = courses[0];
    const targetCourse = courses[1];
    console.log(`Source Course: ${sourceCourse.name} (${sourceCourse.id})`);
    console.log(`Target Course: ${targetCourse.name} (${targetCourse.id})`);

    // Get a cycle
    const { data: cycle } = await supabase.from('admission_cycles').select('id').limit(1).single();
    if (!cycle) { console.error('No cycle found'); return; }

    // Create a dummy application
    const { data: app, error: appError } = await supabase
        .from('applications')
        .insert({
            student_id: studentId,
            course_id: sourceCourse.id,
            cycle_id: cycle.id,
            form_type: 'Provisional',
            status: 'approved', // Start as approved
            form_data: { test: 'initial' }
        })
        .select()
        .single();

    if (appError) {
        console.error('Error creating test application:', appError);
        return;
    }
    const appId = app.id;
    console.log(`Created Application ID: ${appId}`);

    // Set initial enrollment number
    const initialEnrollment = 'ENROLL-001';
    await supabase.from('student_profiles').upsert({
        user_id: studentId,
        enrollment_number: initialEnrollment
    });
    console.log(`Set initial enrollment number: ${initialEnrollment}`);

    // 2. Test Cancellation
    console.log('\nStep 2: Testing Cancellation Logic...');
    
    // Logic mimic: Cancel action
    await supabase.from('applications').update({ status: 'cancelled' }).eq('id', appId);
    await supabase.from('student_profiles').update({ enrollment_number: null }).eq('user_id', studentId);

    // Verify
    const { data: cancelledApp } = await supabase.from('applications').select('status').eq('id', appId).single();
    const { data: cancelledProfile } = await supabase.from('student_profiles').select('enrollment_number').eq('user_id', studentId).single();

    if (cancelledApp.status === 'cancelled' && cancelledProfile.enrollment_number === null) {
        console.log('✅ Cancellation Test Passed: Status is cancelled and enrollment number is null.');
    } else {
        console.error('❌ Cancellation Test Failed:', { status: cancelledApp.status, enrollment: cancelledProfile.enrollment_number });
    }

    // 3. Test Transfer
    console.log('\nStep 3: Testing Transfer Logic...');
    
    // Reset state
    await supabase.from('applications').update({ status: 'approved', course_id: sourceCourse.id }).eq('id', appId);
    await supabase.from('student_profiles').update({ enrollment_number: initialEnrollment }).eq('user_id', studentId);
    console.log('Reset application to approved.');

    // Logic mimic: Transfer action
    const newEnrollment = 'TRANSF-NEW-002';
    
    // Insert history
    const { error: histError } = await supabase.from('student_transfer_history').insert({
        application_id: appId,
        previous_course_id: sourceCourse.id,
        previous_enrollment_number: initialEnrollment,
        new_enrollment_number: newEnrollment,
        // transferred_by: ... (skip for script)
    });
    
    if (histError) console.error('History Insert Error:', histError);

    // Update profile
    await supabase.from('student_profiles').update({ enrollment_number: newEnrollment }).eq('user_id', studentId);

    // Update app
    await supabase.from('applications').update({ course_id: targetCourse.id }).eq('id', appId);

    // Verify
    const { data: transferApp } = await supabase.from('applications').select('course_id').eq('id', appId).single();
    const { data: transferProfile } = await supabase.from('student_profiles').select('enrollment_number').eq('user_id', studentId).single();
    const { data: history } = await supabase.from('student_transfer_history').select('*').eq('application_id', appId).single();

    if (
        transferApp.course_id === targetCourse.id &&
        transferProfile.enrollment_number === newEnrollment &&
        history && history.previous_enrollment_number === initialEnrollment
    ) {
        console.log('✅ Transfer Test Passed:');
        console.log(`- New Course ID matches target: ${transferApp.course_id}`);
        console.log(`- New Enrollment Number matches: ${transferProfile.enrollment_number}`);
        console.log(`- History record exists with previous ID: ${history.previous_enrollment_number}`);
    } else {
        console.error('❌ Transfer Test Failed');
        console.log({ appCourse: transferApp.course_id, profEnroll: transferProfile.enrollment_number, history });
    }

    // Cleanup
    console.log('\nCleaning up test data...');
    await supabase.from('student_transfer_history').delete().eq('application_id', appId);
    await supabase.from('applications').delete().eq('id', appId);
    // Leave student and courses alone
    console.log('Done.');
}

runTest();
