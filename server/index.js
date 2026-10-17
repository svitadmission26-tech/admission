import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient =
	supabaseUrl && serviceRoleKey
		? createClient(supabaseUrl, serviceRoleKey, {
				auth: { persistSession: false, autoRefreshToken: false },
			})
		: null;

app.get('/api/health', (_req, res) =>
	res.json({ ok: true, service: 'svit-api' }),
);

async function requireAdmin(req, res, next) {
	if (!adminClient || !supabaseUrl || !anonKey) {
		return res
			.status(503)
			.json({ error: 'Server Supabase environment is not configured.' });
	}

	const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
	if (!bearer) return res.status(401).json({ error: 'Missing bearer token.' });

	try {
		const authClient = createClient(supabaseUrl, anonKey, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
		const {
			data: { user },
			error: authError,
		} = await authClient.auth.getUser(bearer[1]);
		if (authError || !user)
			return res.status(401).json({ error: 'Invalid or expired session.' });

		const { data: profile, error: profileError } = await adminClient
			.from('profiles')
			.select('role')
			.eq('id', user.id)
			.single();
		if (profileError)
			return res.status(403).json({ error: 'Could not verify administrator access.' });
		if (profile.role !== 'admin')
			return res.status(403).json({ error: 'Administrator access required.' });

		req.actor = user;
		next();
	} catch (error) {
		console.error('Admin API authorization failed:', error);
		return res.status(500).json({ error: 'Authorization failed.' });
	}
}

const isUuid = (value) =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);

async function validateStaffAssignment(roleCode, departmentId, facultyId, res) {
	if (typeof roleCode !== 'string' || roleCode === 'admin') {
		res.status(400).json({ error: 'Select a valid non-administrator role.' });
		return false;
	}
	const { data: role, error: roleError } = await adminClient
		.from('staff_roles')
		.select('code')
		.eq('code', roleCode)
		.neq('code', 'admin')
		.maybeSingle();
	if (roleError) {
		res.status(500).json({ error: roleError.message });
		return false;
	}
	if (!role) {
		res.status(400).json({ error: 'Unknown staff role.' });
		return false;
	}

	if (roleCode === 'faculty') {
		if (!isUuid(facultyId)) {
			res.status(400).json({ error: 'Select a valid faculty record.' });
			return false;
		}
		const { data: facultyMember, error: facultyError } = await adminClient
			.from('faculty')
			.select('id')
			.eq('id', facultyId)
			.eq('active', true)
			.maybeSingle();
		if (facultyError) {
			res.status(500).json({ error: facultyError.message });
			return false;
		}
		if (!facultyMember) {
			res.status(400).json({ error: 'Select an active faculty record.' });
			return false;
		}
	} else if (facultyId !== null && facultyId !== undefined && facultyId !== '') {
		res.status(400).json({ error: 'Only Faculty users can be linked to a faculty record.' });
		return false;
	}

	if (departmentId !== null && departmentId !== undefined && departmentId !== '') {
		if (!isUuid(departmentId)) {
			res.status(400).json({ error: 'Department ID must be a valid UUID.' });
			return false;
		}
		const { data: department, error: departmentError } = await adminClient
			.from('departments')
			.select('id')
			.eq('id', departmentId)
			.eq('active', true)
			.maybeSingle();
		if (departmentError) {
			res.status(500).json({ error: departmentError.message });
			return false;
		}
		if (!department) {
			res.status(400).json({ error: 'Select an active department.' });
			return false;
		}
	}
	return true;
}

app.post('/api/admin/users', requireAdmin, async (req, res) => {
	const {
		email,
		full_name: fullName,
		role_code: roleCode,
		department_id: departmentId,
		faculty_id: facultyId,
	} = req.body || {};
	if (
		typeof email !== 'string' ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
		typeof fullName !== 'string' ||
		fullName.trim().length < 2
	) {
		return res.status(400).json({ error: 'Enter a valid email address and full name.' });
	}

	try {
		if (!(await validateStaffAssignment(roleCode, departmentId, facultyId, res))) return;
		const { data: invite, error: inviteError } =
			await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
				data: { full_name: fullName.trim() },
			});
		if (inviteError) return res.status(400).json({ error: inviteError.message });
		if (!invite.user)
			return res.status(500).json({ error: 'Invitation did not return a user record.' });

		const userId = invite.user.id;
		const { error: profileError } = await adminClient.from('profiles').upsert({
			id: userId,
			full_name: fullName.trim(),
			role: 'student',
		});
		const { error: memberError } = profileError
			? { error: profileError }
			: await adminClient.from('staff_members').insert({
					user_id: userId,
					role_code: roleCode,
					department_id: departmentId || null,
					faculty_id: roleCode === 'faculty' ? facultyId : null,
				});
		if (profileError || memberError) {
			const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId);
			return res.status(500).json({
				error: profileError?.message || memberError.message,
				...(cleanupError
					? { cleanup_error: `Invited account cleanup failed: ${cleanupError.message}` }
					: {}),
			});
		}

		const { error: auditError } = await adminClient.from('audit_logs').insert({
			actor_id: req.actor.id,
			action: 'staff.invite',
			entity: 'staff_members',
			entity_id: userId,
		});
		if (auditError) {
			return res.status(500).json({
				error: `Invitation and staff record were created, but audit logging failed: ${auditError.message}`,
			});
		}
		return res.status(201).json({
			id: userId,
			email: invite.user.email,
			role_code: roleCode,
		});
	} catch (error) {
		console.error('Staff invitation failed:', error);
		return res.status(500).json({ error: 'Staff invitation failed.' });
	}
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
	const userId = req.params.id;
	const {
		role_code: roleCode,
		department_id: departmentId,
		faculty_id: facultyId,
		active,
	} = req.body || {};
	if (!isUuid(userId))
		return res.status(400).json({ error: 'User ID must be a valid UUID.' });
	if (typeof active !== 'boolean')
		return res.status(400).json({ error: 'Account access must be active or disabled.' });

	try {
		if (!(await validateStaffAssignment(roleCode, departmentId, facultyId, res))) return;
		const { data: updated, error: updateError } = await adminClient
			.from('staff_members')
			.update({
				role_code: roleCode,
				department_id: departmentId || null,
				faculty_id: roleCode === 'faculty' ? facultyId : null,
				active,
			})
			.eq('user_id', userId)
			.select('user_id')
			.maybeSingle();
		if (updateError) return res.status(400).json({ error: updateError.message });
		if (!updated) return res.status(404).json({ error: 'Staff user was not found.' });

		const { error: auditError } = await adminClient.from('audit_logs').insert({
			actor_id: req.actor.id,
			action: 'staff.update',
			entity: 'staff_members',
			entity_id: userId,
		});
		if (auditError) {
			return res.status(500).json({
				error: `Staff access was updated, but audit logging failed: ${auditError.message}`,
			});
		}
		return res.json({ ok: true });
	} catch (error) {
		console.error('Staff access update failed:', error);
		return res.status(500).json({ error: 'Staff access update failed.' });
	}
});

app.listen(Number(process.env.PORT || 3001), () =>
	console.log('API listening'),
);
