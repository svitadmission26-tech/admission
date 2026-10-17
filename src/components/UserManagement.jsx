import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel } from '../lib/excel';
import {
	accessPages,
	accessPermissions,
	emptyStaffForm,
} from '../lib/accessControl';

const API_BASE =
	import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
	'http://localhost:3001/api';

function getErrorMessage(error) {
	if (
		error instanceof TypeError &&
		/failed to fetch|networkerror|load failed/i.test(error.message)
	) {
		return `Could not reach the staff API at ${API_BASE}. Check that the API server is running, VITE_API_BASE_URL points to it, and CORS_ORIGIN allows this frontend.`;
	}
	return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function getStaffSchemaError(error) {
	if (
		error?.code === 'PGRST205' ||
		error?.code === 'PGRST204' ||
		error?.code === '42P01' ||
		error?.code === '42703' ||
		error?.message?.includes("public.staff_members") ||
		error?.message?.includes('scope_all')
	) {
		return 'Staff access schema is missing or outdated. Apply migrations 003_staff_roles.sql, 008_academics.sql, and 019_dynamic_role_scope_access.sql in order, then reload.';
	}
	return error?.message || 'Could not load staff management data.';
}

export default function UserManagement() {
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [departments, setDepartments] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [colleges, setColleges] = useState([]);
	const [courses, setCourses] = useState([]);
	const [form, setForm] = useState(emptyStaffForm);
	const [editingId, setEditingId] = useState(null);
	const [selectedRole, setSelectedRole] = useState('');
	const [roleLabel, setRoleLabel] = useState('');
	const [rolePages, setRolePages] = useState([]);
	const [rolePermissions, setRolePermissions] = useState([]);
	const [newRoleCode, setNewRoleCode] = useState('');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const [roleGrants, setRoleGrants] = useState(new Map());

	async function load() {
		try {
			const [rolesResult, departmentsResult] = await Promise.all([
				supabase.from('staff_roles').select('code,label').order('label'),
				supabase
					.from('departments')
					.select('id,name')
					.eq('active', true)
					.order('name'),
			]);
			const setupError = rolesResult.error || departmentsResult.error;
			if (setupError) {
				setMessage(getStaffSchemaError(setupError));
				return;
			}
			const availableRoles = (rolesResult.data ?? []).filter(
				(role) => role.code !== 'admin',
			);
			const includesFaculty = availableRoles.some(
				(role) => role.code === 'faculty',
			);
			const [usersResult, facultyResult, collegesResult, coursesResult, permissionsResult] = await Promise.all([
				supabase
					.from('staff_members')
					.select(
						`user_id,role_code,department_id,active,created_at,scope_all,college_scope_ids,department_scope_ids,course_scope_ids,${includesFaculty ? 'faculty_id,' : ''}profiles(full_name),departments(name)`,
					)
					.order('created_at', { ascending: false }),
				includesFaculty
					? supabase
							.from('faculty')
							.select('id,name,code')
							.eq('active', true)
							.order('name')
					: Promise.resolve({ data: [], error: null }),
				supabase.from('colleges').select('id,name').eq('active', true).order('name'),
				supabase.from('courses').select('id,name,college_id').eq('active', true).order('name'),
				supabase.from('role_permissions').select('role_code,permission'),
			]);
			const error = usersResult.error || facultyResult.error || collegesResult.error || coursesResult.error || permissionsResult.error;
			if (error) {
				setMessage(getStaffSchemaError(error));
				return;
			}

			setUsers(usersResult.data ?? []);
			setRoles(availableRoles);
			setDepartments(departmentsResult.data ?? []);
			setFaculty(facultyResult.data ?? []);
			setColleges(collegesResult.data ?? []);
			setCourses(coursesResult.data ?? []);
			const rolePermissionsByCode = new Map();
			for (const item of permissionsResult.data ?? []) {
				const current = rolePermissionsByCode.get(item.role_code) ?? [];
				current.push(item.permission);
				rolePermissionsByCode.set(item.role_code, current);
			}
			const firstRole = availableRoles[0];
			setSelectedRole((current) =>
				availableRoles.some((role) => role.code === current)
					? current
					: firstRole?.code ?? '',
			);
			if (firstRole) {
				setRoleLabel(firstRole.label);
				const grants = rolePermissionsByCode.get(firstRole.code) ?? [];
				setRolePages(grants.filter((grant) => grant.startsWith('page:')).map((grant) => grant.slice(5)));
				setRolePermissions(grants.filter((grant) => !grant.startsWith('page:')));
			}
			setRoleGrants(rolePermissionsByCode);
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
	}, []);

	useEffect(() => {
		const role = roles.find((item) => item.code === selectedRole);
		if (!role) return;
		setRoleLabel(role.label);
		const grants = roleGrants.get(role.code) ?? [];
		setRolePages(
			grants
				.filter((grant) => grant.startsWith('page:'))
				.map((grant) => grant.slice('page:'.length)),
		);
		setRolePermissions(grants.filter((grant) => !grant.startsWith('page:')));
	}, [selectedRole, roles, roleGrants]);

	function toggleItem(items, setItems, item) {
		setItems((current) =>
			current.includes(item)
				? current.filter((value) => value !== item)
				: [...current, item],
		);
	}

	async function saveRoleAccess(event) {
		event.preventDefault();
		if (busy) return;
		const roleCode = (newRoleCode || selectedRole).trim().toLowerCase();
		if (!roleCode || !roleLabel.trim()) {
			setMessage('Enter a role code and role name.');
			return;
		}
		setBusy(true);
		setMessage('');
		try {
			const { error } = await supabase.rpc('admin_save_role_access', {
				p_role_code: roleCode,
				p_label: roleLabel.trim(),
				p_pages: rolePages,
				p_permissions: rolePermissions,
			});
			if (error) throw error;
			setNewRoleCode('');
			setMessage(`Access saved for ${roleLabel.trim()}.`);
			await load();
			setSelectedRole(roleCode);
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function exportStaff() {
		try {
			await downloadExcel({
				fileName: 'svit-staff-directory',
				sheetName: 'Staff',
				columns: [
					{ key: 'full_name', label: 'Full name' },
					{ key: 'user_id', label: 'User ID' },
					{ key: 'role_code', label: 'Role' },
					{ key: 'department', label: 'Department' },
					{ key: 'faculty', label: 'Faculty link' },
					{ key: 'active', label: 'Active' },
					{ key: 'created_at', label: 'Created at' },
				],
				rows: users.map((user) => ({
					...user,
					full_name: user.profiles?.full_name || '',
					department: user.departments?.name || '',
					faculty:
						faculty.find((member) => member.id === user.faculty_id)?.name || '',
				})),
			});
		} catch (error) {
			setMessage(getErrorMessage(error));
		}
	}

	function cancelEdit() {
		setEditingId(null);
		setForm(emptyStaffForm);
		setMessage('');
	}

	function scopeSummary(user) {
		if (user.scope_all) return 'All data';
		const parts = [
			[user.college_scope_ids, 'college'],
			[user.department_scope_ids, 'department'],
			[user.course_scope_ids, 'course'],
		]
			.filter(([ids]) => ids?.length)
			.map(([ids, label]) => `${ids.length} ${label}${ids.length === 1 ? '' : 's'}`);
		return parts.join(', ') || 'No scope';
	}

	async function submit(event) {
		event.preventDefault();
		if (busy) return;
		if (
			!form.scope_all &&
			!form.college_scope_ids.length &&
			!form.department_scope_ids.length &&
			!form.course_scope_ids.length
		) {
			setMessage(
				'Choose at least one college, department, or course scope, or explicitly grant all-data scope.',
			);
			return;
		}
		setBusy(true);
		setMessage('');

		try {
			const {
				data: { session },
				error: sessionError,
			} = await supabase.auth.getSession();
			if (sessionError) throw sessionError;
			if (!session?.access_token) throw new Error('Sign in again to manage users.');

			const response = await fetch(
				`${API_BASE}/admin/users${editingId ? `/${encodeURIComponent(editingId)}` : ''}`,
				{
					method: editingId ? 'PATCH' : 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify(
						editingId
							? {
									role_code: form.role_code,
									department_id: form.department_id || null,
									faculty_id:
										form.role_code === 'faculty' ? form.faculty_id || null : null,
									active: form.active,
									scope_all: form.scope_all,
									college_scope_ids: form.college_scope_ids,
									department_scope_ids: form.department_scope_ids,
									course_scope_ids: form.course_scope_ids,
								}
							: {
									full_name: form.full_name,
									email: form.email,
									role_code: form.role_code,
									department_id: form.department_id || null,
									faculty_id:
										form.role_code === 'faculty' ? form.faculty_id || null : null,
									scope_all: form.scope_all,
									college_scope_ids: form.college_scope_ids,
									department_scope_ids: form.department_scope_ids,
									course_scope_ids: form.course_scope_ids,
								},
					),
				},
			);
			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.error || `Request failed (${response.status}).`);
			}

			setMessage(
				`${editingId
					? 'Staff access updated.'
					: 'Invitation sent. The user can set a password from the email.'}${result.warning ? ` Warning: ${result.warning}` : ''}`,
			);
			setEditingId(null);
			setForm(emptyStaffForm);
			await load();
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Dynamic Staff &amp; User Management</h2>
					<p>Invite staff and manage their role, department, and access.</p>
				</div>
				<button type="button" onClick={() => void exportStaff()}>
					Export Excel
				</button>
			</div>
			<form className="editgrid" onSubmit={submit}>
				<h3>{editingId ? 'Edit staff access' : 'Invite a staff user'}</h3>
				{!editingId && (
					<>
						<label>
							Full name
							<input
								required
								minLength={2}
								value={form.full_name}
								onChange={(event) =>
									setForm({ ...form, full_name: event.target.value })
								}
							/>
						</label>
						<label>
							Email
							<input
								required
								type="email"
								value={form.email}
								onChange={(event) =>
									setForm({ ...form, email: event.target.value })
								}
							/>
						</label>
					</>
				)}
				<label>
					Role
					<select
						required
						value={form.role_code}
						onChange={(event) =>
							setForm({
								...form,
								role_code: event.target.value,
								faculty_id:
									event.target.value === 'faculty' ? form.faculty_id : '',
							})
						}
					>
						{roles.map((role) => (
							<option key={role.code} value={role.code}>
								{role.label}
							</option>
						))}
					</select>
				</label>
				{form.role_code === 'faculty' && (
					<>
						<label>
							Faculty record
							<select
								required
								value={form.faculty_id}
								onChange={(event) =>
									setForm({ ...form, faculty_id: event.target.value })
								}
							>
								<option value="">Select faculty record</option>
								{faculty.map((member) => (
									<option key={member.id} value={member.id}>
										{member.name} {member.code ? `(${member.code})` : ''}
									</option>
								))}
							</select>
						</label>
						{!faculty.length && (
							<p className="hint">
								Add an active faculty record in the Faculty tab before linking
								this account.
							</p>
						)}
					</>
				)}
				<label>
					Department
					<select
						value={form.department_id}
						onChange={(event) =>
							setForm({
								...form,
								department_id: event.target.value,
								department_scope_ids: event.target.value
									? [event.target.value]
									: [],
							})
						}
					>
						<option value="">All / not assigned</option>
						{departments.map((department) => (
							<option key={department.id} value={department.id}>
								{department.name}
							</option>
						))}
					</select>
				</label>
				<label>
					Data scope
					<select
						value={String(form.scope_all)}
						onChange={(event) =>
							setForm({ ...form, scope_all: event.target.value === 'true' })
						}
					>
						<option value="false">Restrict to selected scope</option>
						<option value="true">All colleges, departments, and courses</option>
					</select>
				</label>
				{!form.scope_all && (
					<p className="hint">
						Select at least one scope below before inviting or updating this user.
					</p>
				)}
				{!form.scope_all && (
					<>
						{[
							['college_scope_ids', 'Colleges', colleges],
							['department_scope_ids', 'Departments', departments],
							['course_scope_ids', 'Courses', courses],
						].map(([key, label, options]) => (
							<fieldset className="access-scope-options" key={key}>
								<legend>{label} scope</legend>
								<div>
									{options.map((option) => (
										<label key={option.id}>
											<input
												type="checkbox"
												checked={form[key].includes(option.id)}
												onChange={() =>
													setForm({
														...form,
														[key]: form[key].includes(option.id)
															? form[key].filter((id) => id !== option.id)
															: [...form[key], option.id],
													})
												}
											/>
											{option.name}
										</label>
									))}
								</div>
								<small>When multiple dimensions are selected, data must match all of them. A dimension with no selections is unrestricted; choose at least one scope overall.</small>
							</fieldset>
						))}
					</>
				)}
				{editingId && (
					<label>
						Account access
						<select
							value={String(form.active)}
							onChange={(event) =>
								setForm({ ...form, active: event.target.value === 'true' })
							}
						>
							<option value="true">Active</option>
							<option value="false">Disabled</option>
						</select>
					</label>
				)}
				<div className="actions">
					<button className="primary" disabled={busy || !roles.length}>
						{busy
							? 'Saving...'
							: editingId
								? 'Update access'
								: 'Send invitation'}
					</button>
					{editingId && (
						<button type="button" disabled={busy} onClick={cancelEdit}>
							Cancel
						</button>
					)}
				</div>
			</form>
			{message && (
				<p className="dfb-message" role="status">
					{message}
				</p>
			)}
			{loading ? (
				<p>Loading staff users...</p>
			) : (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Role</th>
								<th>Department</th>
								<th>Faculty link</th>
								<th>Data scope</th>
								<th>Status</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{users.map((user) => (
								<tr key={user.user_id}>
									<td>{user.profiles?.full_name || user.user_id}</td>
									<td>{user.role_code}</td>
									<td>{user.departments?.name || '—'}</td>
									<td>
										{faculty.find((member) => member.id === user.faculty_id)
											?.name || '—'}
									</td>
									<td>{scopeSummary(user)}</td>
									<td>{user.active ? 'Active' : 'Disabled'}</td>
									<td>
										<button
											type="button"
											onClick={() => {
												setEditingId(user.user_id);
												setForm({
													...emptyStaffForm,
													role_code: user.role_code,
													department_id: user.department_id || '',
													faculty_id: user.faculty_id || '',
													active: user.active,
													scope_all: user.scope_all,
													college_scope_ids: user.college_scope_ids ?? [],
													department_scope_ids: user.department_scope_ids ?? [],
													course_scope_ids: user.course_scope_ids ?? [],
												});
												setMessage('');
											}}
										>
											Edit
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!users.length && <div className="empty">No staff users found.</div>}
				</div>
			)}
			<section className="editgrid">
				<h3>Dynamic role access</h3>
				<label>
					Role to configure
					<select
						value={selectedRole}
						onChange={(event) => {
							setSelectedRole(event.target.value);
							setNewRoleCode('');
						}}
					>
						{roles.map((role) => (
							<option key={role.code} value={role.code}>
								{role.label} ({role.code})
							</option>
						))}
					</select>
				</label>
				<label>
					Role name
					<input
						required
						value={roleLabel}
						onChange={(event) => setRoleLabel(event.target.value)}
					/>
				</label>
				<label>
					Create new role code
					<input
						value={newRoleCode}
						onChange={(event) => setNewRoleCode(event.target.value)}
						placeholder="department_coordinator"
					/>
				</label>
				<fieldset className="access-scope-options">
					<legend>Pages visible in navigation</legend>
					<div>
						{accessPages.map((page) => (
							<label key={page}>
								<input
									type="checkbox"
									checked={rolePages.includes(page)}
									onChange={() => toggleItem(rolePages, setRolePages, page)}
								/>
								{page}
							</label>
						))}
					</div>
				</fieldset>
				<fieldset className="access-scope-options">
					<legend>Data and action permissions</legend>
					<div>
						{accessPermissions.map(([permission, label]) => (
							<label key={permission}>
								<input
									type="checkbox"
									checked={rolePermissions.includes(permission)}
									onChange={() =>
										toggleItem(rolePermissions, setRolePermissions, permission)
									}
								/>
								{label}
							</label>
						))}
					</div>
				</fieldset>
				<button className="primary" disabled={busy} onClick={saveRoleAccess}>
					{busy ? 'Saving...' : 'Save role access'}
				</button>
			</section>
			<p className="hint">
				Invited users set their own passwords through email. Service-role
				credentials remain on the server and must never be added to frontend
				environment variables.
			</p>
		</section>
	);
}
