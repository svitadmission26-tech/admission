import { writable } from 'svelte/store';
import type { Session } from '@supabase/supabase-js';

// Define a type for the user profile, including the role
export type UserProfile = {
    id: string;
    email: string;
    role: string;
    full_name?: string;
    university_id?: string;
    college_id?: string;
    branch_id?: string;
    hod_scope?: string;
};

// Writable store for user profile (including role)
export const userProfile = writable<UserProfile | null>(null);

// Writable store for Supabase session
export const sessionStore = writable<Session | null>(null);