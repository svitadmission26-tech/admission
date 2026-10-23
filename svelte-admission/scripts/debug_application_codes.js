
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugApplicationCodes() {
  console.log('Fetching latest application...');
  
  // Fetch the most recent application to see its linked data
  const { data: apps, error } = await supabase
    .from('applications')
    .select(`
        id,
        course_id, 
        branch_id, 
        form_type,
        courses ( id, name, code, college_id ), 
        branches ( id, name, code ), 
        admission_cycles ( 
            id, 
            academic_year_id, 
            academic_years ( id, name, short_code ) 
        )
    `)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching application:', error);
    return;
  }

  if (!apps || apps.length === 0) {
    console.log('No applications found.');
    return;
  }

  console.log(`Checking last ${apps.length} applications...`);
  let failCount = 0;

  apps.forEach(app => {
      const missing = [];
      if (!app.courses?.college_id) missing.push('College ID');
      if (!app.admission_cycles?.academic_year_id) missing.push('Academic Year ID');
      if (!app.admission_cycles?.academic_years?.short_code) missing.push('Academic Year Short Code');
      if (!app.courses?.code) missing.push('Course Code');
      if (!app.branches?.code) missing.push('Branch Code'); // Note: Branch ID might be null for some?

      // Special check: If branch_id is null, Branch Code is NOT missing, it's just not applicable.
      // But if branch_id IS present, Branch Code MUST be present.
      if (app.branch_id && !app.branches?.code) {
           // It was already caught above, but clarifying logic.
      } else if (!app.branch_id) {
           // Remove 'Branch Code' from missing list if it was added solely because app.branches is null
           const idx = missing.indexOf('Branch Code');
           if (idx > -1) missing.splice(idx, 1);
      }

      if (missing.length > 0) {
          failCount++;
          console.error(`❌ App ID ${app.id}: MISSING -> ${missing.join(', ')}`);
      }
  });

  console.log(`\nSummary: Checked ${apps.length}. Failed ${failCount}.`);
}

debugApplicationCodes();
