
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSequences() {
    const { data: sequences, error } = await supabase
        .from('enrollment_sequences')
        .select('*, courses(name, code)');
    
    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Enrollment Sequences ---');
    console.table(sequences.map(s => ({
        id: s.id,
        course: s.courses?.name,
        code: s.courses?.code,
        prefix: s.prefix,
        current: s.current_sequence,
        course_id: s.course_id
    })));
}

checkSequences();
