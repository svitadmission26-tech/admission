import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Load environment variables from .env file
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const gsebLookupFilePath = path.join(process.cwd(), 'acpcpdf.xlsx');
const cbseLookupFilePath = path.join(process.cwd(), 'cbsepdf.xlsx');
const gujcetLookupFilePath = path.join(process.cwd(), 'gujcetpdf.xlsx');

const outputExcelPath = path.join(process.cwd(), 'all_boards_mq_nri_engineering_students_final.xlsx');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Loads standard PCM -> PERCENTILE lookup table (acpcpdf.xlsx, cbsepdf.xlsx)
 */
function loadStandardPercentileLookup(filePath) {
  console.log(`📄 Reading lookup file: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const lookupMap = new Map();
  rows.forEach((row) => {
    const pcm = Number(row.PCM);
    const percentile = Number(row.PERCENTILE);
    if (!isNaN(pcm) && !isNaN(percentile)) {
      lookupMap.set(pcm, percentile);
    }
  });

  console.log(`✅ Loaded ${lookupMap.size} PCM -> Percentile entries.\n`);
  return lookupMap;
}

/**
 * Loads GUJCET multi-column PCM -> PERCENTILE lookup table (gujcetpdf.xlsx)
 */
function loadGujcetPercentileLookup(filePath) {
  console.log(`📄 Reading GUJCET lookup file: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const lookupMap = new Map();

  for (let rowIndex = 5; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    if (!row || row.length === 0) continue;

    for (let col = 0; col < row.length; col += 2) {
      const pcm = Number(row[col]);
      const percentile = Number(row[col + 1]);

      if (!isNaN(pcm) && !isNaN(percentile)) {
        lookupMap.set(pcm, percentile);
      }
    }
  }

  console.log(`✅ Loaded ${lookupMap.size} GUJCET PCM -> Percentile entries.\n`);
  return lookupMap;
}

/**
 * Safely extracts theory marks for a given subject from form_data JSONB
 */
function getTheoryScore(formData, subjectKeys) {
  if (!formData) return null;
  for (const key of subjectKeys) {
    const obj = formData[key];
    if (obj !== undefined && obj !== null) {
      if (typeof obj === 'object') {
        if (obj.theory !== undefined) {
          if (typeof obj.theory === 'object' && obj.theory.value !== undefined) {
            const val = Number(obj.theory.value);
            return isNaN(val) ? null : val;
          }
          const val = Number(obj.theory);
          return isNaN(val) ? null : val;
        }
        if (obj.value !== undefined) {
          const val = Number(obj.value);
          return isNaN(val) ? null : val;
        }
        if (obj.score !== undefined) {
          const val = Number(obj.score);
          return isNaN(val) ? null : val;
        }
      } else {
        const val = Number(obj);
        return isNaN(val) ? null : val;
      }
    }
  }
  return null;
}

/**
 * Safely extracts GUJCET marks for a given subject from form_data JSONB
 */
function getGujcetScore(formData, subjectKeys) {
  if (!formData) return null;
  for (const key of subjectKeys) {
    const obj = formData[key];
    if (obj !== undefined && obj !== null) {
      if (typeof obj === 'object') {
        if (obj.gujcet !== undefined) {
          if (typeof obj.gujcet === 'object' && obj.gujcet.value !== undefined) {
            const val = Number(obj.gujcet.value);
            return isNaN(val) ? null : val;
          }
          const val = Number(obj.gujcet);
          return isNaN(val) ? null : val;
        }
        if (obj.value !== undefined) {
          const val = Number(obj.value);
          return isNaN(val) ? null : val;
        }
        if (obj.score !== undefined) {
          const val = Number(obj.score);
          return isNaN(val) ? null : val;
        }
      } else {
        const val = Number(obj);
        return isNaN(val) ? null : val;
      }
    }
  }
  return null;
}

/**
 * Extracts student profile & application fields:
 * DOB, Name as per Marksheet, ACPC Number, ACPC Merit Rank, Category, HSC Score, Contact Number, Gender, Permanent City, Permanent State
 */
function getStudentDetails(app) {
  const formData = app.form_data || {};
  const profile = Array.isArray(app.users?.student_profiles)
    ? app.users.student_profiles[0]
    : app.users?.student_profiles;
  const profileData = profile?.profile_data || {};

  // Date of Birth
  const rawDob =
    formData.dob ||
    formData.date_of_birth ||
    formData.birth_date ||
    profileData.dob ||
    profileData.date_of_birth ||
    profileData.birth_date ||
    'N/A';

  const dob = rawDob !== 'N/A' && !isNaN(Date.parse(rawDob))
    ? new Date(rawDob).toISOString().split('T')[0]
    : String(rawDob);

  // Name as per Marksheet
  const nameAsPerMarksheet =
    formData.name_as_per_marksheet ||
    formData.name_in_marksheet ||
    formData.name_as_per_hsc ||
    formData.student_name_marksheet ||
    profileData.name_as_per_marksheet ||
    profileData.name_in_marksheet ||
    app.users?.full_name ||
    'N/A';

  // ACPC / ACPDC Number
  const acpcNumber =
    formData.acpc_number ||
    formData.acpc_app_number ||
    formData.acpc_application_number ||
    formData.acpc_seat_number ||
    formData.acpdc_number ||
    formData.acpdc_app_number ||
    formData.acpdc_application_number ||
    formData.acpdc_seat_number ||
    profileData.acpc_number ||
    profileData.acpc_application_number ||
    profileData.acpdc_number ||
    profileData.acpdc_application_number ||
    'N/A';

  // ACPC Merit Rank
  const acpcMeritNumber =
    formData.acpc_merit_number ||
    formData.acpc_merit_no ||
    formData.acpc_rank ||
    formData.acpdc_merit_number ||
    formData.acpdc_merit_no ||
    formData.acpdc_rank ||
    formData.merit_rank ||
    profileData.acpc_merit_number ||
    profileData.acpdc_merit_number ||
    'N/A';

  // Category
  const category =
    formData.category ||
    formData.caste_category ||
    formData.social_category ||
    profileData.category ||
    profileData.caste_category ||
    profileData.social_category ||
    'OPEN';

  // HSC Score / Total Marks / Percentage
  const hscScore =
    formData.hsc_score ||
    formData.hsc_total ||
    formData.hsc_marks ||
    formData.hsc_percentage ||
    formData.hsc_total_marks ||
    profileData.hsc_score ||
    profileData.hsc_percentage ||
    'N/A';

  // Contact Number
  const contactNumber =
    app.users?.phone ||
    formData.phone ||
    formData.mobile ||
    formData.contact_number ||
    formData.student_phone ||
    formData.mobile_number ||
    profileData.phone ||
    profileData.mobile_number ||
    profileData.student_mobile ||
    profileData.contact_number ||
    'N/A';

  // Gender
  const gender =
    formData.gender ||
    formData.sex ||
    profileData.gender ||
    profileData.sex ||
    'N/A';

  // Permanent City
  const permanentCity =
    formData.permanent_city ||
    formData.city ||
    formData.perm_city ||
    formData.p_city ||
    formData.address_city ||
    profileData.permanent_city ||
    profileData.city ||
    profileData.perm_city ||
    'N/A';

  // Permanent State
  const permanentState =
    formData.permanent_state ||
    formData.state ||
    formData.perm_state ||
    formData.p_state ||
    formData.address_state ||
    profileData.permanent_state ||
    profileData.state ||
    profileData.perm_state ||
    'N/A';

  return {
    dob,
    nameAsPerMarksheet,
    acpcNumber,
    acpcMeritNumber,
    category,
    hscScore,
    contactNumber,
    gender,
    permanentCity,
    permanentState
  };
}

/**
 * Performs lookup for percentile given a total score and map
 */
function lookupPercentile(score, map) {
  if (score === null || isNaN(score)) return 'N/A';
  if (map.has(score)) return map.get(score);

  const step025 = Math.round(score * 4) / 4;
  if (map.has(step025)) return map.get(step025);

  const roundedInt = Math.round(score);
  if (map.has(roundedInt)) return map.get(roundedInt);

  return 'Out of Range';
}

async function main() {
  console.log('🚀 Starting Final Multi-Board Export with DOB, Contact No, Gender, Perm. Address, ACPC No, Marksheet Name, HSC Score & Category...\n');

  const gsebLookupMap = loadStandardPercentileLookup(gsebLookupFilePath);
  const cbseLookupMap = loadStandardPercentileLookup(cbseLookupFilePath);
  const gujcetLookupMap = loadGujcetPercentileLookup(gujcetLookupFilePath);

  // Fetch MQ/NRI Applications
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
          admission_status,
          profile_data
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
        account_status
      )
    `)
    .ilike('form_type', 'MQ/NRI');

  if (error) {
    console.error('❌ Database Query Error:', error.message);
    return;
  }

  console.log(`📦 Fetched ${applications?.length || 0} MQ/NRI applications from database.\n`);

  const allRows = [];
  const gsebRows = [];
  const cbseRows = [];
  const otherRows = [];

  for (const app of applications || []) {
    const collegeCode = (app.courses?.colleges?.code || '').toUpperCase();
    const isEngineering = collegeCode === 'ENGG' || collegeCode === 'DIP';
    if (!isEngineering) continue;

    const profile = Array.isArray(app.users?.student_profiles)
      ? app.users.student_profiles[0]
      : app.users?.student_profiles;

    const enrollmentNumber = profile?.enrollment_number || '';
    if (!enrollmentNumber || !enrollmentNumber.toUpperCase().includes('M')) {
      continue;
    }

    const formData = app.form_data || {};
    const boardStr = String(formData.board || formData.board_name || 'N/A').trim();
    const boardUpper = boardStr.toUpperCase();

    const isGseb = boardUpper.includes('GSEB') || boardUpper.includes('GSHEB') || boardUpper.includes('GUJARAT');
    const isCbse = boardUpper.includes('CBSE') || boardUpper.includes('CENTRAL BOARD');

    // Extract student details
    const {
      dob,
      nameAsPerMarksheet,
      acpcNumber,
      acpcMeritNumber,
      category,
      hscScore,
      contactNumber,
      gender,
      permanentCity,
      permanentState
    } = getStudentDetails(app);

    // Theory scores
    const physicsTheory = getTheoryScore(formData, ['physics', 'phy', 'physics_theory']);
    const chemistryTheory = getTheoryScore(formData, ['chemistry', 'chem', 'chemistry_theory']);
    const mathTheory = getTheoryScore(formData, ['math', 'maths', 'mathematics', 'math_theory', 'maths_theory']);

    let boardPcmTotal = null;
    let boardPercentile = 'N/A';

    if (physicsTheory !== null && chemistryTheory !== null && mathTheory !== null) {
      boardPcmTotal = physicsTheory + chemistryTheory + mathTheory;
      if (isGseb) {
        boardPercentile = lookupPercentile(boardPcmTotal, gsebLookupMap);
      } else if (isCbse) {
        boardPercentile = lookupPercentile(boardPcmTotal, cbseLookupMap);
      }
    }

    // GUJCET scores
    const gujcetPhysics = getGujcetScore(formData, ['physics_gujcet', 'phy_gujcet', 'gujcet_physics']);
    const gujcetChemistry = getGujcetScore(formData, ['chemistry_gujcet', 'chem_gujcet', 'gujcet_chemistry']);
    const gujcetMaths = getGujcetScore(formData, ['mathematics_gujcet', 'math_gujcet', 'maths_gujcet', 'gujcet_math']);

    let gujcetTotal = null;
    let gujcetPercentile = 'N/A';

    if (gujcetPhysics !== null || gujcetChemistry !== null || gujcetMaths !== null) {
      gujcetTotal = (gujcetPhysics || 0) + (gujcetChemistry || 0) + (gujcetMaths || 0);
      gujcetPercentile = lookupPercentile(gujcetTotal, gujcetLookupMap);
    }

    const accountAdm = Array.isArray(app.account_admissions)
      ? app.account_admissions[0]
      : app.account_admissions;

    const rowObj = {
      'Full Name': app.users?.full_name || 'N/A',
      'Name as per Marksheet': nameAsPerMarksheet,
      'Gender': gender,
      'Date of Birth': dob,
      'Category': category,
      'Contact Number': contactNumber,
      'Email': app.users?.email || 'N/A',
      'Permanent City': permanentCity,
      'Permanent State': permanentState,
      'Enrollment Number': enrollmentNumber,
      'ACPC / ACPDC Number': acpcNumber,
      'ACPC Merit Rank': acpcMeritNumber,
      'Board': boardStr,
      'Course Name': app.courses?.name || 'N/A',
      'College Code': collegeCode,
      'Admission Number': accountAdm?.admission_number || 'N/A',
      'Physics Theory': physicsTheory !== null ? physicsTheory : 'N/A',
      'Chemistry Theory': chemistryTheory !== null ? chemistryTheory : 'N/A',
      'Maths Theory': mathTheory !== null ? mathTheory : 'N/A',
      'Board PCM Total': boardPcmTotal !== null ? boardPcmTotal : 'N/A',
      'Board Percentile': boardPercentile,
      'HSC Score / Marks': hscScore,
      'GUJCET Physics': gujcetPhysics !== null ? gujcetPhysics : 'N/A',
      'GUJCET Chemistry': gujcetChemistry !== null ? gujcetChemistry : 'N/A',
      'GUJCET Maths': gujcetMaths !== null ? gujcetMaths : 'N/A',
      'GUJCET Total': gujcetTotal !== null ? gujcetTotal : 'N/A',
      'GUJCET Percentile': gujcetPercentile
    };

    allRows.push(rowObj);
    if (isGseb) {
      gsebRows.push(rowObj);
    } else if (isCbse) {
      cbseRows.push(rowObj);
    } else {
      otherRows.push(rowObj);
    }
  }

  console.log(`✅ Extracted ${allRows.length} Total Engineering MQ/NRI Students:`);
  console.log(`   - GSEB: ${gsebRows.length} students`);
  console.log(`   - CBSE: ${cbseRows.length} students`);
  console.log(`   - Other Boards: ${otherRows.length} students\n`);

  if (allRows.length > 0) {
    const workbook = XLSX.utils.book_new();

    const columnWidths = [
      { wch: 35 }, // Full Name
      { wch: 35 }, // Name as per Marksheet
      { wch: 12 }, // Gender
      { wch: 15 }, // Date of Birth
      { wch: 12 }, // Category
      { wch: 18 }, // Contact Number
      { wch: 32 }, // Email
      { wch: 20 }, // Permanent City
      { wch: 20 }, // Permanent State
      { wch: 20 }, // Enrollment Number
      { wch: 22 }, // ACPC / ACPDC Number
      { wch: 20 }, // ACPC Merit Rank
      { wch: 15 }, // Board
      { wch: 35 }, // Course Name
      { wch: 15 }, // College Code
      { wch: 22 }, // Admission Number
      { wch: 16 }, // Physics Theory
      { wch: 18 }, // Chemistry Theory
      { wch: 16 }, // Maths Theory
      { wch: 16 }, // Board PCM Total
      { wch: 18 }, // Board Percentile
      { wch: 18 }, // HSC Score / Marks
      { wch: 16 }, // GUJCET Physics
      { wch: 18 }, // GUJCET Chemistry
      { wch: 16 }, // GUJCET Maths
      { wch: 15 }, // GUJCET Total
      { wch: 18 }  // GUJCET Percentile
    ];

    // Sheet 1: Master Summary (All Boards)
    const masterSheet = XLSX.utils.json_to_sheet(allRows);
    masterSheet['!cols'] = columnWidths;
    XLSX.utils.book_append_sheet(workbook, masterSheet, 'All_Boards_Summary');

    // Sheet 2: GSEB Students
    if (gsebRows.length > 0) {
      const gsebSheet = XLSX.utils.json_to_sheet(gsebRows);
      gsebSheet['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(workbook, gsebSheet, 'GSEB_Students');
    }

    // Sheet 3: CBSE Students
    if (cbseRows.length > 0) {
      const cbseSheet = XLSX.utils.json_to_sheet(cbseRows);
      cbseSheet['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(workbook, cbseSheet, 'CBSE_Students');
    }

    // Sheet 4: Other Boards
    if (otherRows.length > 0) {
      const otherSheet = XLSX.utils.json_to_sheet(otherRows);
      otherSheet['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(workbook, otherSheet, 'Other_Boards');
    }

    XLSX.writeFile(workbook, outputExcelPath);
    console.log(`🎉 Master Excel file generated successfully!`);
    console.log(`📍 Saved to: ${outputExcelPath}\n`);

    console.log(`Preview of top 5 records:`);
    console.table(allRows.slice(0, 5));
  } else {
    console.log(`⚠️ No matching MQ/NRI student records found.\n`);
  }
}

main();
