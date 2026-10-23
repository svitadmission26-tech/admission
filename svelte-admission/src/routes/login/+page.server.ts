import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getAuthenticatedUser, userProfile } }) => {
    const user = await getAuthenticatedUser();
    // Only redirect if we have a valid profile. If user exists but profile is missing/null, 
    // stay on login page to avoid infinite redirect loops (e.g., / -> /student -> /login -> /).
    if (user && userProfile) {
        throw redirect(303, '/');
    }
};