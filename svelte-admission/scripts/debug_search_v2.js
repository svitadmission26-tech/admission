import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sddtytppntogrppkwqdb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcxOTMwNiwiZXhwIjoyMDg0Mjk1MzA2fQ.3Ab6uJ-emZyP7yj0hAYjDKKBS3tMYmFd9eba6wCrpfI";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSearch(term) {
    console.log(`Testing search for: "${term}"`);
    
    const { data: colleges } = await supabase.from('colleges').select('id').limit(1);
    const collegeIds = colleges.map(c => c.id);
    const { data: courses } = await supabase.from('courses').select('id').in('college_id', collegeIds);
    const courseIds = courses.map(c => c.id);

    // Current State Query
    let query = supabase
        .from('applications')
        .select(`
            id,
            users!student_id!inner (full_name)
        `)
        .in('course_id', courseIds)
        .eq('status', 'approved');

    // Attempt 1: Raw 'users' - might be ambiguous or require embedding key
    // The select uses 'users!student_id!inner'.
    // If I filter with 'users.full_name', PostgREST might expect 'users' to be the embedding name.
    
    // query = query.or(`users.full_name.ilike.%${term}%`); // Let's try simple first
    
    // Actually, 'users' is the table name. 'student_id' is the FK.
    // If the embedding is disambiguated with !student_id, the resource name in the response is 'users'.
    // BUT for filtering, we might need to specify the embedding?
    // PostgREST docs say: "To filter by an embedded resource, append the embedded resource name to the column."
    
    // Let's try finding the correct syntax.
    try {
        const { data, error } = await query.or(`users.full_name.ilike.%${term}%`);
        if (error) console.log("Attempt 1 Error (users.full_name):", error.message);
        else console.log("Attempt 1 Success:", data?.length);
    } catch(e) { console.log(e) }

}

testSearch('a');