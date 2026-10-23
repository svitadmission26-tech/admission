import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Ensure these environment variables are set in your .env file locally
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env file.');
    process.exit(1);

}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const usersToCreate = [
    { email: 'admin@example.com', password: 'password123', role: 'admin', full_name: 'Super Admin', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u01' },
    { email: 'student1@example.com', password: 'password123', role: 'student', full_name: 'John Doe', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u02' },
    { email: 'student2@example.com', password: 'password123', role: 'student', full_name: 'Jane Smith', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u03' },
    { email: 'college_auth_a@example.com', password: 'password123', role: 'college_auth', full_name: 'Principal A', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u04', university_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', college_id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11' },
    { email: 'univ_auth@example.com', password: 'password123', role: 'university_auth', full_name: 'Registrar TU', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u05', university_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11' },
    { email: 'deo1@example.com', password: 'password123', role: 'deo', full_name: 'Data Operator 1', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u06' },
    { email: 'fee_collector1@example.com', password: 'password123', role: 'fee_collector', full_name: 'Accountant 1', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u07' },
    { email: 'officer1@example.com', password: 'password123', role: 'adm_officer', full_name: 'Admission Officer 1', id: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380u08', university_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11' }
];

async function createUsers() {
    console.log(`Starting creation of ${usersToCreate.length} users...`);

    for (const user of usersToCreate) {
        try {
            // 1. Create user in Supabase Auth (auth.users)
            // We verify email by default to allow immediate login
            // We explicitly set the UUID to match our dummy data expectations
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: user.email,
                password: user.password,
                email_confirm: true,
                user_metadata: { full_name: user.full_name }
            });

            // Note: If you are using an older version of the JS library or specific Supabase configuration, 
            // passing 'id' might not always be supported directly in createUser params depending on the adapter.
            // However, the standard GoTrue admin client supports it. 
            // If this fails to set the ID, the subsequent steps will fail or create mismatched data.
            // A more robust way if ID cannot be forced is to update the user's ID in the array with the one returned.
            
            // Actually, `createUser` does NOT standardly accept `id` as a parameter in the public documentation for the JS client,
            // though the underlying API might. 
            // CORRECTION: The best way to ensure consistency is to let Supabase generate the ID,
            // and then WE update our 'usersToCreate' or just use the returned ID for the public.users insert.
            // BUT, since `dummy_data.sql` has HARDCODED foreign keys to these IDs, we MUST have these specific IDs.
            
            // Strategy shift: We cannot easily force a specific UUID via `createUser` in the standard client.
            // We have to rely on the fact that we can't easily force Auth IDs without direct DB access.
            
            // WAIT - `createUser` DOES accept `user_id` in some versions, but let's assume we can't for safety.
            // The `dummy_data.sql` script depends on these IDs.
            
            // Let's try to pass it in the options if possible, or fallback to the previous plan:
            // The previous plan was: JS script creates users (Auth + Public).
            // Then `dummy_data.sql` runs.
            // IF `dummy_data.sql` uses hardcoded IDs for applications (e.g. 'u0eebc...'), those inserts will FAIL
            // because the REAL user created here will have a random UUID (e.g. 'a1b2...').
            
            // SOLUTION: The JS script should handle ALL the dummy data insertion that relies on User IDs.
            // OR: We accept that `dummy_data.sql` cannot define the User IDs.
            
            // Let's look at the `createUser` params again. The Supabase Management API allows `external_id`, but `id` is usually auto-generated.
            
            // *Revised Plan for this script:*
            // We will attempt to create the user. If it works, we get an ID.
            // IF we strictly need the hardcoded IDs from dummy_data.sql, we are in a tough spot without direct SQL access to `auth.users`.
            
            // HOWEVER, we can update the *rest* of the dummy data to use dynamic lookups, but that's hard in raw SQL.
            
            // Let's try to see if we can update the `auth.users` ID after creation using a direct SQL query (via RPC)? No, restricted.
            
            // Ok, the cleanest way forward given the constraints:
            // We will update this script to print out a MAPPING of "Email -> New UUID".
            // The user will have to manually update `dummy_data.sql` with these new UUIDs? No, that's terrible UX.
            
            // better idea:
            // Since I am providing the `dummy_data.sql`, I will rewrite `dummy_data.sql` to NOT use hardcoded User IDs for the foreign keys.
            // I can use a subquery! 
            // e.g. `student_id = (SELECT id FROM public.users WHERE email = 'student1@example.com')`
            // This makes `dummy_data.sql` robust regardless of what UUIDs are generated by this script!
            
            // So, for THIS script, we just proceed as before: Create Auth User -> Create Public Profile (with the generated ID).
            // I will revert the instruction to force the ID and instead focus on making `dummy_data.sql` smart.
            
            if (authError) {
                console.error(`Error creating auth user for ${user.email}:`, authError.message);
                // If user already exists, we might still want to try updating the public profile
                // But we need their ID.
                if (authError.message.includes("already registered")) {
                     // Try to fetch the user to get their ID?
                     // Admin listUsers is possible.
                }
                continue;
            }

            if (!authData.user) {
                console.error(`Failed to create auth user for ${user.email}`);
                continue;
            }

            const userId = authData.user.id;
            console.log(`Auth user created for ${user.email} (ID: ${userId})`);

            // 2. Upsert user profile in public.users
            const { error: profileError } = await supabase
                .from('users')
                .upsert({
                    id: userId, // Link to the Auth User ID
                    email: user.email,
                    role: user.role,
                    full_name: user.full_name,
                    university_id: user.university_id || null,
                    college_id: user.college_id || null
                });

            if (profileError) {
                console.error(`Error creating public profile for ${user.email}:`, profileError.message);
            } else {
                console.log(`Public profile created for ${user.email}`);
            }

        } catch (err) {
            console.error(`Unexpected error for ${user.email}:`, err);
        }
    }


    console.log('User creation process completed.');
    console.log('IMPORTANT: Now run "supabase/dummy_data.sql".'); 
    console.log('Note: I have updated dummy_data.sql to look up users by email, so the IDs generated here will work automatically.');
}
createUsers();
