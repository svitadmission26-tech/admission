import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getAuthenticatedUser } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (authenticatedUser) {
        throw redirect(303, '/login');
    }
};

export const actions: Actions = {
    default: async ({ request, locals: { supabase } }) => {
        const formData = await request.formData();
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const confirmPassword = formData.get('confirmPassword') as string;
        const full_name = formData.get('full_name') as string;

        if (!email || !password || !confirmPassword || !full_name) {
            return fail(400, { message: 'All fields are required', error: true });
        }

        if (password !== confirmPassword) {
            return fail(400, { message: 'Passwords do not match', error: true });
        }

        if (password.length < 6) {
            return fail(400, { message: 'Password must be at least 6 characters long', error: true });
        }

        // 1. Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: full_name,
                    role: 'student' // Default role for public registration
                }
            }
        });

        if (authError) {
            return fail(500, { message: authError.message, error: true });
        }

        if (authData.user) {
            // 2. Create user profile in public.users table
            const { error: profileError } = await supabase.from('users').insert({
                id: authData.user.id,
                email: email,
                full_name: full_name,
                role: 'student' // Explicitly set role
            });

            if (profileError) {
                console.error('Error creating user profile:', profileError);
                return fail(500, { message: 'Failed to create user profile. Please contact support.', error: true });
            }

            return { success: true, message: 'Registration successful! Please check your email to verify your account.' };
        }

        return fail(500, { message: 'Registration failed. Please try again.', error: true });
    }
};