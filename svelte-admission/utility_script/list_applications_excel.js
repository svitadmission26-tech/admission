import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';

// Load environment variables
dotenv.config();
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const outputFileName = 'applications_match_report.xlsx';

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
    branchName: app.branch?.name || 'N/A',
    raw: app
  };
}

async function runMatchReport() {
  console.log(`Generating Match Report for Diploma....`);
  console.log('--------------------------------------------------');

  try {
    // 1. Fetch ALL relevant applications
    const { data: allApps, error } = await supabase
      .from('applications')
      .select(`
        id,
        form_type,
        form_data,
        branch_id,
        course:courses!inner(name),
        branch:branches(name),
        student:users!applications_student_id_fkey(
          id,
          full_name,
          email,
          student_profiles(profile_data)
        )
      `)
      .in('form_type', ['Provisional', 'MQ/NRI'])      
      .eq('course.code', 'DIP');
    if (error) throw error;

    // 2. Separate and Process
    const mqnriUnassigned = allApps
      .filter(app => app.form_type === 'MQ/NRI' && !app.branch_id)
      .map(getStudentDetails);

    const provisionalAll = allApps
      .filter(app => app.form_type === 'Provisional')
      .map(getStudentDetails);

    console.log(`Found ${mqnriUnassigned.length} MQ/NRI (Unassigned) records.`);
    console.log(`Found ${provisionalAll.length} Provisional records.`);

    // 3. Find Matches
    const commonRecords = [];
    mqnriUnassigned.forEach(mq => {
      provisionalAll.forEach(prov => {
        const matches = [];
        
        // Match logic
        if (mq.combinedName && mq.combinedName === prov.combinedName) matches.push('Name');
        if (mq.contact && mq.contact === prov.contact) matches.push('Contact');
        
        // Match father name ONLY if surname also matches to avoid false positives (e.g. "Rajesh" matches but different surnames)
        if (mq.fatherName && mq.fatherName === prov.fatherName && mq.lastName && mq.lastName === prov.lastName) {
          matches.push('Father Name + Surname');
        }
        
        if (mq.email && mq.email === prov.email) matches.push('Email');

        if (matches.length > 0) {
          commonRecords.push({
            'Common Fields': matches.join(', '),
            'MQ Name': mq.displayFullName,
            'MQ Email': mq.displayEmail,
            'MQ Contact': mq.contact || 'N/A',
            'Prov Name': prov.displayFullName,
            'Prov Email': prov.displayEmail,
            'Prov Contact': prov.contact || 'N/A',
            'Prov Branch': prov.branchName,
            'MQ/NRI ID': mq.id,
            'Prov ID': prov.id,
            'MQ Father Name': mq.fatherName.toUpperCase() || 'N/A'
          });
        }
      });
    });

    // 4. Prepare Excel Sheets
    // Sheet 1: MQ/NRI Unassigned (The filtered records from prev step)
    const mqSheetData = mqnriUnassigned.map(mq => ({
      'First Name': mq.firstName,
      'Middle Name': mq.middleName,
      'Last Name': mq.lastName,
      'Full Name': mq.displayFullName,
      'Email': mq.displayEmail,
      'Contact': mq.contact || 'N/A',
      'Father Name': mq.fatherName.toUpperCase() || 'N/A'
    }));

    const workbook = XLSX.utils.book_new();
    
    const worksheet1 = XLSX.utils.json_to_sheet(mqSheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet1, 'MQ-NRI Unassigned');

    const worksheet2 = XLSX.utils.json_to_sheet(commonRecords);
    XLSX.utils.book_append_sheet(workbook, worksheet2, 'Common Records');

    // 5. Write file
    XLSX.writeFile(workbook, outputFileName);
    console.log(`Match Report created: ${outputFileName}`);
    console.log(`Matches Found: ${commonRecords.length}`);
    console.log('--------------------------------------------------');

    if (commonRecords.length > 0) {
      console.log('Sample Matches:');
      commonRecords.slice(0, 5).forEach(m => {
        console.log(`- ${m['MQ Name']} matched with ${m['Prov Name']} (on: ${m['Common Fields']})`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

runMatchReport();
