import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

async function resolveHodAffiliation(supabase: any, branch_id: string | null) {
    if (!branch_id) return { college_id: null, university_id: null };
    const { data } = await supabase
        .from('branches')
        .select(`
            course_id,
            courses(
                college_id,
                colleges(university_id)
            )
        `)
        .eq('id', branch_id)
        .single();
    
    if (data) {
        const course = data.courses as any;
        const college = course?.colleges as any;
        return {
            college_id: course?.college_id || null,
            university_id: college?.university_id || null
        };
    }
    return { college_id: null, university_id: null };
}

export const load: PageServerLoad = async ({ url, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    // Extract parameters for pagination and search
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.max(1, parseInt(url.searchParams.get('pageSize') || '25'));
    const searchEmail = url.searchParams.get('searchEmail') || '';
    const filterRole = url.searchParams.get('filterRole') || '';
    const filterUniversity = url.searchParams.get('filterUniversity') || '';
    const filterCollege = url.searchParams.get('filterCollege') || '';

    // Build the query
    let query = supabase
        .from('users')
        .select('*, universities(name), colleges(name), branches(name)', { count: 'exact' });

    if (searchEmail) {
        query = query.or(`email.ilike.%${searchEmail}%,full_name.ilike.%${searchEmail}%`);
    }

    if (filterRole) {
        query = query.eq('role', filterRole);
    }

    if (filterUniversity) {
        query = query.eq('university_id', filterUniversity);
    }

    if (filterCollege) {
        query = query.eq('college_id', filterCollege);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: users, count: totalCount, error: usersError } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

    // Fetch lists for dropdowns
    const { data: universities } = await supabase.from('universities').select('id, name');
    const { data: colleges } = await supabase.from('colleges').select('id, name, university_id');
    const { data: branches } = await supabase.from('branches').select('id, name, course_id, courses(college_id)');

    if (usersError) {
        console.error('Error fetching users:', usersError.message);
    }

    return {
        users: users || [],
        totalCount: totalCount || 0,
        universities: universities || [],
        colleges: colleges || [],
        branches: branches || [],
        filters: {
            page,
            pageSize,
            searchEmail,
            filterRole,
            filterUniversity,
            filterCollege
        }
    };
};

export const actions: Actions = {
    createUser: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const full_name = formData.get('full_name') as string;
        const role = formData.get('role') as string;
        const university_id = formData.get('university_id') as string || null;
        const college_id = formData.get('college_id') as string || null;
        const branch_id = formData.get('branch_id') as string || null;
        const hod_scope = (role === 'hod' ? (formData.get('hod_scope') as string || 'branch') : null);

        let resolved_college_id = college_id;
        let resolved_university_id = university_id;

        if (role === 'hod' && branch_id) {
            const resolved = await resolveHodAffiliation(supabase, branch_id);
            if (!resolved_college_id) resolved_college_id = resolved.college_id;
            if (!resolved_university_id) resolved_university_id = resolved.university_id;
        }

        const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

        if (!SERVICE_KEY) {
            return fail(500, { 
                message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing. Cannot create users programmatically.', 
                error: true 
            });
        }

        // Initialize Service Client
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SERVICE_KEY);

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm
            user_metadata: { full_name }
        });

        if (authError) {
            console.error('Error creating auth user:', authError.message);
            return fail(400, { message: authError.message, error: true });
        }

        if (!authData.user) {
            return fail(500, { message: 'Failed to create auth user.', error: true });
        }

        // 2. Create Public Profile
        // We use the admin client here too to bypass any RLS that might block 'insert' on users table
        // although our policy allows admins to insert.
        // Build insert payload — hod_scope only applies to hod role
        const insertPayload: Record<string, any> = {
            id: authData.user.id,
            email,
            role,
            full_name,
            university_id: resolved_university_id,
            college_id: resolved_college_id,
            branch_id
        };

        if (role === 'hod') {
            insertPayload.hod_scope = hod_scope;
        }

        let { error: profileError } = await supabaseAdmin.from('users').insert(insertPayload);

        // Graceful fallback: if hod_scope column doesn't exist yet, retry without it
        if (profileError && profileError.message?.includes('hod_scope')) {
            console.warn('hod_scope column not found, inserting without it. Run add_hod_scope.sql migration.');
            delete insertPayload.hod_scope;
            const fallback = await supabaseAdmin.from('users').insert(insertPayload);
            profileError = fallback.error;
        }

        if (profileError) {
            console.error('Error creating public profile:', profileError.message);
            // Optional: delete auth user if profile creation fails to keep consistency?
            return fail(500, { message: 'User created in Auth but failed to create profile: ' + profileError.message, error: true });
        }

        return { success: true, message: 'User created successfully!' };
    },

    resetPassword: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const userId = formData.get('id') as string;
        const newPassword = formData.get('newPassword') as string;

        const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

        if (!SERVICE_KEY) {
            return fail(500, { 
                message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing. Cannot reset passwords programmatically.', 
                error: true 
            });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SERVICE_KEY);

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword
        });

        if (error) {
            console.error('Error resetting password:', error.message);
            return fail(500, { message: error.message, error: true });
        }

        return { success: true, message: 'Password reset successfully!' };
    },

    updateRole: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const userId = formData.get('id') as string;
        const full_name = formData.get('full_name') as string;
        const role = formData.get('role') as string;
        const university_id = formData.get('university_id') as string || null;
        const college_id = formData.get('college_id') as string || null;
        const branch_id = formData.get('branch_id') as string || null;
        const hod_scope = (role === 'hod' ? (formData.get('hod_scope') as string || 'branch') : null);

        let resolved_college_id = college_id;
        let resolved_university_id = university_id;

        if (role === 'hod' && branch_id) {
            const resolved = await resolveHodAffiliation(supabase, branch_id);
            if (!resolved_college_id) resolved_college_id = resolved.college_id;
            if (!resolved_university_id) resolved_university_id = resolved.university_id;
        }

        // Prevent admin from removing their own admin status (safety check)
        if (userId === authenticatedUser.id && role !== 'admin') {
             return fail(400, { message: 'You cannot remove your own admin status.', error: true });
        }

        // Build update payload — hod_scope only applies to hod role
        const updatePayload: Record<string, any> = {
            full_name,
            role,
            university_id: resolved_university_id,
            college_id: resolved_college_id,
            branch_id
        };

        // Only include hod_scope if role is hod (column may not exist in older DBs)
        if (role === 'hod') {
            updatePayload.hod_scope = hod_scope;
        } else {
            updatePayload.hod_scope = null;
        }

        let { error } = await supabase.from('users').update(updatePayload).eq('id', userId);

        // Graceful fallback: if hod_scope column doesn't exist yet, retry without it
        if (error && error.message?.includes('hod_scope')) {
            console.warn('hod_scope column not found, updating without it. Run add_hod_scope.sql migration.');
            const fallbackPayload = { full_name, role, university_id, college_id, branch_id };
            const fallback = await supabase.from('users').update(fallbackPayload).eq('id', userId);
            error = fallback.error;
        }

        if (error) {
            console.error('Error updating user role:', error.message);
            return fail(500, { message: error.message, error: true });
        }

        return { success: true, message: 'User updated successfully!' };
    },

    deleteUser: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const userId = formData.get('id') as string;

        if (userId === authenticatedUser.id) {
            return fail(400, { message: 'You cannot delete yourself.', error: true });
        }

        // Delete from 'users' table. Note: This cascades to auth.users if Supabase is configured that way, 
        // but typically we delete from auth.users via service role. 
        // Since we don't have service role access easily here, we delete from public.users.
        // If there's a trigger, it might handle auth.users.
        // For now, removing from public.users removes their access to the app data.
        
        const { error } = await supabase.from('users').delete().eq('id', userId);

        if (error) {
            console.error('Error deleting user:', error.message);
            return fail(500, { message: error.message, error: true });
        }

        return { success: true, message: 'User deleted successfully!' };
    }
};