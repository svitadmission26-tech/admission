
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const inputFileName = 'applications_match_report.xlsx';

async function updateMqnriBranches() {
  console.log(`Starting MQ/NRI branch update from ${inputFileName}...`);
  console.log('--------------------------------------------------');

  if (!fs.existsSync(inputFileName)) {
    console.error(`Error: File ${inputFileName} not found. Please run the match script first.`);
    return;
  }

  try {
    // 1. Read the Excel file
    const fileBuffer = fs.readFileSync(inputFileName);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = 'Common Records';
    if (!workbook.SheetNames.includes(sheetName)) {
      console.error(`Error: Sheet "${sheetName}" not found in ${inputFileName}.`);
      return;
    }

    const commonRecords = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log(`Found ${commonRecords.length} common records in Excel.`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 2. Process each match
    for (const record of commonRecords) {
      const mqId = record['MQ/NRI ID'];
      const provId = record['Prov ID'];
      const mqName = record['MQ Name'];

      if (!mqId || !provId) {
        console.warn(`Skipping record with missing IDs: ${JSON.stringify(record)}`);
        continue;
      }

      // Fetch the Provisional branch_id directly from DB to ensure we have the latest/correct ID
      const { data: provApp, error: provError } = await supabase
        .from('applications')
        .select('branch_id')
        .eq('id', provId)
        .single();

      if (provError || !provApp) {
        console.error(`Error fetching Prov application ${provId}:`, provError?.message || 'Not found');
        errorCount++;
        continue;
      }

      if (!provApp.branch_id) {
        // console.log(`Skipping ${mqName}: Provisional application has no branch assigned.`);
        skippedCount++;
        continue;
      }

      // 3. Update the MQ/NRI application
      const { error: updateError } = await supabase
        .from('applications')
        .update({ branch_id: provApp.branch_id })
        .eq('id', mqId);

      if (updateError) {
        console.error(`Error updating MQ/NRI ${mqId} (${mqName}):`, updateError.message);
        errorCount++;
      } else {
        console.log(`Updated: ${mqName.padEnd(30)} | MQ ID: ${mqId.slice(0,8)}... | Branch: ${record['Prov Branch']}`);
        successCount++;
      }
    }

    console.log('--------------------------------------------------');
    console.log(`Update Summary:`);
    console.log(`- Successfully Updated: ${successCount}`);
    console.log(`- Skipped (No Prov Branch): ${skippedCount}`);
    console.log(`- Errors: ${errorCount}`);
    console.log('--------------------------------------------------');

  } catch (err) {
    console.error('Fatal Error:', err.message);
  }
}

updateMqnriBranches();
