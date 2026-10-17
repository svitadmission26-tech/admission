import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel } from '../lib/excel';

const API_BASE =
	import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
	'http://localhost:3001/api';

const initialForm = {
	full_name: '',
	email: '',
	role_code: 'data_entry',
	department_id: '',
	faculty_id: '',
	active: true,
};

function getErrorMessage(error) {
	return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function getStaffSchemaError(error) {
	if (
		error?.code === 'PGRST205' ||
		error?.code === '42P01' ||
		error?.message?.includes("public.staff_members")
	) {
		return 'Staff management tables are missing from Supabase. Run supabase/migrations/003_staff_roles.sql after 002_admission_erp.sql and supabase/migrations/008_academics.sql for Faculty linking, then reload.';
	}
	return error?.message || 'Could not load staff management data.';
}

export default function UserManagement() {
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [departments, setDepartments] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [form, setForm] = useState(initialForm);
	const [editingId, setEditingId] = useState(null);
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

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
			const [usersResult, facultyResult] = await Promise.all([
				supabase
					.from('staff_members')
					.select(
						`user_id,role_code,department_id,active,created_at,${includesFaculty ? 'faculty_id,' : ''}profiles(full_name),departments(name)`,
					)
					.order('created_at', { ascending: false }),
				includesFaculty
					? supabase
							.from('faculty')
							.select('id,name,code')
							.eq('active', true)
							.order('name')
					: Promise.resolve({ data: [], error: null }),
			]);
			const error = usersResult.error || facultyResult.error;
			if (error) {
				setMessage(getStaffSchemaError(error));
				return;
			}

			setUsers(usersResult.data ?? []);
			setRoles(availableRoles);
			setDepartments(departmentsResult.data ?? []);
			setFaculty(facultyResult.data ?? []);
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
	}, []);

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
		setForm(initialForm);
		setMessage('');
	}

	async function submit(event) {
		event.preventDefault();
		if (busy) return;
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
								}
							: {
									full_name: form.full_name,
									email: form.email,
									role_code: form.role_code,
									department_id: form.department_id || null,
									faculty_id:
										form.role_code === 'faculty' ? form.faculty_id || null : null,
								},
					),
				},
			);
			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.error || `Request failed (${response.status}).`);
			}

			setMessage(
				editingId
					? 'Staff access updated.'
					: 'Invitation sent. The user can set a password from the email.',
			);
			setEditingId(null);
			setForm(initialForm);
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
							setForm({ ...form, department_id: event.target.value })
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
									<td>{user.active ? 'Active' : 'Disabled'}</td>
									<td>
										<button
											type="button"
											onClick={() => {
												setEditingId(user.user_id);
												setForm({
													...initialForm,
													role_code: user.role_code,
													department_id: user.department_id || '',
													faculty_id: user.faculty_id || '',
													active: user.active,
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
			<p className="hint">
				Invited users set their own passwords through email. Service-role
				credentials remain on the server and must never be added to frontend
				environment variables.
			</p>
		</section>
	);
}
