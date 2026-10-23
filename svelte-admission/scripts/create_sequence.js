import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function createDefaultSequence() {
    // 1. Get an existing application to find the right IDs
    const { data: app } = await supabase
        .from('applications')
        .select('course_id, cycle_id, courses(college_id), admission_cycles(academic_year_id)')
        .limit(1)
        .single();

    if (!app) {
        console.error("No application found to base sequence on.");
        return;
    }

    const collegeId = app.courses.college_id;
    const courseId = app.course_id;
    const academicYearId = app.admission_cycles.academic_year_id;

    console.log(`Creating sequence for: College ${collegeId}, Course ${courseId}, Year ${academicYearId}`);

    // 2. Insert Sequence
    const { data, error } = await supabase.from('admission_sequences').insert({
        college_id: collegeId,
        course_id: courseId,
        academic_year_id: academicYearId,
        prefix: 'TEST-2026-',
        current_sequence: 0
    });

    if (error) {
        console.error("Error creating sequence:", error);
    } else {
        console.log("Sequence created successfully.");
    }
}

createDefaultSequence();
