import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { UserProfile } from '$lib/stores/userStore'; // Import UserProfile type
import dns from 'node:dns';
import { dev } from '$app/environment';

// Fix Node.js >= 17 IPv6 issues with Supabase
dns.setDefaultResultOrder('ipv4first');

// Bypass ISP DNS blocks (e.g., Reliance Jio) by forcing resolution to Cloudflare IPs
// We only do this in development mode so production servers use standard DNS.
let supabaseIp = '104.18.38.10'; 
let dnsResolved = false;

async function resolveSupabaseDns() {
    if (dnsResolved || !dev || !PUBLIC_SUPABASE_URL) return;
    
    const supabaseUrlObj = new URL(PUBLIC_SUPABASE_URL);
    try {
        const res = await fetch(`https://dns.google/resolve?name=${supabaseUrlObj.hostname}&type=A`);
        const data = await res.json();
        if (data && data.Answer && data.Answer.length > 0) {
            supabaseIp = data.Answer[0].data;
            console.log(`[Dev] Resolved Supabase URL to ${supabaseIp} via DoH`);
            dnsResolved = true;
        }
    } catch (err) {
        console.error('[Dev] Failed to resolve Supabase IP via DoH, using fallback.', err);
    }
}

if (dev && PUBLIC_SUPABASE_URL) {
    const supabaseUrlObj = new URL(PUBLIC_SUPABASE_URL);
    const originalLookup = dns.lookup;
    // @ts-ignore - Type overriding simplified for intercepting
    dns.lookup = function(hostname: string, options: any, callback: any) {
        if (hostname === supabaseUrlObj.hostname) {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (options && options.all) {
                return callback(null, [{ address: supabaseIp, family: 4 }]);
            }
            return callback(null, supabaseIp, 4);
        }
        return originalLookup(hostname, options, callback);
    };
}

export const handle: Handle = async ({ event, resolve }) => {
    // Resolve Supabase DNS lazily in development
    if (dev) resolveSupabaseDns();

	if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
		throw new Error('Missing required public environment variables: PUBLIC_SUPABASE_URL and/or PUBLIC_SUPABASE_ANON_KEY.');
	}

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: {
			fetch: event.fetch,
		},
		cookies: {
			get: (name) => {
                const value = event.cookies.get(name);
                // console.log(`Supabase Cookie GET: ${name} = ${value ? 'FOUND' : 'MISSING'}`);
                return value;
            },
			set: (name, value, options) => {
				event.cookies.set(name, value, { ...options, path: '/' });
			},
			remove: (name, options) => {
				event.cookies.delete(name, options);
			},
		},
        cookieOptions: {
            path: '/',
            sameSite: 'lax',
            secure: !dev
        }
	});

	/**
	 * A helper to get the session.
	 * Required by some legacy auth logic in admin routes.
	 */
	event.locals.getSession = async () => {
		const {
			data: { session },
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	/**
	 * A helper to get the authenticated user securely.
	 */
	event.locals.getAuthenticatedUser = async () => {
		const {
			data: { user },
		} = await event.locals.supabase.auth.getUser();
		return user;
	};

    // Fetch and set userProfile on locals
    const authenticatedUser = await event.locals.getAuthenticatedUser();
    let userProfile: UserProfile | null = null;

    if (authenticatedUser) {
        const { data: profile, error } = await event.locals.supabase
            .from('users')
            .select('id, email, role, full_name, university_id, college_id, branch_id, hod_scope')
            .eq('id', authenticatedUser.id)
            .maybeSingle();

        if (profile) {
            userProfile = profile as UserProfile;
        } else {
            console.error('Hooks: User authenticated but profile not found in public.users.', { id: authenticatedUser.id, error });
        }
    }
    event.locals.userProfile = userProfile;

	const response = await resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		},
	});

    // Prevent caching of HTML pages to fix "Back button after logout" issue
    if (response.headers.get('content-type')?.includes('text/html')) {
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
    }

    return response;
};
