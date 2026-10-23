import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sddtytppntogrppkwqdb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcxOTMwNiwiZXhwIjoyMDg0Mjk1MzA2fQ.3Ab6uJ-emZyP7yj0hAYjDKKBS3tMYmFd9eba6wCrpfI";
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const searchTerm = "a"; 
    console.log(`--- Debugging Payment Search for "${searchTerm}" ---`);

    // Get a valid course ID to simulate the context
    const { data: colleges } = await supabase.from('colleges').select('id').limit(1);
    const collegeIds = colleges.map(c => c.id);
    const { data: courses } = await supabase.from('courses').select('id').in('college_id', collegeIds);
    const courseIds = courses.map(c => c.id);

    console.log(`Context: ${courseIds.length} courses.`);

    // 1. Test filtering via embedding name 'applications' ?
    // In 'payments', 'application_id' is FK to 'applications'.
    // Embed: applications!inner ( ... )
    
    // Path: applications.student_id.full_name ??
    // No, student_id is a column in applications.
    // To filter on 'full_name' which is in 'users', we need to go deeper.
    // payments -> applications -> users
    
    // PostgREST Syntax: embedding.embedding.column
    // applications (embed) -> student_user (embed inside applications) -> full_name
    
    // The select string in +page.server.ts:
    // applications!inner ( ..., student_user:users!student_id(full_name, ...), ... )
    
    // So the path should probably be:
    // applications.student_user.full_name
    // OR applications.users.full_name (if alias is ignored in filter)
    // OR application_id.student_id.full_name (FKs)
    
    // Let's try: applications.student_id.full_name (FK traversal)
    // applications -> student_id (FK to users) -> full_name
    
    // Query Construction
    let query = supabase
        .from('payments')
        .select(`
            id,
            applications!inner (
                course_id,
                users!student_id(full_name)
            )
        `)
        .in('applications.course_id', courseIds);

    // Try Filter 1: applications.student_id.full_name
    const filter1 = `applications.student_id.full_name.ilike.%${searchTerm}%`;
    console.log(`\nTesting Filter: ${filter1}`);
    
    try {
        const { data: d1, error: e1 } = await query.or(filter1);
        if (e1) console.log("Error 1:", e1.message);
        else console.log("Success 1 count:", d1.length);
    } catch(e) { console.log(e); }

}

debug();
