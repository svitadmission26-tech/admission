import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sddtytppntogrppkwqdb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcxOTMwNiwiZXhwIjoyMDg0Mjk1MzA2fQ.3Ab6uJ-emZyP7yj0hAYjDKKBS3tMYmFd9eba6wCrpfI";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSearch(term) {
    console.log(`Testing search for: "${term}"`);
    
    // College IDs simulation (get first few)
    const { data: colleges } = await supabase.from('colleges').select('id').limit(1);
    const collegeIds = colleges.map(c => c.id);
    console.log('College IDs:', collegeIds);
    
    // Course IDs simulation
    const { data: courses } = await supabase.from('courses').select('id').in('college_id', collegeIds);
    const courseIds = courses.map(c => c.id);

    console.log(`Searching in courses: ${courseIds.length}`);

    let query = supabase
        .from('applications')
        .select(`
            id,
            status,
            student_user:users!student_id!inner (full_name, email, student_profiles(enrollment_number))
        `)
        .in('course_id', courseIds)
        .eq('status', 'approved');

    // The filter in question
    query = query.or(`student_user.full_name.ilike.%${term}%,student_user.student_profiles.enrollment_number.ilike.%${term}%`);

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

testSearch('a'); // Try a common letter