import type { SupabaseClient } from '@supabase/supabase-js';

export async function getUnprocessedInquiry(supabase: SupabaseClient, identifier: string) {
    if (!identifier) return null;

    const { data: inquiry, error } = await supabase
        .from('inquiries')
        .select(`
            *,
            form:inquiry_forms(schema_json),
            preferences:inquiry_preferences(
                priority,
                course_id,
                branch_id
            )
        `)
        .or(`email.eq.${identifier},phone.eq.${identifier},full_name.ilike.%${identifier}%`)
        .eq('is_processed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !inquiry) return null;
    return inquiry;
}

export async function mapInquiryToProfile(inquiry: any) {
    const profileData: Record<string, any> = {};
    const schema = inquiry.form?.schema_json;
    const inquiryData = inquiry.inquiry_data || {};
    
    // 1. Map via Schema Profile Links
    if (schema && schema.fields) {
        schema.fields.forEach((field: any) => {
            if (field.profileFieldKey && inquiryData[field.key]) {
                profileData[field.profileFieldKey] = inquiryData[field.key];
            }
        });
    }

    // 2. Attempt to construct a BETTER full name from individual parts in inquiry_data
    const data = inquiryData;
    const lowKeys = Object.keys(data).reduce((acc, k) => {
        acc[k.toLowerCase()] = data[k];
        return acc;
    }, {} as any);

    // Check for common name parts
    const parts = [
        lowKeys.title || lowKeys.salutation || lowKeys.prefix || lowKeys.student_title,
        lowKeys.first_name || lowKeys.fname || lowKeys.first || lowKeys.student_first_name,
        lowKeys.middle_name || lowKeys.mname || lowKeys.middle || lowKeys.student_middle_name,
        lowKeys.last_name || lowKeys.lname || lowKeys.surname || lowKeys.last || lowKeys.student_last_name
    ].filter(p => !!p && typeof p === 'string');

    const constructedName = parts.length > 0 ? parts.map(p => p.trim()).join(' ') : '';

    // If constructed name is significantly better/longer than the column, or column is missing
    if (constructedName && (!inquiry.full_name || constructedName.length > inquiry.full_name.length)) {
        profileData.full_name = constructedName;
    } else if (inquiry.full_name) {
        profileData.full_name = inquiry.full_name;
    }

    // 3. Last resort fallback to any key containing "name" (if still empty)
    if (!profileData.full_name) {
        const nameKey = Object.keys(data).find(k => k.toLowerCase().includes('name'));
        if (nameKey) profileData.full_name = data[nameKey];
    }

    // 4. Map standard columns for phone/contact if still empty
    if (inquiry.phone && (!profileData.phone && !profileData.contact)) {
        profileData.phone = inquiry.phone;
        profileData.contact = inquiry.phone;
    }

    if (!profileData.phone && !profileData.contact) {
        const phoneKey = Object.keys(inquiryData).find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('contact'));
        if (phoneKey) {
            profileData.phone = inquiryData[phoneKey];
            profileData.contact = inquiryData[phoneKey];
        }
    }

    return profileData;
}

export async function markInquiryAsProcessed(supabase: SupabaseClient, inquiryId: string) {
    await supabase
        .from('inquiries')
        .update({ is_processed: true })
        .eq('id', inquiryId);
}
