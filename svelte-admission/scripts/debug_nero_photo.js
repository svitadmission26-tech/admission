import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, full_name')
        .ilike('full_name', '%Nero Nielsen%');

    if (userError) {
        console.error('User search error:', userError);
        return;
    }

    if (!users || users.length === 0) {
        console.log('No user found with name Nero Nielsen');
        return;
    }

    console.log('Found users:', users);

    const userId = users[0].id;

    const { data: apps, error: appError } = await supabase
        .from('applications')
        .select('id, student_id, form_type')
        .eq('student_id', userId);

    if (appError) {
        console.error('Application search error:', appError);
        return;
    }

    console.log('Found applications:', apps);

    if (apps && apps.length > 0) {
        const appId = apps[0].id;
        console.log('--- DEBUGGING DATA FETCH FOR APP ID:', appId);
        
        const { data: profile, error: profError } = await supabase
            .from('student_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();
            
        if (profError) console.error('Profile error:', profError);
        console.log('Student Profile Data:', JSON.stringify(profile?.profile_data, null, 2));

        const { data: docs, error: docError } = await supabase
            .from('documents')
            .select('*')
            .eq('user_id', userId);
            
        console.log('All documents for user:', docs.map(d => ({ type: d.document_type, path: d.file_path })));
        
        const photoDocs = docs.filter(d => (d.document_type || '').toLowerCase().includes('photo'));
        console.log('Filtered photo documents:', photoDocs);

        if (photoDocs.length > 0) {
            const { data: urlData, error: storageError } = await supabase.storage.from('documents').createSignedUrl(photoDocs[0].file_path, 3600);
            console.log('Signed URL Result (Doc):', urlData?.signedUrl ? 'SUCCESS' : 'FAILED');
            if (storageError) console.error('Storage error:', storageError);
        } else if (profile?.profile_data?.photo) {
            console.log('Falling back to profile_data.photo:', profile.profile_data.photo);
            const { data: urlData, error: storageError } = await supabase.storage.from('documents').createSignedUrl(profile.profile_data.photo, 3600);
            console.log('Signed URL Result (Profile Fallback):', urlData?.signedUrl ? 'SUCCESS' : 'FAILED');
            if (storageError) console.error('Storage error:', storageError);
        }
    }
}

debug();
