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
const gujcetLookupFilePath = path.join(process.cwd(), 'gujcetpdf.xlsx');
const outputExcelPath = path.join(process.cwd(), 'gseb_mq_nri_engineering_students_with_percentile.xlsx');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Loads standard PCM -> PERCENTILE lookup table (acpcpdf.xlsx)
 */
function loadStandardPercentileLookup(filePath) {
  console.log(`📄 Reading ACPC lookup file: ${filePath}`);
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

function lookupPercentile(score, map) {
  if (score === null || isNaN(score)) return 'N/A';
  if (map.has(score)) return map.get(score);

  const step025 = Math.round(score * 4) / 4;
  if (map.has(step025)) return map.get(step025);

  const roundedInt = Math.round(score);
  if (map.has(roundedInt)) return map.get(roundedInt);

  return 'Out of Range';
}

async function exportGsebStudents() {
  console.log('🚀 Starting GSEB Student Export with Board & GUJCET Percentiles...');
  
  const gsebLookupMap = loadStandardPercentileLookup(gsebLookupFilePath);
  const gujcetLookupMap = loadGujcetPercentileLookup(gujcetLookupFilePath);

  const { data: applications, error } = await supabase
    .from('applications')
    .select(`
      id, form_type, form_data, status, submitted_at, student_id,
      users:student_id ( id, full_name, email, student_profiles ( enrollment_number, profile_data ) ),
      courses:course_id ( id, name, code, colleges:college_id ( id, name, code ) ),
      account_admissions!inner ( id, admission_number )
    `)
    .ilike('form_type', 'MQ/NRI');

  if (error) {
    console.error('❌ Database Query Error:', error.message);
    return;
  }

  const excelRows = [];

  for (const app of applications || []) {
    const collegeCode = (app.courses?.colleges?.code || '').toUpperCase();
    const isEngineering = collegeCode === 'ENGG' || collegeCode === 'DIP';
    if (!isEngineering) continue;

    const profile = Array.isArray(app.users?.student_profiles) ? app.users.student_profiles[0] : app.users?.student_profiles;
    const enrollmentNumber = profile?.enrollment_number || '';
    if (!enrollmentNumber || !enrollmentNumber.toUpperCase().includes('M')) continue;

    const formData = app.form_data || {};
    const boardStr = String(formData.board || formData.board_name || 'N/A').trim();
    const isGseb = boardStr.toUpperCase().includes('GSEB') || boardStr.toUpperCase().includes('GSHEB') || boardStr.toUpperCase().includes('GUJARAT');
    if (!isGseb) continue;

    const { acpcNumber, acpcMeritNumber } = getAcpcDetails(app);

    const physicsTheory = getTheoryScore(formData, ['physics', 'phy', 'physics_theory']);
    const chemistryTheory = getTheoryScore(formData, ['chemistry', 'chem', 'chemistry_theory']);
    const mathTheory = getTheoryScore(formData, ['math', 'maths', 'mathematics', 'math_theory', 'maths_theory']);

    let boardPcmTotal = null;
    let boardPercentile = 'N/A';
    if (physicsTheory !== null && chemistryTheory !== null && mathTheory !== null) {
      boardPcmTotal = physicsTheory + chemistryTheory + mathTheory;
      boardPercentile = lookupPercentile(boardPcmTotal, gsebLookupMap);
    }

    const gujcetPhysics = getGujcetScore(formData, ['physics_gujcet', 'phy_gujcet', 'gujcet_physics']);
    const gujcetChemistry = getGujcetScore(formData, ['chemistry_gujcet', 'chem_gujcet', 'gujcet_chemistry']);
    const gujcetMaths = getGujcetScore(formData, ['mathematics_gujcet', 'math_gujcet', 'maths_gujcet', 'gujcet_math']);

    let gujcetTotal = null;
    let gujcetPercentile = 'N/A';
    if (gujcetPhysics !== null || gujcetChemistry !== null || gujcetMaths !== null) {
      gujcetTotal = (gujcetPhysics || 0) + (gujcetChemistry || 0) + (gujcetMaths || 0);
      gujcetPercentile = lookupPercentile(gujcetTotal, gujcetLookupMap);
    }

    const accountAdm = Array.isArray(app.account_admissions) ? app.account_admissions[0] : app.account_admissions;

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

  console.log(`✅ Extracted ${excelRows.length} GSEB student records.\n`);

  if (excelRows.length > 0) {
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'GSEB_Students_Percentile');

    worksheet['!cols'] = [
      { wch: 35 }, { wch: 32 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 15 },
      { wch: 35 }, { wch: 15 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
      { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 18 }
    ];

    XLSX.writeFile(workbook, outputExcelPath);
    console.log(`🎉 GSEB Excel file generated successfully!`);
    console.log(`📍 Saved to: ${outputExcelPath}\n`);
  }
}

exportGsebStudents();
