import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    // Check if locals.supabase is available, otherwise handle gracefully or throw
    if (!locals.supabase) {
        console.error('locals.supabase is not available');
        return {
            branding: null
        };
    }

    const { data: branding, error } = await locals.supabase
        .from('universities')
        .select('name, contact_email, contact_phone, website, footer_text')
        .limit(1)
        .single();

    if (error) {
        console.error('Error fetching university branding:', error);
        // Return default/fallback data on error
        return {
            branding: {
                name: 'University Admission System',
                contact_email: 'support@university.edu',
                contact_phone: '+1 234 567 890',
                website: '#',
                footer_text: '© 2026 University Name. All Rights Reserved.'
            }
        };
    }

    return {
        branding
    };
};