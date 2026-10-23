
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixHemangAndSequences() {
    const hemangEmail = 'hemang@test.co.in';
    
    // 1. Find Hemang
    const { data: user } = await supabase.from('users').select('id').eq('email', hemangEmail).single();
    if (user) {
        console.log(`Found Hemang (ID: ${user.id}). Resetting enrollment...`);
        
        // Reset student profile
        const { error: err1 } = await supabase
            .from('student_profiles')
            .update({ 
                enrollment_number: null,
                admission_status: 'Pending'
            })
            .eq('user_id', user.id);
        
        if (err1) console.error('Error resetting profile:', err1.message);

        // Reset user college affiliation
        const { error: err2 } = await supabase
            .from('users')
            .update({ college_id: null })
            .eq('id', user.id);
            
        if (err2) console.error('Error resetting user:', err2.message);
        
        console.log('Hemang reset successfully. He can now be re-enrolled with the correct BCA ID.');
    }

    // 2. Clean up old 'ENR-' sequences
    console.log('\nCleaning up stale enrollment sequences with old "ENR-" prefix...');
    const { error: err3 } = await supabase
        .from('enrollment_sequences')
        .delete()
        .ilike('prefix', 'ENR-%');
    
    if (err3) {
        console.error('Error deleting old sequences:', err3.message);
    } else {
        console.log('Stale sequences removed.');
    }
}

fixHemangAndSequences();
