
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFormSchema() {
    console.log('Fetching admission forms...');
    const { data: forms, error } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, schema_json')
        .limit(10);

    if (error) {
        console.error('Error fetching forms:', error);
        return;
    }

    if (!forms || forms.length === 0) {
        console.log('No admission forms found.');
        return;
    }

    console.log(`Found ${forms.length} forms.`);
    forms.forEach((form, index) => {
        console.log(`\n--- Form #${index + 1} ---`);
        console.log(`Type: ${form.form_type}`);
        console.log(`Course ID: ${form.course_id}`);
        console.log(`Schema JSON:`);
        console.dir(form.schema_json, { depth: null, colors: true });
        
        // specific check for the flag
        if (form.schema_json && typeof form.schema_json === 'object') {
             console.log(`Flag 'disable_branch_selection':`, form.schema_json.disable_branch_selection);
        }
    });
}

checkFormSchema();
