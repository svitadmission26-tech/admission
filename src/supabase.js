import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
// Prefer the explicit Supabase URL from the environment so the app can point to
// the intended project in Codespaces, local development, or a hosted project.
// Only fall back to the same-origin /supabase proxy when no env URL is set.
const url = envUrl || (typeof window !== 'undefined' ? `${window.location.origin}/supabase` : '');
const key =
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
	import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT'));
export const supabase = configured ? createClient(url, key) : null;
