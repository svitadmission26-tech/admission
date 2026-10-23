#!/usr/bin/env node
/**
 * Creates the local demo accounts in GoTrue and links them to public.users.
 *
 * Usage (against the local stack started by scripts/local-stack.sh):
 *   SUPABASE_URL=http://127.0.0.1:8020 \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role jwt> \
 *   DATABASE_URL=postgres://supabase_admin:postgres@127.0.0.1:55433/admission_v1 \
 *   node scripts/seed-local-users.mjs
 *
 * Every account is safe to re-create: an existing email is reused.
 */

import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:8020';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgres://supabase_admin:postgres@127.0.0.1:55433/admission_v1';

if (!SERVICE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY is required');
	process.exit(1);
}

const UNIVERSITY_ID = '11111111-1111-4111-8111-111111111111';
const COLLEGE_ID = '22222222-2222-4222-8222-222222222222';

const accounts = [
	{ email: 'admin@svit.test', password: 'Admin@123', role: 'admin', full_name: 'SVIT Admin' },
	{ email: 'admission@svit.test', password: 'Admission@123', role: 'adm_officer', full_name: 'Admission Officer' },
	{ email: 'deo@svit.test', password: 'Deo@123', role: 'deo', full_name: 'Data Entry Operator' },
	{ email: 'fee@svit.test', password: 'Fee@123', role: 'fee_collector', full_name: 'Fee Collector' },
	{ email: 'college@svit.test', password: 'College@123', role: 'college_auth', full_name: 'College Authority' },
	{ email: 'university@svit.test', password: 'University@123', role: 'university_auth', full_name: 'University Authority' },
	{ email: 'student@svit.test', password: 'Student@123', role: 'student', full_name: 'Demo Student' }
];

const headers = {
	apikey: SERVICE_KEY,
	Authorization: `Bearer ${SERVICE_KEY}`,
	'Content-Type': 'application/json'
};

async function createAuthUser(account) {
	const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			email: account.email,
			password: account.password,
			email_confirm: true,
			user_metadata: { full_name: account.full_name }
		})
	});

	if (response.ok) return (await response.json()).id;

	const body = await response.text();
	if (!body.includes('already been registered') && response.status !== 422) {
		throw new Error(`Could not create ${account.email}: ${response.status} ${body}`);
	}

	const lookup = await fetch(
		`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(account.email)}`,
		{ headers }
	);
	if (!lookup.ok) throw new Error(`Could not look up ${account.email}: ${lookup.status}`);
	const { users = [] } = await lookup.json();
	const existing = users.find((user) => user.email === account.email);
	if (!existing) throw new Error(`Auth user ${account.email} exists but was not found`);
	return existing.id;
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
	for (const account of accounts) {
		const id = await createAuthUser(account);
		await client.query(
			`INSERT INTO public.users (id, email, role, full_name, university_id, college_id)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (id) DO UPDATE
			   SET email = EXCLUDED.email,
			       role = EXCLUDED.role,
			       full_name = EXCLUDED.full_name,
			       university_id = EXCLUDED.university_id,
			       college_id = EXCLUDED.college_id`,
			[
				id,
				account.email,
				account.role,
				account.full_name,
				account.role === 'student' ? null : UNIVERSITY_ID,
				account.role === 'university_auth' ? null : COLLEGE_ID
			]
		);
		console.log(`ready: ${account.email} (${account.role}) password ${account.password}`);
	}
} finally {
	await client.end();
}
