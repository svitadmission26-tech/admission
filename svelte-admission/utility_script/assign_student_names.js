
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env file.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function assignStudentNames() {
    console.log('🚀 Starting student name assignment process...');

    // 1. Fetch all student profiles
    const { data: profiles, error: fetchError } = await supabase
        .from('student_profiles')
        .select('user_id, profile_data, enrollment_number, admission_status');

    if (fetchError) {
        console.error('❌ Error fetching student profiles:', fetchError.message);
        return;
    }

    console.log(`📊 Found ${profiles.length} student profiles.`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
        const { user_id, profile_data } = profile;

        if (!profile_data) {
            console.warn(`⚠️ Skipping user ${user_id}: No profile_data found.`);
            skipCount++;
            continue;
        }

        // Extract name components (robust check for various key formats)
        const getVal = (obj, keys) => {
            for (const key of keys) {
                if (obj[key]) return obj[key];
                // Also check lowercase version
                const lowerKey = key.toLowerCase();
                if (obj[lowerKey]) return obj[lowerKey];
            }
            return '';
        };

        const firstName = getVal(profile_data, ['first_name', 'fname', 'first', 'student_first_name', 'firstName']);
        const middleName = getVal(profile_data, ['middle_name', 'mname', 'middle', 'student_middle_name', 'middleName']);
        const lastName = getVal(profile_data, ['last_name', 'lname', 'surname', 'last', 'student_last_name', 'lastName']);

        let fullName = [firstName, middleName, lastName]
            .map(name => name.trim())
            .filter(Boolean)
            .join(' ');

        // Fallback to single 'name' or 'full_name' field if components are missing
        if (!fullName) {
            fullName = getVal(profile_data, ['name_as_per_marksheet', 'name', 'full_name', 'name_as_per_aadhar']).trim();
        }

        if (!fullName) {
            console.warn(`⚠️ Skipping user ${user_id}: Could not construct full name from profile_data.`, profile_data);
            skipCount++;
            continue;
        }

        // Force Uppercase as per rules
        fullName = fullName.toUpperCase();

        try {
            // 2. Update auth.users metadata (raw_user_meta_data)
            // Passing only full_name to ensure other metadata fields remain untouched
            const { error: authError } = await supabase.auth.admin.updateUserById(user_id, {
                user_metadata: { 
                    full_name: fullName
                }
            });

            if (authError) {
                console.error(`❌ Error updating auth.users for ${user_id}:`, authError.message);
                errorCount++;
                continue;
            }

            // 3. Update public.users table
            const { error: publicError } = await supabase
                .from('users')
                .update({ full_name: fullName })
                .eq('id', user_id);

            if (publicError) {
                console.error(`❌ Error updating public.users for ${user_id}:`, publicError.message);
                errorCount++;
                continue;
            }

            console.log(`✅ Successfully updated ${user_id} -> "${fullName}"`);
            successCount++;

        } catch (err) {
            console.error(`💥 Unexpected error for user ${user_id}:`, err.message);
            errorCount++;
        }
    }

    console.log('\n--- Final Summary ---');
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`⚠️ Skipped:             ${skipCount}`);
    console.log(`❌ Errors:              ${errorCount}`);
    console.log('----------------------');
}

assignStudentNames();
