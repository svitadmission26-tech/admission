import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ params, locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile) {
        throw redirect(303, '/login');
    }

    const { data: record, error } = await supabase
        .from('busseva_fees')
        .select(`
            *,
            student:users!fk_busseva_fees_student (
                id,
                full_name,
                email,
                student_profiles (
                    enrollment_number,
                    profile_data
                ),
                active_app:applications!applications_student_id_fkey (
                    id,
                    courses (
                        name,
                        colleges ( 
                            name,
                            logo_url,
                            universities ( name, logo_url )
                        )
                    ),
                    branches ( name )
                )
            ),
            collector:users!fk_busseva_fees_collector (
                full_name
            )
        `)
        .eq('id', params.id)
        .single();

    if (error || !record) {
        throw redirect(303, '/busseva?error=Receipt+not+found');
    }

    // Role security check: allowed for collectors, DEOs, or the student themselves
    if (userProfile.role !== 'fee_collector' && userProfile.role !== 'deo' && userProfile.id !== record.student_id) {
        throw redirect(303, '/login');
    }

    // College restriction security check
    if (['fee_collector', 'deo'].includes(userProfile.role) && userProfile.college_id && record.college_id !== userProfile.college_id) {
        throw redirect(303, '/busseva?error=Unauthorized');
    }

    // Fetch photo and logo urls using admin client
    let photoUrl = '';
    let logoUrl = '';
    let collegeName = '';
    try {
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const studentId = record.student_id;
        
        const profileRaw = record.student?.student_profiles;
        const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
        const profileData = profile?.profile_data;
        
        const activeAppRaw = record.student?.active_app;
        const activeApp = Array.isArray(activeAppRaw) ? activeAppRaw[0] : activeAppRaw;
        const applicationId = activeApp?.id;

        // 1. Check documents table first for photo
        if (studentId || applicationId) {
            let docQuery = supabaseAdmin
                .from('documents')
                .select('file_path')
                .ilike('document_type', '%photo%')
                .order('created_at', { ascending: false });

            if (applicationId && studentId) {
                docQuery = docQuery.or(`application_id.eq.${applicationId},user_id.eq.${studentId}`);
            } else if (studentId) {
                docQuery = docQuery.eq('user_id', studentId);
            } else if (applicationId) {
                docQuery = docQuery.eq('application_id', applicationId);
            }

            const { data: docs } = await docQuery;
            if (docs && docs.length > 0) {
                const imgDoc = docs.find(d => /\.(jpg|jpeg|png)$/i.test(d.file_path || ''));
                if (imgDoc) {
                    const { data: urlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(imgDoc.file_path, 3600);
                    if (urlData) photoUrl = urlData.signedUrl;
                }
            }
        }

        // 2. Check profile_data.photo fallback
        if (!photoUrl && profileData?.photo && /\.(jpg|jpeg|png)$/i.test(profileData.photo)) {
            const { data: urlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(profileData.photo, 3600);
            if (urlData) photoUrl = urlData.signedUrl;
        }

        // 3. Resolve college details and logo url (college logo or university logo fallback)
        let rawLogoPath = '';
        
        if (record.college_id) {
            const { data: directCollege } = await supabaseAdmin
                .from('colleges')
                .select('name, logo_url, universities(name, logo_url)')
                .eq('id', record.college_id)
                .single();
            if (directCollege) {
                collegeName = directCollege.name;
                const university = Array.isArray(directCollege.universities) ? directCollege.universities[0] : directCollege.universities;
                rawLogoPath = directCollege.logo_url || university?.logo_url || '';
            }
        }

        // Fallback to active app join if direct college fetch wasn't successful
        if (!collegeName || !rawLogoPath) {
            const collegeRaw = activeApp?.courses?.colleges;
            const college = Array.isArray(collegeRaw) ? collegeRaw[0] : collegeRaw;
            
            const uniRaw = college?.universities;
            const university = Array.isArray(uniRaw) ? uniRaw[0] : uniRaw;
            
            if (!collegeName && college?.name) {
                collegeName = college.name;
            }
            if (!rawLogoPath) {
                rawLogoPath = college?.logo_url || university?.logo_url || '';
            }
        }

        if (rawLogoPath) {
            if (rawLogoPath.startsWith('http://') || rawLogoPath.startsWith('https://') || rawLogoPath.startsWith('data:')) {
                logoUrl = rawLogoPath;
            } else {
                const { data: publicData } = supabaseAdmin.storage.from('branding').getPublicUrl(rawLogoPath);
                if (publicData?.publicUrl) {
                    logoUrl = publicData.publicUrl;
                }
            }
        }
    } catch (e) {
        console.error('Error fetching student photo or logo for receipt:', e);
    }

    return { record, photoUrl, logoUrl, collegeName, userRole: userProfile.role };
};

export const actions = {
    updateReceipt: async ({ request, params, locals: { getSession, userProfile } }) => {
        const session = await getSession();
        if (!session || !userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
            return { success: false, error: 'Unauthorized' };
        }
        
        const formData = await request.formData();
        const route_name = formData.get('route_name') as string;
        const location = formData.get('location') as string;
        const receipt_number = formData.get('receipt_number') as string;
        const transaction_number = formData.get('transaction_number') as string;
        const total_amount = Number(formData.get('total_amount'));
        const payment_date = formData.get('payment_date') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Security check: college_id matching
        const { data: feeRecord } = await supabaseAdmin
            .from('busseva_fees')
            .select('college_id')
            .eq('id', params.id)
            .single();

        if (!feeRecord || (userProfile.college_id && feeRecord.college_id !== userProfile.college_id)) {
            return { success: false, error: 'Unauthorized' };
        }

        const { error } = await supabaseAdmin
            .from('busseva_fees')
            .update({
                route_name,
                location,
                receipt_number,
                transaction_number,
                total_amount,
                payment_date: new Date(payment_date).toISOString()
            })
            .eq('id', params.id);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    }
};
