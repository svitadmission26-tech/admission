import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sddtytppntogrppkwqdb.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcxOTMwNiwiZXhwIjoyMDg0Mjk1MzA2fQ.3Ab6uJ-emZyP7yj0hAYjDKKBS3tMYmFd9eba6wCrpfI";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZHR5dHBwbnRvZ3JwcGt3cWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MTkzMDYsImV4cCI6MjA4NDI5NTMwNn0.azwMTZZjhOlxn7RWMARAR-ZOEjXaRp2t_OQN-fQ4SCA";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

const testEmail = "sohamondhiya01052008@gmail.com";
const testName = "Mr. SOHAM VISHALBHAI ONDHIYA";

async function runTests() {
    console.log("=".repeat(70));
    console.log("DEO SEARCH DIAGNOSTIC TEST");
    console.log("=".repeat(70));
    console.log(`Looking for: "${testName}" <${testEmail}>\n`);

    // 1. Users with service role key (what my fix uses)
    console.log("--- TEST 1: Service Role Query on users table ---");
    const { data: allStudents, error: err1 } = await supabaseAdmin
        .from("users")
        .select("id, email, full_name, role")
        .eq("role", "student");
    if (err1) {
        console.error("  ERROR:", err1.message);
    } else {
        console.log(`  Total students (role='student'): ${allStudents.length}`);
        const match = allStudents.find(s => s.email === testEmail);
        if (match) {
            console.log(`  ✓ STUDENT FOUND: id=${match.id}, name="${match.full_name}", role="${match.role}"`);
        } else {
            console.log(`  ✗ STUDENT NOT FOUND by email`);
            // Check partial matches
            const partial = allStudents.filter(s =>
                s.email?.toLowerCase().includes(testEmail.split('@')[0]) ||
                s.full_name?.toLowerCase().includes('soham')
            );
            console.log(`  Partial matches (contains "soham"): ${partial.length}`);
            partial.forEach(s => console.log(`    - "${s.full_name}" <${s.email}> role="${s.role}"`));
        }
    }

    // 2. All users grouped by role (service role)
    console.log("\n--- TEST 2: All users by role (service role) ---");
    const { data: allUsers, error: err2 } = await supabaseAdmin
        .from("users")
        .select("role");
    if (err2) {
        console.error("  ERROR:", err2.message);
    } else {
        const roleCount = {};
        allUsers.forEach(u => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });
        Object.entries(roleCount).forEach(([role, count]) => {
            console.log(`  ${role}: ${count}`);
        });
        // Check if test user exists with any role
        const { data: anyRole } = await supabaseAdmin
            .from("users")
            .select("id, email, full_name, role")
            .eq("email", testEmail)
            .maybeSingle();
        if (anyRole) {
            console.log(`\n  Test user EXISTS with role="${anyRole.role}"`);
        } else {
            console.log(`\n  ✗ Test user NOT FOUND in users table AT ALL`);
        }
    }

    // 3. Anon key query (simulating what DEO sees via regular supabase client)
    console.log("\n--- TEST 3: Anon Key Query on users (simulates DEO with RLS) ---");
    const { data: anonStudents, error: err3 } = await supabaseAnon
        .from("users")
        .select("id, email, full_name, role")
        .eq("role", "student");
    if (err3) {
        // RLS errors typically return empty array, not error, for SELECT
        console.log(`  Results: ${anonStudents?.length || 0}`);
        console.log(`  Error: ${err3.message}`);
    } else {
        console.log(`  Total students (role='student'): ${anonStudents.length}`);
        if (anonStudents.length === 0) {
            console.log("  ⚠ RLS BLOCKING: Anon key returned 0 students (DEO can't see anyone)");
        }
    }

    // 4. Check student_profiles for orphans
    console.log("\n--- TEST 4: Orphaned student_profiles (no matching users row) ---");
    const { data: orphans, error: err4 } = await supabaseAdmin
        .from("student_profiles")
        .select("user_id, profile_data->>name, enrollment_number")
        .limit(20);
    if (err4) {
        console.error("  ERROR:", err4.message);
    } else {
        // Check each profile against users table
        let orphanCount = 0;
        for (const sp of orphans) {
            const { data: u } = await supabaseAdmin
                .from("users")
                .select("id")
                .eq("id", sp.user_id)
                .maybeSingle();
            if (!u) {
                orphanCount++;
                if (orphanCount <= 5) {
                    console.log(`  ORPHAN: user_id=${sp.user_id}, name="${sp.name || 'N/A'}"`);
                }
            }
        }
        if (orphanCount === 0) {
            console.log(`  ✓ No orphans (all ${orphans.length} profiles have matching users)`);
        } else {
            console.log(`  ⚠ ${orphanCount} orphan profiles found (out of ${orphans.length} checked)`);
        }
    }

    // 5. Auth users without public.users entry
    console.log("\n--- TEST 5: Auth users missing from public.users ---");
    try {
        const { data: authUsers, error: err5 } = await supabaseAdmin.auth.admin.listUsers();
        if (err5) throw err5;
        let missing = 0;
        for (const au of authUsers.users) {
            const { data: pu } = await supabaseAdmin
                .from("users")
                .select("id")
                .eq("id", au.id)
                .maybeSingle();
            if (!pu) {
                missing++;
                if (missing <= 5) {
                    console.log(`  MISSING: auth_id=${au.id}, email=${au.email}`);
                }
            }
        }
        console.log(`  Auth users: ${authUsers.users.length}, Missing from public.users: ${missing}`);
    } catch (e) {
        console.log(`  Auth admin API may not be available: ${e.message}`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("DIAGNOSTIC COMPLETE");
    console.log("=".repeat(70));
}

runTests().catch(console.error);
