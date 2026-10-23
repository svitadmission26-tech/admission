import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { supabase, getAuthenticatedUser, userProfile }, cookies }) => {
    // 1. Handle OAuth Callback Fallback (if Supabase redirected to / instead of /auth/callback)
    const code = url.searchParams.get('code');
    if (code) {
        console.log('Root Load: Found auth code. Cookies:', cookies.getAll().map(c => c.name));
        const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
            console.error('Root Load: Error exchanging code for session:', error.message);
            // Don't throw, let it fall through to normal check or login page
        } else if (user) {
            console.log('Root Load: Successfully exchanged code for user:', user.id);
            
            // Fetch user profile
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();

            // Handle new user or missing role
            if (!profile || profileError || !profile.role) {
                console.warn('Root Load: Profile missing/incomplete. Fixing...');
                const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                await supabaseAdmin.from('users').upsert({
                    id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name || 'New Student',
                    role: 'student'
                }, { onConflict: 'id' });
                
                throw redirect(303, '/student');
            }

            // Existing user role redirect
            if (profile.role === 'student') {
                throw redirect(303, '/student');
            } else if (profile.role === 'admin') {
                throw redirect(303, '/admin/dashboard');
            } else if (profile.role === 'hod') {
                throw redirect(303, '/hod');
            }
            // Add other roles as needed, or let fall through to switch below
        }
    }

    // 2. Standard Session Check
    const user = await getAuthenticatedUser();
    
    // Fallback: If userProfile is missing in locals but user exists, fetch it.
    let role = userProfile?.role;
    if (user && !role) {
        console.log('Root Load: User found but profile missing in locals. Fetching...');
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        if (profile) {
            role = profile.role;
        }
    }

    if (user && role) {
        switch (role) {
            case 'student': 
                throw redirect(303, '/student');
            case 'admin': 
                throw redirect(303, '/admin/dashboard');
            case 'fee_collector': 
                throw redirect(303, '/fee-collector/dashboard');
            case 'deo': 
                throw redirect(303, '/deo/dashboard');
            case 'college_auth': 
                throw redirect(303, '/college-auth/dashboard');
            case 'univ_auth': 
            case 'university_auth':
                throw redirect(303, '/university-auth/dashboard');
            case 'adm_officer': 
                throw redirect(303, '/adm-officer/dashboard');
            case 'hod':
                throw redirect(303, '/hod');
            default:
                // If role is unknown or not handled, stay on home page
                break;
        }
    }

    // 3. Fetch Public Circulars for Guest Users
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: publicCirculars } = await supabaseAdmin
        .from('circulars')
        .select('*')
        .eq('is_public', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);

    // Generate Signed URLs for public access
    const circularsWithUrls = await Promise.all((publicCirculars || []).map(async (c) => {
        let signedUrl = null;
        if (c.file_path) {
            const { data } = await supabaseAdmin
                .storage
                .from('circulars')
                .createSignedUrl(c.file_path, 86400); // 24 hours validity
            signedUrl = data?.signedUrl;
        }
        return { ...c, signedUrl };
    }));

    return {
        publicCirculars: circularsWithUrls
    };
};
