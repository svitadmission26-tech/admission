import { env } from '$env/dynamic/public';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export type FieldKind = 'text' | 'email' | 'phone' | 'select' | 'date' | 'number' | 'textarea' | 'checkbox';

export type Field = {
	id: string;
	label: string;
	kind: FieldKind;
	required: boolean;
	placeholder: string;
	help: string;
	options: string[];
};

export type Entry = {
	id: string;
	submittedAt: string;
	answers: Record<string, string | boolean>;
};

export type Form = {
	id: string;
	workspaceId: string;
	name: string;
	description: string;
	status: 'Draft' | 'Published';
	updatedAt: string;
	currentVersion: number;
	publishedVersionId: string | null;
	fields: Field[];
	entries: Entry[];
};

export type WorkspaceData = { id: string; name: string; forms: Form[] };

export function getSupabaseConfig() {
	const url = env.PUBLIC_SUPABASE_URL?.trim() ?? '';
	const anonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
	return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function createSupabaseClient(): SupabaseClient | null {
	const config = getSupabaseConfig();
	if (!config.configured) return null;
	return createClient(config.url, config.anonKey, {
		auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
	});
}

export async function loadWorkspace(client: SupabaseClient, user: User): Promise<WorkspaceData> {
	const membership = await client
		.from('workspace_members')
		.select('workspace_id, workspaces(id, name)')
		.eq('user_id', user.id)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();

	if (membership.error) throw membership.error;
	let workspaceId = membership.data?.workspace_id as string | undefined;
	let workspaceName = (membership.data?.workspaces as { name?: string } | null)?.name ?? 'My workspace';

	if (!workspaceId) {
		const created = await client
			.from('workspaces')
			.insert({ name: `${user.email?.split('@')[0] ?? 'My'} workspace`, created_by: user.id })
			.select('id, name')
			.single();
		if (created.error) throw created.error;
		workspaceId = created.data.id as string;
		workspaceName = created.data.name as string;

		const joined = await client.from('workspace_members').insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' });
		if (joined.error) throw joined.error;
	}

	const result = await client
		.from('forms')
		.select('id, workspace_id, name, description, status, updated_at, current_version, form_versions(id, version_number, schema_json, is_published), form_submissions(id, submitted_at, data)')
		.eq('workspace_id', workspaceId)
		.order('updated_at', { ascending: false });
	if (result.error) throw result.error;

	const forms = (result.data ?? []).map((row) => {
		const versions = (row.form_versions ?? []) as { id: string; version_number: number; schema_json: { fields?: Field[] }; is_published: boolean }[];
		const version = versions.find((item) => item.version_number === row.current_version);
		const publishedVersion = versions
			.filter((item) => item.is_published)
			.sort((a, b) => b.version_number - a.version_number)[0];
		const entries = (row.form_submissions ?? []) as { id: string; submitted_at: string; data: Record<string, string | boolean> }[];
		return {
			id: row.id as string,
			workspaceId: row.workspace_id as string,
			name: row.name as string,
			description: row.description as string,
			status: (row.status === 'published' ? 'Published' : 'Draft') as Form['status'],
			updatedAt: row.updated_at as string,
			currentVersion: row.current_version as number,
			publishedVersionId: publishedVersion?.id ?? null,
			fields: version?.schema_json?.fields ?? [],
			entries: entries.map((entry) => ({ id: entry.id, submittedAt: entry.submitted_at, answers: entry.data }))
		} satisfies Form;
	});

	return { id: workspaceId, name: workspaceName, forms };
}

export async function createFormRecord(client: SupabaseClient, user: User, form: Form) {
	const result = await client.from('forms').insert({
		id: form.id,
		workspace_id: form.workspaceId,
		name: form.name,
		description: form.description,
		status: 'draft',
		current_version: form.currentVersion,
		created_by: user.id
	});
	if (result.error) throw result.error;
	await saveFormRecord(client, form);
}

export async function saveFormRecord(client: SupabaseClient, form: Form) {
	const version = await client.from('form_versions').upsert({
		form_id: form.id,
		version_number: form.currentVersion,
		schema_json: { sections: [], fields: form.fields },
		is_published: false
	}, { onConflict: 'form_id,version_number' });
	if (version.error) throw version.error;

	const result = await client.from('forms').update({
		name: form.name,
		description: form.description,
		status: form.status.toLowerCase(),
		current_version: form.currentVersion,
		updated_at: new Date().toISOString()
	}).eq('id', form.id);
	if (result.error) throw result.error;
}

export async function publishFormRecord(client: SupabaseClient, form: Form) {
	const result = await client.from('form_versions').upsert({
		form_id: form.id,
		version_number: form.currentVersion,
		schema_json: { sections: [], fields: form.fields },
		is_published: true
	}, { onConflict: 'form_id,version_number' }).select('id').single();
	if (result.error) throw result.error;

	const updated = await client.from('forms').update({
		status: 'published',
		current_version: form.currentVersion,
		updated_at: new Date().toISOString()
	}).eq('id', form.id);
	if (updated.error) throw updated.error;
	return result.data.id as string;
}

export async function unpublishFormRecord(client: SupabaseClient, form: Form) {
	const result = await client.from('forms').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', form.id);
	if (result.error) throw result.error;
}

export async function submitEntry(client: SupabaseClient, user: User, form: Form, data: Record<string, string | boolean>) {
	if (!form.publishedVersionId) throw new Error('Publish this form before accepting responses.');
	const result = await client.from('form_submissions').insert({
		form_id: form.id,
		form_version_id: form.publishedVersionId,
		data,
		submitted_by: user.id
	}).select('id, submitted_at').single();
	if (result.error) throw result.error;
	return { id: result.data.id as string, submittedAt: result.data.submitted_at as string, answers: data };
}