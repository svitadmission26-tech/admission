import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, userProfile } }) => {
    // Security check: Only staff can see inquiry emails
    if (!userProfile || !['admin', 'adm_officer', 'deo', 'university_auth', 'college_auth'].includes(userProfile.role)) {
        return json([], { status: 403 });
    }

    const q = url.searchParams.get('q') || '';
    if (q.length < 3) return json([]);

    const { data, error } = await supabase
        .from('inquiries')
        .select('email')
        .ilike('email', `%${q}%`)
        .eq('is_processed', false)
        .limit(10);

    if (error) {
        console.error('Email autocomplete error:', error);
        return json([]);
    }

    // Return unique emails only
    const uniqueEmails = [...new Set((data || []).map(i => i.email))];
    return json(uniqueEmails);
};
