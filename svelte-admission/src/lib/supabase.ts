import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { browser } from '$app/environment';
import { createBrowserClient } from '@supabase/ssr';
import { dev } from '$app/environment';

// In the browser we talk to Supabase through a same-origin proxy (`/supabase`)
// so the local stack stays reachable from a Codespace forwarded URL.
const supabaseUrl = browser ? `${window.location.origin}/supabase` : PUBLIC_SUPABASE_URL;

export const supabase = createBrowserClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: !dev
    }
});