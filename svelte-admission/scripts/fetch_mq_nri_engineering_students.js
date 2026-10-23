import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  process.exit(1);
}

// Initialize Supabase client with Service Role Key for full access
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Safely extracts theory marks for a given subject from form_data JSONB object
 */
function getTheoryScore(formData, subjectKeys) {
  if (!formData) return 'N/A';
  for (const key of subjectKeys) {
    const obj = formData[key];
    if (obj !== undefined && obj !== null) {
      if (typeof obj === 'object') {
        if (obj.theory !== undefined) {
          if (typeof obj.theory === 'object' && obj.theory.value !== undefined) {
            return String(obj.theory.value);
          }
          return String(obj.theory);
        }
        if (obj.value !== undefined) return String(obj.value);
        if (obj.score !== undefined) return String(obj.score);
      } else {
        return String(obj);
      }
    }
  }
  return 'N/A';
}

/**
 * Script to fetch students matching:
 * 1. Form Type: MQ/NRI
 * 2. College: Engineering ('ENGG' / 'DIP')
 * 3. Final Admission Record in account_admissions table
 * 4. Enrollment Number containing 'M' (in student_profiles table)
 * 5. Board: GSEB / GSHEB
 * 6. Subject Marks: Physics, Chemistry & Maths (Theory)
 */
async function fetchMqNriEngineeringStudents(options = {}) {
  const { 
    includeDiploma = true, // Set to false if you only want Degree Engineering ('ENGG')
    exportJson = true
  } = options;

  console.log('🔍 Querying students matching criteria:');
  console.log('   - Form Type: MQ/NRI');
  console.log(`   - College: Engineering (${includeDiploma ? 'ENGG & DIP' : 'ENGG only'})`);
  console.log('   - Final Admission: Present in account_admissions table');
  console.log('   - Enrollment Number: Contains "M" (in student_profiles)');
  console.log('   - Board: GSEB / GSHEB');
  console.log('   - Subject Marks: Physics, Chemistry & Maths (Theory)');
  console.log('-----------------------------------------------------\n');

  try {
    const { data: applications, error } = await supabase
      .from('applications')
      .select(`
        id,
        form_type,
        form_data,
        status,
        submitted_at,
        student_id,
        users:student_id (
          id,
          full_name,
          email,
          student_profiles (
            user_id,
            enrollment_number,
            admission_status
          )
        ),
        courses:course_id (
          id,
          name,
          code,
          colleges:college_id (
            id,
            name,
            code
          )
        ),
        account_admissions!inner (
          id,
          admission_number,
          admission_date,
          admission_type,
          admission_mode,
          account_status,
          remarks
        )
      `)
      .ilike('form_type', 'MQ/NRI');

    if (error) {
      console.error('❌ Database Query Error:', error.message);
      return;
    }

    const matchingStudents = [];

    for (const app of applications || []) {
      const collegeCode = (app.courses?.colleges?.code || '').toUpperCase();

      // Match Engineering College: ENGG (Degree Engineering) or DIP (Diploma Engineering)
      const isEngineering = includeDiploma 
        ? (collegeCode === 'ENGG' || collegeCode === 'DIP')
        : (collegeCode === 'ENGG');

      if (!isEngineering) continue;

      // Extract student profile & enrollment number
      const profile = Array.isArray(app.users?.student_profiles)
        ? app.users.student_profiles[0]
        : app.users?.student_profiles;

      const enrollmentNumber = profile?.enrollment_number || '';

      // Check if enrollment number contains 'M' (case insensitive)
      if (!enrollmentNumber || !enrollmentNumber.toUpperCase().includes('M')) {
        continue;
      }

      // Filter for GSEB / GSHEB board
      const formData = app.form_data || {};
      const boardStr = String(formData.board || formData.board_name || 'N/A').trim();
      const isGseb = boardStr.toUpperCase().includes('GSEB') || 
                    boardStr.toUpperCase().includes('GSHEB') || 
                    boardStr.toUpperCase().includes('GUJARAT');

      if (!isGseb) continue;

      // Extract account admission record
      const accountAdm = Array.isArray(app.account_admissions)
        ? app.account_admissions[0]
        : app.account_admissions;

      // Extract theory marks for Physics, Chemistry, and Mathematics
      const physicsTheory = getTheoryScore(formData, ['physics', 'phy', 'physics_theory']);
      const chemistryTheory = getTheoryScore(formData, ['chemistry', 'chem', 'chemistry_theory']);
      const mathTheory = getTheoryScore(formData, ['math', 'maths', 'mathematics', 'math_theory', 'maths_theory']);

      matchingStudents.push({
        student_id: app.student_id,
        application_id: app.id,
        full_name: app.users?.full_name || 'N/A',
        email: app.users?.email || 'N/A',
        enrollment_number: enrollmentNumber,
        board: boardStr,
        profile_admission_status: profile?.admission_status || 'N/A',
        admission_number: accountAdm?.admission_number || 'N/A',
        account_status: accountAdm?.account_status || 'N/A',
        admission_type: accountAdm?.admission_type || app.admission_type || 'N/A',
        admission_date: accountAdm?.admission_date ? new Date(accountAdm.admission_date).toLocaleDateString() : 'N/A',
        form_type: app.form_type,
        course_name: app.courses?.name || 'N/A',
        college_code: collegeCode,
        college_name: app.courses?.colleges?.name || 'N/A',
        marks: {
          physics_theory: physicsTheory,
          chemistry_theory: chemistryTheory,
          math_theory: mathTheory
        }
      });
    }

    console.log(`✅ Total matching GSEB students found: ${matchingStudents.length}\n`);

    if (matchingStudents.length > 0) {
      const displayData = matchingStudents.map((s, index) => ({
        '#': index + 1,
        'Name': s.full_name,
        'Enrollment No': s.enrollment_number,
        'Board': s.board,
        'Admission No': s.admission_number,
        'Physics (Th)': s.marks.physics_theory,
        'Chem (Th)': s.marks.chemistry_theory,
        'Math (Th)': s.marks.math_theory,
        'Course': s.course_name,
        'College Code': s.college_code
      }));

      console.table(displayData.slice(0, 20));

      if (matchingStudents.length > 20) {
        console.log(`... and ${matchingStudents.length - 20} more records.`);
      }

      if (exportJson) {
        const outputPath = path.join(process.cwd(), 'gseb_mq_nri_engineering_students.json');
        fs.writeFileSync(outputPath, JSON.stringify(matchingStudents, null, 2));
        console.log(`\n📁 Exported ${matchingStudents.length} records to: ${outputPath}`);
      }
    } else {
      console.log('⚠️ No matching GSEB records found for the specified criteria.');
    }

    return matchingStudents;
  } catch (err) {
    console.error('❌ Unexpected Error:', err);
  }
}

fetchMqNriEngineeringStudents();
