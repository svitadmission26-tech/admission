import { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '$lib/stores/userStore'; // Import UserProfile type

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
            getSession(): Promise<Session | null>; // Add getSession
			getAuthenticatedUser(): Promise<User | null>;
			userProfile: UserProfile | null; // Add userProfile to Locals
		}
		interface PageData {
			session: Session | null;
            // supabase: SupabaseClient; // Removed as we are using singleton on client
		}
		// interface Error {}
		// interface Platform {}
	}
}

export {};
