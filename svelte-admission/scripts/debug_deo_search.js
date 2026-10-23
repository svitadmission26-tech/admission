import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sddtytppntogrppkwqdb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcxOTMwNiwiZXhwIjoyMDg0Mjk1MzA2fQ.3Ab6uJ-emZyP7yj0hAYjDKKBS3tMYmFd9eba6wCrpfI";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSearch(term) {
    console.log(`Testing search for: "${term}"`);

    let query = supabase
        .from('applications')
        .select(`
            id,
            status,
            users!applications_student_id_fkey (id, full_name, email)
        `)
        .limit(10);

    // The filter like in DEO applications
    if (term) {
        query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`, { foreignTable: 'users!applications_student_id_fkey' });
    }

    const { data, error } = await query;

    if (error) {
        console.error("Query Error:", error);
    } else {
        console.log(`Found ${data.length} results.`);
        if (data.length > 0) {
             console.log('First result:', JSON.stringify(data[0], null, 2));
        }
    }
}

testSearch('john'); // Try a name