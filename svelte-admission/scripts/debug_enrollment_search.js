import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sddtytppntogrppkwqdb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcxOTMwNiwiZXhwIjoyMDg0Mjk1MzA2fQ.3Ab6uJ-emZyP7yj0hAYjDKKBS3tMYmFd9eba6wCrpfI";
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const searchTerm = "F001";
    console.log(`--- Debugging Search for "${searchTerm}" ---`);

    // 1. Check if the Enrollment Number exists in student_profiles
    const { data: profiles, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id, enrollment_number')
        .ilike('enrollment_number', `%${searchTerm}%`);

    if (profileError) console.error("Profile Check Error:", profileError);
    else console.log("Found Profiles:", profiles?.length, profiles);

    if (!profiles || profiles.length === 0) {
        console.log("Stopping: No profile found with that enrollment number.");
        return;
    }

    const userId = profiles[0].user_id;

    // 2. Check if this user has an approved application
    const { data: apps, error: appError } = await supabase
        .from('applications')
        .select('id, status, course_id')
        .eq('student_id', userId)
        .eq('status', 'approved');

    if (appError) console.error("Application Check Error:", appError);
    else console.log("Found Approved Apps:", apps?.length, apps);

    // 3. Test the Report Query Syntax
    // Scenario A: Use 'users' in filter
    console.log("\n--- Testing Filter Syntax: users.full_name ---");
    const queryA = supabase
        .from('applications')
        .select(
            `
            id,
            users!student_id!inner(full_name, student_profiles(enrollment_number))
        `
        )
        .eq('status', 'approved')
        .or(`users.student_profiles.enrollment_number.ilike.%${searchTerm}%`); // Just testing the enrollment part

    const { data: resA, error: errA } = await queryA;
    if (errA) console.log("Result A Error:", errA.message);
    else console.log("Result A Count:", resA.length);

    // Scenario B: Use 'student_id' (FK name) in filter (Previous attempts failed/confused)
    console.log("\n--- Testing Filter Syntax: student_id.student_profiles.enrollment_number ---");
    /*
        Note: In PostgREST, if you embed with `users!student_id`, the resource name is `users`.
        But sometimes filtering requires using the FK column name if explicit embedding isn't fully inferred in the filter parser?
        Or maybe `users` is correct but the nested `student_profiles` path is the issue.
    */
   
    // Scenario C: Use 'users' but check if 'student_profiles' needs !inner in the filter path? No, filter paths are dot-separated.
    
    // Scenario D: Try filtering just on name first to isolate the nesting issue.
    console.log("\n--- Testing Name Search Only (users.full_name) ---");
    const queryD = supabase
        .from('applications')
        .select(
            `
            id,
            users!student_id!inner(full_name)
        `
        )
        .eq('status', 'approved')
        .or(`users.full_name.ilike.%a%`); // Search 'a'
        
    const { data: resD, error: errD } = await queryD;
    if (errD) console.log("Result D Error:", errD.message);
    else console.log("Result D Count:", resD.length);

}

debug();
