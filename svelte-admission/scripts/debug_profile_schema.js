
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkProfileFields() {
    console.log('Fetching student profile fields...');
    const { data: fields, error } = await supabase
        .from('student_profile_fields')
        .select('*');

    if (error) {
        console.error('Error fetching fields:', error);
        return;
    }

    if (!fields || fields.length === 0) {
        console.log('No profile fields found.');
        return;
    }

    console.log(`Found ${fields.length} fields.`);
    fields.forEach((field, index) => {
        if (field.type === 'select' || field.type === 'radio') {
            console.log(`\n--- Field #${index + 1} (${field.key}) ---`);
            console.log(`Type: ${field.type}`);
            console.log(`Options Type:`, typeof field.options);
            console.log(`Is Array?`, Array.isArray(field.options));
            console.log(`Options Value:`, JSON.stringify(field.options, null, 2));
        }
    });
}

checkProfileFields();
