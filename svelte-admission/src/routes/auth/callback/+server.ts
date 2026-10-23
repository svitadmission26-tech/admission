import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    const code = url.searchParams.get('code');

    if (code) {
        const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
            console.error('Error exchanging code for session:', error.message);
            throw redirect(303, '/?error=' + encodeURIComponent(error.message));
        }

        if (user) {
            console.log('Google Auth: User authenticated:', user.id, user.email);

            // Fetch user profile to determine role
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();
            
            console.log('Google Auth: Fetched profile:', profile, 'Error:', profileError);

            // Handle new user case (missing profile) or existing user with no role
            if (!profile || profileError || !profile.role) {
                console.warn('Profile missing, error fetching, or no role. Assuming new student:', profileError?.message);

                // Use Service Role to bypass RLS and insert/update profile
                const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

                const { error: insertError } = await supabaseAdmin
                    .from('users')
                    .upsert({
                        id: user.id,
                        email: user.email,
                        full_name: user.user_metadata?.full_name || 'New Student',
                        role: 'student'
                    }, { onConflict: 'id' });

                if (insertError) {
                    console.error('Error creating/updating default student profile:', insertError.message);
                } else {
                    console.log('Created/Updated student profile for user:', user.id);
                }
                
                // New/Updated student -> /student
                console.log('Redirecting new/updated user to /student');
                throw redirect(303, '/student?refresh=true');
            }

            // Existing user -> check role
            console.log('Checking role for existing user:', profile.role);
            if (profile.role === 'student') {
                console.log('Role is student, redirecting to /student');
                throw redirect(303, '/student?refresh=true');
            }

            // Fallback for other roles or if role check fails
            console.warn('Role not matched or handled in callback, redirecting to root. Role was:', profile.role);
            throw redirect(303, '/');
        }
    }

    console.error('No user found after code exchange');
    throw redirect(303, '/');
};
