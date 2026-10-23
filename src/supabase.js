import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
// In the browser we talk to Supabase through a same-origin proxy so the
// app keeps working behind a Codespace forwarded URL.
const url =
	typeof window !== 'undefined'
		? `${window.location.origin}/supabase`
		: envUrl;
const key =
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
	import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT'));
export const supabase = configured ? createClient(url, key) : null;
