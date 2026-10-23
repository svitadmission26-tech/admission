import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Check for --commit flag
const isCommit = process.argv.includes('--commit');

function getStudentDetails(app) {
  const student = app.student;
  const profile = Array.isArray(student?.student_profiles) ? student.student_profiles[0] : student?.student_profiles;
  const profileData = profile?.profile_data || {};
  const formData = app.form_data || {};

  const firstName = (profileData.first_name || formData.first_name || '').trim();
  const middleName = (profileData.middle_name || formData.middle_name || '').trim();
  const lastName = (profileData.last_name || formData.last_name || '').trim();
  const combinedName = `${firstName} ${middleName} ${lastName}`.trim().toLowerCase();
  const fatherName = (profileData.father_full_name || formData.father_full_name || '').trim().toLowerCase();
  const contact = (profileData.contact_number || formData.contact_number || profileData.mobile_number || '').trim().toLowerCase();

  return {
    id: app.id,
    firstName,
    middleName,
    lastName: lastName.toLowerCase(),
    displayLastName: lastName,
    combinedName,
    fatherName,
    contact,
    fullName: (student?.full_name || '').trim().toLowerCase(),
    email: (student?.email || '').trim().toLowerCase(),
    displayFullName: student?.full_name || 'N/A',
    displayEmail: student?.email || 'N/A',
    formType: app.form_type,
    branchId: app.branch_id,
    branchName: app.branch?.name || 'N/A',
    courseId: app.course_id,
    courseCode: app.course?.code || 'N/A',
    courseName: app.course?.name || 'N/A',
    raw: app
  };
}

async function runAutoAssign() {
  console.log('==================================================');
  console.log('   MQ/NRI Missing Branch Auto-Assign Script      ');
  console.log(`   Mode: ${isCommit ? '🔴 COMMIT (Will Update DB)' : '🟢 DRY RUN (Read Only)'}`);
  console.log('==================================================');

  try {
    // 1. Fetch ALL Provisional and MQ/NRI applications
    console.log('Fetching applications from Supabase...');
    const { data: allApps, error } = await supabase
      .from('applications')
      .select(`
        id,
        form_type,
        form_data,
        branch_id,
        course_id,
        course:courses(id, name, code),
        branch:branches(id, name),
        student:users!applications_student_id_fkey(
          id,
          full_name,
          email,
          student_profiles(profile_data)
        )
      `)
      .in('form_type', ['Provisional', 'MQ/NRI']);

    if (error) throw error;

    // 2. Separate into unassigned MQ/NRI and all Provisional applications
    const mqnriUnassigned = allApps
      .filter(app => app.form_type === 'MQ/NRI' && !app.branch_id)
      .map(getStudentDetails);

    const provisionalAll = allApps
      .filter(app => app.form_type === 'Provisional' && app.branch_id) // Match with Provisional that has a branch
      .map(getStudentDetails);

    console.log(`Found ${mqnriUnassigned.length} MQ/NRI applications with missing branch.`);
    console.log(`Found ${provisionalAll.length} Provisional applications with assigned branch.`);
    console.log('--------------------------------------------------');

    let matchedCount = 0;
    let updatedCount = 0;

    for (const mq of mqnriUnassigned) {
      const matches = [];
      let matchedProv = null;

      for (const prov of provisionalAll) {
        // Must belong to the same course/program structure
        if (mq.courseId !== prov.courseId) continue;

        const currentMatches = [];
        
        // Exact name match
        if (mq.combinedName && mq.combinedName === prov.combinedName) {
          currentMatches.push('Name');
        }
        // Contact number match
        if (mq.contact && mq.contact === prov.contact) {
          currentMatches.push('Contact');
        }
        // Father Name + Surname match
        if (mq.fatherName && mq.fatherName === prov.fatherName && mq.lastName && mq.lastName === prov.lastName) {
          currentMatches.push('Father Name + Surname');
        }
        // Email match
        if (mq.email && mq.email === prov.email) {
          currentMatches.push('Email');
        }

        if (currentMatches.length > 0) {
          matches.push({
            prov,
            reasons: currentMatches
          });
        }
      }

      if (matches.length > 0) {
        matchedCount++;
        // If multiple matches exist, pick the one with most matching criteria
        matches.sort((a, b) => b.reasons.length - a.reasons.length);
        matchedProv = matches[0].prov;
        const reasons = matches[0].reasons.join(', ');

        console.log(`Match Found #${matchedCount}:`);
        console.log(`  MQ/NRI App: [${mq.id}] ${mq.displayFullName} (${mq.displayEmail}) - Course: ${mq.courseCode}`);
        console.log(`  Prov App:   [${matchedProv.id}] ${matchedProv.displayFullName} (${matchedProv.displayEmail}) - Branch: ${matchedProv.branchName}`);
        console.log(`  Criteria:   ${reasons}`);

        if (isCommit) {
          // Perform the update
          const { error: updateError } = await supabase
            .from('applications')
            .update({ branch_id: matchedProv.branchId })
            .eq('id', mq.id);

          if (updateError) {
            console.error(`  ❌ Error updating MQ/NRI application ${mq.id}:`, updateError.message);
          } else {
            console.log(`  ✅ Successfully updated branch to: ${matchedProv.branchName}`);
            updatedCount++;
          }
        } else {
          console.log(`  [Dry Run] Would update branch to: ${matchedProv.branchName}`);
        }
        console.log('--------------------------------------------------');
      }
    }

    console.log('==================================================');
    console.log('   Execution Summary');
    console.log('==================================================');
    console.log(`Total Unassigned MQ/NRI checked:  ${mqnriUnassigned.length}`);
    console.log(`Total matches found:             ${matchedCount}`);
    if (isCommit) {
      console.log(`Successfully updated in DB:      ${updatedCount}`);
    } else {
      console.log(`Would update (dry run):          ${matchedCount}`);
      console.log('\n💡 To apply these changes to the database, run:');
      console.log('   node utility_script/auto_assign_mq_nri_branch.js --commit');
    }
    console.log('==================================================');

  } catch (err) {
    console.error('Fatal Error:', err.message);
  }
}

runAutoAssign();
