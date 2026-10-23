
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncSequences() {
    console.log('Syncing Admission Sequences...');

    // 1. Fetch all sequences
    const { data: sequences, error: seqError } = await supabase
        .from('admission_sequences')
        .select('*');

    if (seqError) {
        console.error('Error fetching sequences:', seqError.message);
        return;
    }

    console.log(`Found ${sequences.length} sequences.`);

    for (const seq of sequences) {
        if (!seq.prefix) continue;

        console.log(`Checking sequence: ${seq.prefix} (Current: ${seq.current_sequence})`);

        // 2. Fetch all admission numbers matching this prefix
        const { data: admissions, error: admError } = await supabase
            .from('account_admissions')
            .select('admission_number')
            .ilike('admission_number', `${seq.prefix}%`);

        if (admError) {
            console.error(`  Error fetching admissions for ${seq.prefix}:`, admError.message);
            continue;
        }

        if (!admissions || admissions.length === 0) {
            console.log('  No admissions found for this prefix.');
            continue;
        }

        // 3. Find Max Suffix
        let maxSuffix = 0;
        admissions.forEach(adm => {
            const suffix = adm.admission_number.replace(seq.prefix, '');
            const num = parseInt(suffix, 10);
            if (!isNaN(num) && num > maxSuffix) {
                maxSuffix = num;
            }
        });

        console.log(`  Max existing suffix in DB: ${maxSuffix}`);

        // 4. Update if needed
        if (maxSuffix > seq.current_sequence) {
            console.log(`  ⚠️ Updating sequence from ${seq.current_sequence} to ${maxSuffix}`);
            const { error: updateError } = await supabase
                .from('admission_sequences')
                .update({ current_sequence: maxSuffix })
                .eq('id', seq.id);
            
            if (updateError) {
                console.error('  Error updating sequence:', updateError.message);
            } else {
                console.log('  ✅ Updated successfully.');
            }
        } else {
            console.log('  Sequence is in sync or ahead.');
        }
    }
}

syncSequences();
