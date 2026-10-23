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

const gsebOutputExcelPath = path.join(process.cwd(), 'gseb_mq_nri_engineering_students_with_percentile.xlsx');
const cbseOutputExcelPath = path.join(process.cwd(), 'cbse_mq_nri_engineering_students_with_percentile.xlsx');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Loads standard PCM -> PERCENTILE lookup table from simple 2-column Excel (acpcpdf.xlsx, cbsepdf.xlsx)
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
 * Loads GUJCET multi-column PCM -> PERCENTILE lookup table from gujcetpdf.xlsx
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
 * Safely extracts ACPC / ACPDC number and ACPC merit rank from form_data or profile_data
 */
function getAcpcDetails(app) {
  const formData = app.form_data || {};
  const profile = Array.isArray(app.users?.student_profiles)
    ? app.users.student_profiles[0]
    : app.users?.student_profiles;
  const profileData = profile?.profile_data || {};

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

  return { acpcNumber, acpcMeritNumber };
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

/**
 * Generates Excel file for a specific board (GSEB or CBSE)
 */
async function generateBoardExcel(boardType, applications, boardPercentileMap, gujcetPercentileMap, outputFilePath) {
  console.log(`📊 Processing ${boardType} Board Students...`);
  const excelRows = [];

  for (const app of applications || []) {
    const collegeCode = (app.courses?.colleges?.code || '').toUpperCase();
    
    // Engineering college codes: ENGG (Degree) or DIP (Diploma)
    const isEngineering = collegeCode === 'ENGG' || collegeCode === 'DIP';
    if (!isEngineering) continue;

    // Extract enrollment number and check for "M"
    const profile = Array.isArray(app.users?.student_profiles)
      ? app.users.student_profiles[0]
      : app.users?.student_profiles;

    const enrollmentNumber = profile?.enrollment_number || '';
    if (!enrollmentNumber || !enrollmentNumber.toUpperCase().includes('M')) {
      continue;
    }

    // Filter by Board Type
    const formData = app.form_data || {};
    const boardStr = String(formData.board || formData.board_name || 'N/A').trim();
    
    let isTargetBoard = false;
    if (boardType === 'GSEB') {
      isTargetBoard = boardStr.toUpperCase().includes('GSEB') || 
                      boardStr.toUpperCase().includes('GSHEB') || 
                      boardStr.toUpperCase().includes('GUJARAT');
    } else if (boardType === 'CBSE') {
      isTargetBoard = boardStr.toUpperCase().includes('CBSE') || 
                      boardStr.toUpperCase().includes('CENTRAL BOARD');
    }

    if (!isTargetBoard) continue;

    // Extract ACPC details
    const { acpcNumber, acpcMeritNumber } = getAcpcDetails(app);

    // Extract Board Theory Marks
    const physicsTheory = getTheoryScore(formData, ['physics', 'phy', 'physics_theory']);
    const chemistryTheory = getTheoryScore(formData, ['chemistry', 'chem', 'chemistry_theory']);
    const mathTheory = getTheoryScore(formData, ['math', 'maths', 'mathematics', 'math_theory', 'maths_theory']);

    let boardPcmTotal = null;
    let boardPercentile = 'N/A';

    if (physicsTheory !== null && chemistryTheory !== null && mathTheory !== null) {
      boardPcmTotal = physicsTheory + chemistryTheory + mathTheory;
      boardPercentile = lookupPercentile(boardPcmTotal, boardPercentileMap);
    }

    // Extract GUJCET Marks
    const gujcetPhysics = getGujcetScore(formData, ['physics_gujcet', 'phy_gujcet', 'gujcet_physics']);
    const gujcetChemistry = getGujcetScore(formData, ['chemistry_gujcet', 'chem_gujcet', 'gujcet_chemistry']);
    const gujcetMaths = getGujcetScore(formData, ['mathematics_gujcet', 'math_gujcet', 'maths_gujcet', 'gujcet_math']);

    let gujcetTotal = null;
    let gujcetPercentile = 'N/A';

    if (gujcetPhysics !== null || gujcetChemistry !== null || gujcetMaths !== null) {
      gujcetTotal = (gujcetPhysics || 0) + (gujcetChemistry || 0) + (gujcetMaths || 0);
      gujcetPercentile = lookupPercentile(gujcetTotal, gujcetPercentileMap);
    }

    // Account admission details
    const accountAdm = Array.isArray(app.account_admissions)
      ? app.account_admissions[0]
      : app.account_admissions;

    excelRows.push({
      'Full Name': app.users?.full_name || 'N/A',
      'Email': app.users?.email || 'N/A',
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
      'GUJCET Physics': gujcetPhysics !== null ? gujcetPhysics : 'N/A',
      'GUJCET Chemistry': gujcetChemistry !== null ? gujcetChemistry : 'N/A',
      'GUJCET Maths': gujcetMaths !== null ? gujcetMaths : 'N/A',
      'GUJCET Total': gujcetTotal !== null ? gujcetTotal : 'N/A',
      'GUJCET Percentile': gujcetPercentile
    });
  }

  console.log(`✅ Extracted ${excelRows.length} ${boardType} student records.\n`);

  if (excelRows.length > 0) {
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${boardType}_Students_Percentile`);

    // Set column widths for readability
    worksheet['!cols'] = [
      { wch: 35 }, // Full Name
      { wch: 32 }, // Email
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
      { wch: 16 }, // GUJCET Physics
      { wch: 18 }, // GUJCET Chemistry
      { wch: 16 }, // GUJCET Maths
      { wch: 15 }, // GUJCET Total
      { wch: 18 }  // GUJCET Percentile
    ];

    XLSX.writeFile(workbook, outputFilePath);
    console.log(`🎉 ${boardType} Excel file generated successfully!`);
    console.log(`📍 Saved to: ${outputFilePath}\n`);

    console.log(`Preview of top 5 ${boardType} records:`);
    console.table(excelRows.slice(0, 5));
    console.log('-----------------------------------------------------\n');
  } else {
    console.log(`⚠️ No matching ${boardType} student records found.\n`);
  }
}

/**
 * Main Execution Function
 */
async function main() {
  console.log('🚀 Starting Multi-Board Student Export with Board & GUJCET Percentile Mappings...\n');

  // Load lookup maps
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

  // Generate GSEB Excel File
  await generateBoardExcel('GSEB', applications, gsebLookupMap, gujcetLookupMap, gsebOutputExcelPath);

  // Generate CBSE Excel File
  await generateBoardExcel('CBSE', applications, cbseLookupMap, gujcetLookupMap, cbseOutputExcelPath);
}

main();
