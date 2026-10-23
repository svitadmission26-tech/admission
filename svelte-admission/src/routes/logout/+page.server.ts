import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
    default: async ({ locals: { supabase }, cookies }) => {
        console.log('Server Action: Logging out...');
        
    const { error } = await supabase.auth.signOut();

    if (error) {
        console.error('Error logging out:', error.message);
    }

    // Redirect to the root path which now serves as the login page when unauthenticated
    throw redirect(303, '/');
    }
};