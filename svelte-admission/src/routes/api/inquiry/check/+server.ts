import { json } from '@sveltejs/kit';
import { getUnprocessedInquiry, mapInquiryToProfile } from '$lib/server/inquiry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    const q = url.searchParams.get('q');
    
    if (!q || q.length < 3) return json({ found: false });

    const inquiry = await getUnprocessedInquiry(supabase, q);
    
    if (inquiry) {
        const mappedData = await mapInquiryToProfile(inquiry);
        // Use the intelligently mapped name (which now prioritizes construction from parts)
        const finalFullName = mappedData.full_name || inquiry.full_name || '';
        
        return json({
            found: true,
            inquiryId: inquiry.id,
            fullName: finalFullName,
            email: inquiry.email,
            phone: inquiry.phone || mappedData.contact || mappedData.phone || '',
            mappedData: mappedData
        });
    }

    return json({ found: false });
};
