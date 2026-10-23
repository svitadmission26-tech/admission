import { json } from '@sveltejs/kit';
import { mapInquiryToProfile } from '$lib/server/inquiry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, userProfile } }) => {
    // Security check: Only staff can see inquiry data
    if (!userProfile || !['admin', 'adm_officer', 'deo', 'university_auth', 'college_auth'].includes(userProfile.role)) {
        return json([], { status: 403 });
    }

    const q = url.searchParams.get('q') || '';
    if (q.length < 3) return json([]);

    const { data, error } = await supabase
        .from('inquiries')
        .select('id, email, full_name, phone, inquiry_data, form:inquiry_forms(schema_json)')
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .eq('is_processed', false)
        .limit(10);

    if (error) {
        console.error('Inquiry search error:', error);
        return json([]);
    }

    // Process names using the intelligent mapper
    const processedResults = await Promise.all((data || []).map(async (inquiry) => {
        const mapped = await mapInquiryToProfile(inquiry);
        return {
            id: inquiry.id,
            email: inquiry.email,
            phone: inquiry.phone || mapped.contact || mapped.phone || '',
            full_name: inquiry.full_name || mapped.full_name || ''
        };
    }));

    return json(processedResults);
};
