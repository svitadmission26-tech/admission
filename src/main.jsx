import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, configured } from './supabase';
import './style.css';
const modules = [
	['Dashboard', 'LayoutDashboard'],
	['Universities', '\u{1F3DB}\uFE0F'],
	['Colleges', '\u{1F3EB}'],
	['Courses', '\u{1F4DA}'],
	['Branches', '\u{1F33F}'],
	['Academic Years', '\u{1F4C5}'],
	['Form Builder', '\u{1F4DD}'],
	['Applications', '\u{1F468}\u200D\u{1F393}'],
	['Documents', '\u{1F4C1}'],
	['Fee Structures', '\u20B9'],
	['Fee Assignments', '\u{1F9FE}'],
	['Payments', '\u{1F4B3}'],
	['Merit Schemes', '\u{1F3C5}'],
	['Merit Entries', '\u{1F4CA}'],
	['Reports', '\u{1F4C8}'],
	['My Applications', '\u{1F464}'],
];
const meta = {
	Universities: ['universities', ['name', 'active']],
	Colleges: ['colleges', ['name', 'university_id', 'active']],
	Courses: ['courses', ['name', 'code', 'active']],
	Branches: ['branches', ['name', 'course_id', 'intake', 'active']],
	'Academic Years': [
		'academic_years',
		['name', 'starts_on', 'ends_on', 'active'],
	],
	'Form Builder': [
		'admission_forms',
		['title', 'description', 'status', 'fields'],
	],
	'Fee Structures': ['fee_structures', ['title', 'amount_paise', 'active']],
	'Fee Assignments': [
		'fee_assignments',
		['application_id', 'fee_structure_id', 'amount_paise'],
	],
	Payments: [
		'payments',
		['assignment_id', 'amount_paise', 'reference', 'mode'],
	],
	'Merit Schemes': ['merit_schemes', ['title', 'formula', 'status']],
	'Merit Entries': [
		'merit_entries',
		['scheme_id', 'application_id', 'score', 'rank', 'category', 'published'],
	],
};
const money = (n) =>
	'\u20B9' +
	(Number(n || 0) / 100).toLocaleString('en-IN', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

function AdmissionField({ field }) {
	const common = {
		name: field.key,
		required: Boolean(field.required),
		placeholder: field.placeholder ?? '',
	};

	if (field.type === 'select')
		return (
			<select {...common} defaultValue="">
				<option value="">Select</option>
				{(field.options ?? []).map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		);

	if (field.type === 'textarea') return <textarea {...common} rows={4} />;

	if (field.type === 'checkbox') return <input {...common} type="checkbox" />;

	const inputType = ['email', 'date', 'number', 'tel', 'url'].includes(
		field.type,
	)
		? field.type
		: 'text';
	return <input {...common} type={inputType} />;
}

function App() {
	const [session, S] = useState(null),
		[profile, P] = useState(null),
		[page, Q] = useState('Dashboard'),
		[rows, R] = useState([]),
		[stats, T] = useState({}),
		[err, E] = useState(''),
		[notice, N] = useState(''),
		[loading, L] = useState(true),
		[search, U] = useState(''),
		[editing, G] = useState(null),
		[form, F] = useState({}),
		[studentApplications, SA] = useState([]),
		[auth, A] = useState({ email: '', password: '', full_name: '' }),
		[signup, SU] = useState(false);
	const admin = profile?.role === 'admin';
	const table = meta[page]?.[0];
	const fields = meta[page]?.[1];
	async function loadProfile(user) {
		if (!user) {
			P(null);
			return;
		}
		const { data, error } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.single();
		if (error) {
			E(error.message);
			P(null);
			return;
		}
		P(data);
	}
	useEffect(() => {
		if (!configured) {
			L(false);
			return;
		}
		supabase.auth
			.getSession()
			.then(async ({ data, error }) => {
				if (error) E(error.message);
				S(data.session);
				await loadProfile(data.session?.user);
				L(false);
			})
			.catch((error) => {
				E(
					error instanceof Error
						? error.message
						: 'Could not load your session.',
				);
				L(false);
			});
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, s) => {
			S(s);
			setTimeout(() => loadProfile(s?.user), 0);
		});
		return () => subscription.unsubscribe();
	}, []);
	useEffect(() => {
		if (!session || !profile) return;
		refresh();
	}, [page, session, profile]);
	async function refresh() {
		E('');
		if (!supabase) return;
		let t =
			table ||
			(page === 'Applications' || page === 'My Applications'
				? 'applications'
				: page === 'Documents'
					? 'documents'
					: page === 'Reports'
						? 'applications'
						: null);
		if (page === 'Dashboard') {
			const keys = admin
				? ['applications', 'courses', 'branches', 'fee_structures', 'payments']
				: ['applications'];
			try {
				const counts = await Promise.all(
					keys.map(async (key) => {
						let query = supabase
							.from(key)
							.select('*', { count: 'exact', head: true });
						if (!admin) query = query.eq('student_id', session.user.id);
						const { count, error } = await query;
						if (error) throw error;
						return [key, count ?? 0];
					}),
				);
				T(Object.fromEntries(counts));
			} catch (error) {
				E(error instanceof Error ? error.message : 'Could not load dashboard.');
			}
			return;
		}
		if (!t) return;
		const orderColumn = t === 'payments' ? 'recorded_at' : 'created_at';
		let query = supabase
			.from(t)
			.select('*')
			.order(orderColumn, { ascending: false, nullsFirst: false })
			.limit(250);
		if (
			!['applications', 'documents', 'payments', 'admission_forms'].includes(t)
		)
			query = supabase.from(t).select('*').limit(250);
		if (page === 'My Applications')
			query = query.eq('student_id', session.user.id);
		const { data, error } = await query;
		if (error) {
			E(error.message);
			R([]);
			return;
		}
		R(data ?? []);
	}
	async function login(e) {
		e.preventDefault();
		E('');
		const result = signup
			? await supabase.auth.signUp({
					email: auth.email,
					password: auth.password,
					options: { data: { full_name: auth.full_name } },
				})
			: await supabase.auth.signInWithPassword({
					email: auth.email,
					password: auth.password,
				});
		if (result.error) E(result.error.message);
		else if (signup)
			N(
				'Registration submitted. Confirm your email if confirmation is enabled.',
			);
	}
	async function save(e) {
		e.preventDefault();
		E('');
		let data = { ...form };
		for (const [k, v] of Object.entries(data)) {
			if (v === '') data[k] = null;
			if (['fields', 'formula'].includes(k) && typeof v === 'string') {
				try {
					data[k] = JSON.parse(v);
				} catch {
					E(k + ' must be valid JSON');
					return;
				}
			}
			if (k === 'active' || k === 'published')
				data[k] = v === true || v === 'true';
			if (['amount_paise', 'intake', 'score', 'rank'].includes(k) && v !== null)
				data[k] = Number(v);
		}
		if (
			table === 'admission_forms' &&
			(!Array.isArray(data.fields) ||
				data.fields.some(
					(field) =>
						!field ||
						typeof field.key !== 'string' ||
						!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(field.key) ||
						typeof field.label !== 'string' ||
						!field.label.trim() ||
						![
							'text',
							'textarea',
							'email',
							'phone',
							'url',
							'select',
							'date',
							'number',
							'checkbox',
						].includes(field.type) ||
						(field.type === 'select' &&
							(!Array.isArray(field.options) ||
								field.options.some((option) => typeof option !== 'string'))),
				))
		) {
			E(
				'Form fields need valid unique keys, labels, types, and select options.',
			);
			return;
		}
		if (
			table === 'admission_forms' &&
			new Set(data.fields.map((field) => field.key)).size !== data.fields.length
		) {
			E('Form field keys must be unique.');
			return;
		}
		if (
			table === 'admission_forms' &&
			data.status === 'published' &&
			data.fields.length === 0
		) {
			E('Add at least one field before publishing this form.');
			return;
		}
		const res = editing
			? await supabase.from(table).update(data).eq('id', editing)
			: await supabase.from(table).insert(data);
		if (res.error) E(res.error.message);
		else {
			N('Record saved');
			G(null);
			F({});
			refresh();
		}
	}
	async function remove(id) {
		if (!confirm('Delete this record?')) return;
		const { error } = await supabase.from(table).delete().eq('id', id);
		if (error) E(error.message);
		else refresh();
	}
	function edit(row = {}) {
		G(row.id || 'new');
		F(
			Object.fromEntries(
				fields.map((k) => [
					k,
					typeof row[k] === 'object' && row[k] !== null
						? JSON.stringify(row[k], null, 2)
						: (row[k] ??
							(k === 'active'
								? true
								: k === 'published'
									? false
									: k === 'status'
										? 'draft'
										: k === 'mode'
											? 'cash'
											: k === 'fields'
												? '[]'
												: k === 'formula'
													? '{}'
													: '')),
				]),
			),
		);
	}
	async function apply(e) {
		e.preventDefault();
		const formElement = e.currentTarget;
		const { data: published2, error } = await supabase
			.from('admission_forms')
			.select('id,title,fields')
			.eq('status', 'published')
			.limit(1);
		if (error || !published2?.length) {
			E(error?.message || 'No published admission form available');
			return;
		}
		let x = published2[0];
		let answers = {};
		for (const f of x.fields) {
			const control = formElement.elements.namedItem(f.key);
			if (!control) {
				E(`The published form field "${f.label}" is invalid.`);
				return;
			}
			const v = f.type === 'checkbox' ? control.checked : (control.value ?? '');
			if (f.required && (typeof v === 'boolean' ? !v : !String(v).trim())) {
				E(f.label + ' is required');
				return;
			}
			answers[f.key] = v;
		}
		const r = await supabase
			.from('applications')
			.insert({ student_id: session.user.id, form_id: x.id, answers });
		if (r.error) E(r.error.message);
		else {
			N('Application submitted');
			formElement.reset();
			await refresh();
		}
	}
	async function review(id, status) {
		const { error } = await supabase
			.from('applications')
			.update({ status, updated_at: /* @__PURE__ */ new Date().toISOString() })
			.eq('id', id);
		if (error) E(error.message);
		else refresh();
	}
	const [published, B] = useState(null);
	useEffect(() => {
		if (session && !admin)
			supabase
				.from('admission_forms')
				.select('*')
				.eq('status', 'published')
				.limit(1)
				.then(({ data, error }) => {
					if (error) E(error.message);
					else B(data?.[0] || null);
				})
				.catch((error) =>
					E(
						error instanceof Error
							? error.message
							: 'Could not load the admission form.',
					),
				);
	}, [session, admin]);
	useEffect(() => {
		if (!session || admin) {
			SA([]);
			return;
		}
		supabase
			.from('applications')
			.select('id, application_number')
			.eq('student_id', session.user.id)
			.order('created_at', { ascending: false })
			.then(({ data, error }) => {
				if (error) E(error.message);
				else SA(data ?? []);
			})
			.catch((error) =>
				E(
					error instanceof Error
						? error.message
						: 'Could not load your applications.',
				),
			);
	}, [session, admin, page]);
	if (!configured)
		return (
			<div className="setup">
				<h1>SVIT Admission ERP</h1>
				<p>
					Configure <code>VITE_SUPABASE_URL</code> and{' '}
					<code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>,
					then run <code>npm run dev</code>.
				</p>
				<p>
					Read README.md and run the SQL migration in a new Supabase project.
				</p>
			</div>
		);
	if (loading) return <div className="setup">Loading…</div>;
	if (!session)
		return (
			<div className="authwrap">
				<div className="authbrand">
					<div className="logo">S</div>
					<h1>SVIT Admission ERP</h1>
					<p>One college. One connected admission workspace.</p>
					<div className="authart">
						Admissions • Verification • Fees • Merit
					</div>
				</div>
				<form className="authcard" onSubmit={login}>
					<h2>{signup ? 'Student Registration' : 'Welcome back'}</h2>
					<p>Sign in to continue to the portal</p>
					{signup && (
						<label>
							Full Name
							<input
								required
								value={auth.full_name}
								onChange={(e) => A({ ...auth, full_name: e.target.value })}
							/>
						</label>
					)}
					<label>
						Email
						<input
							type="email"
							required
							value={auth.email}
							onChange={(e) => A({ ...auth, email: e.target.value })}
						/>
					</label>
					<label>
						Password
						<input
							type="password"
							minLength="8"
							required
							value={auth.password}
							onChange={(e) => A({ ...auth, password: e.target.value })}
						/>
					</label>
					{err && <div className="error">{err}</div>}
					{notice && <div className="success">{notice}</div>}
					<button className="primary">
						{signup ? 'Create student account' : 'Sign In'}
					</button>
					<button
						type="button"
						className="link"
						onClick={() => {
							SU(!signup);
							E('');
						}}
					>
						{signup
							? 'Already registered? Sign in'
							: 'New student? Register here'}
					</button>
				</form>
			</div>
		);
	const nav = admin
		? modules.filter(([x]) => x !== 'My Applications')
		: modules.filter(([x]) =>
				['Dashboard', 'My Applications', 'Documents'].includes(x),
			);
	const visible = rows.filter((r) =>
		JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
	);
	return (
		<div className="shell">
			<aside>
				<div className="brand">
					<div className="logo">S</div>
					<div>
						<b>SVIT ERP</b>
						<small>Admission Management</small>
					</div>
				</div>
				<div className="navtitle">WORKSPACE</div>
				<nav>
					{nav.map(([n, ico]) => (
						<button
							key={n}
							className={page === n ? 'selected' : ''}
							onClick={() => {
								Q(n);
								G(null);
								U('');
								E('');
							}}
						>
							<span>{ico === 'LayoutDashboard' ? '\u25EB' : ico}</span>
							{n}
						</button>
					))}
				</nav>
				<div className="sidefoot">
					SVIT • Academic Administration
					<br />
					v0.1 Starter
				</div>
			</aside>
			<main>
				<header>
					<div>
						<small>SVIT / {page}</small>
						<h1>{page}</h1>
					</div>
					<div className="account">
						<div className="avatar">
							{(profile?.full_name || session.user.email)[0].toUpperCase()}
						</div>
						<div>
							<b>{profile?.full_name || session.user.email}</b>
							<small>{profile?.role || 'student'}</small>
						</div>
						<button onClick={() => supabase.auth.signOut()}>Sign out</button>
					</div>
				</header>
				{err && (
					<div className="error">
						{err}
						<button onClick={() => E('')}>×</button>
					</div>
				)}
				{notice && (
					<div className="success">
						{notice}
						<button onClick={() => N('')}>×</button>
					</div>
				)}
				{page === 'Dashboard' ? (
					<>
						<div className="welcome">
							<div>
								<span>ACADEMIC CONTROL CENTER</span>
								<h2>Welcome to SVIT Admission ERP</h2>
								<p>
									Manage the admission lifecycle from one connected workspace.
								</p>
							</div>
							<div className="orb">✦</div>
						</div>
						<div className="stats">
							{(admin
								? [
										[
											'Applications',
											stats.applications,
											'\u{1F468}\u200D\u{1F393}',
										],
										['Courses', stats.courses, '\u{1F4DA}'],
										['Branches', stats.branches, '\u{1F33F}'],
										['Fee Structures', stats.fee_structures, '\u20B9'],
										['Payments', stats.payments, '\u{1F4B3}'],
									]
								: [
										[
											'My Applications',
											stats.applications,
											'\u{1F468}\u200D\u{1F393}',
										],
									]
							).map(([k, v, i]) => (
								<div className="stat" key={k}>
									<span>{i}</span>
									<strong>{v ?? '\u2014'}</strong>
									<small>{k}</small>
								</div>
							))}
						</div>
						<h3>Quick Management Access</h3>
						<div className="tiles">
							{nav
								.filter(([n]) => n !== 'Dashboard')
								.map(([n, i]) => (
									<button key={n} className="tile" onClick={() => Q(n)}>
										<span>{i}</span>
										<b>{n}</b>
										<small>Open module →</small>
									</button>
								))}
						</div>
					</>
				) : page === 'Reports' ? (
					<section className="panel">
						<h2>Admission overview</h2>
						<p>Records visible under your authorized role.</p>
						<div className="stats">
							{Object.entries(stats).map(([k, v]) => (
								<div className="stat" key={k}>
									<strong>{v}</strong>
									<small>{k}</small>
								</div>
							))}
						</div>
						<button
							className="primary"
							onClick={() => {
								let csv = [
									'Application No,Status,Created At',
									...rows.map((x) =>
										[x.application_number, x.status, x.created_at]
											.map(
												(v) =>
													'"' + String(v ?? '').replaceAll('"', '""') + '"',
											)
											.join(','),
									),
								].join('\n');
								let blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
								let a = document.createElement('a');
								a.href = URL.createObjectURL(blob);
								a.download = 'svit-applications.csv';
								a.click();
								URL.revokeObjectURL(a.href);
							}}
						>
							Export visible applications CSV
						</button>
						<p className="hint">
							This is a basic report. Fee reconciliation and full report builder
							need further work.
						</p>
					</section>
				) : page === 'My Applications' && !admin ? (
					<>
						<section className="panel">
							<h2>New Admission Application</h2>
							{published ? (
								<form onSubmit={apply} className="editgrid">
									<p>{published.title}</p>
									{(Array.isArray(published.fields)
										? published.fields
										: []
									).map((f) => (
										<label key={f.key}>
											{f.label}
											<AdmissionField field={f} />
										</label>
									))}
									<button className="primary">Submit Application</button>
								</form>
							) : (
								<p>
									No published form available. Please contact the admission
									office.
								</p>
							)}
						</section>
						<section className="panel">
							<h2>My submitted applications</h2>
							{visible.map((x) => (
								<div className="record" key={x.id}>
									<b>{x.application_number}</b>
									<span>{x.status}</span>
									<small>{new Date(x.created_at).toLocaleDateString()}</small>
								</div>
							))}
						</section>
					</>
				) : page === 'Applications' ? (
					<section className="panel">
						<div className="panelhead">
							<div>
								<h2>Student Applications</h2>
								<p>Review and update application status</p>
							</div>
							<input
								placeholder="Search applications..."
								value={search}
								onChange={(e) => U(e.target.value)}
							/>
						</div>
						<div className="tablewrap">
							<table>
								<thead>
									<tr>
										<th>Application No</th>
										<th>Student ID</th>
										<th>Status</th>
										<th>Created</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{visible.map((x) => (
										<tr key={x.id}>
											<td>{x.application_number}</td>
											<td>{x.student_id}</td>
											<td>
												<span className="pill">{x.status}</span>
											</td>
											<td>{new Date(x.created_at).toLocaleDateString()}</td>
											<td>
												<select
													value={x.status}
													onChange={(e) => review(x.id, e.target.value)}
												>
													{[
														'submitted',
														'under_review',
														'approved',
														'rejected',
													].map((s) => (
														<option key={s}>{s}</option>
													))}
												</select>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				) : page === 'Documents' ? (
					<section className="panel">
						<h2>Private Student Documents</h2>
						<p>
							Document uploads require an existing application. Files are stored
							in a private Supabase bucket.
						</p>
						{!admin && (
							<>
								<div className="panelhead">
									<input
										type="file"
										accept=".pdf,.png,.jpg,.jpeg"
										id="docfile"
									/>
									<select id="docapp" defaultValue="">
										<option value="">Choose your application</option>
										{studentApplications.map((application) => (
											<option key={application.id} value={application.id}>
												{application.application_number}
											</option>
										))}
									</select>
									<input id="doclabel" placeholder="Document label" />
								</div>
								<button
									className="primary"
									onClick={async () => {
										const file = document.getElementById('docfile').files[0];
										const id = document.getElementById('docapp').value;
										const label = document.getElementById('doclabel').value;
										if (!file || !id || !label.trim()) {
											E(
												'Choose an application and file, then enter a document label.',
											);
											return;
										}
										if (
											file.size > 5 * 1024 * 1024 ||
											!['application/pdf', 'image/png', 'image/jpeg'].includes(
												file.type,
											)
										) {
											E('PDF/JPG/PNG only, maximum 5MB');
											return;
										}
										const path =
											session.user.id +
											'/' +
											crypto.randomUUID() +
											'-' +
											file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
										const upload = await supabase.storage
											.from('student-documents')
											.upload(path, file);
										if (upload.error) {
											E(upload.error.message);
											return;
										}
										const result = await supabase.from('documents').insert({
											application_id: id,
											student_id: session.user.id,
											label: label.trim(),
											storage_path: path,
										});
										if (result.error) {
											const cleanup = await supabase.storage
												.from('student-documents')
												.remove([path]);
											E(
												cleanup.error
													? `${result.error.message}; uploaded file cleanup failed: ${cleanup.error.message}`
													: result.error.message,
											);
											return;
										}
										N('Document uploaded');
										refresh();
									}}
								>
									Upload document
								</button>
							</>
						)}
						<div className="tablewrap">
							<table>
								<thead>
									<tr>
										<th>Label</th>
										<th>Application</th>
										<th>Uploaded</th>
										<th>View</th>
									</tr>
								</thead>
								<tbody>
									{visible.map((x) => (
										<tr key={x.id}>
											<td>{x.label}</td>
											<td>{x.application_id}</td>
											<td>{x.created_at}</td>
											<td>
												<button
													onClick={async () => {
														let { data, error } = await supabase.storage
															.from('student-documents')
															.createSignedUrl(x.storage_path, 60);
														if (error) E(error.message);
														else
															window.open(
																data.signedUrl,
																'_blank',
																'noopener,noreferrer',
															);
													}}
												>
													Open securely
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				) : table ? (
					<section className="panel">
						<div className="panelhead">
							<div>
								<h2>{page}</h2>
								<p>Manage SVIT master data and configuration</p>
							</div>
							<div className="actions">
								<input
									placeholder="Search records..."
									value={search}
									onChange={(e) => U(e.target.value)}
								/>
								<button className="primary" onClick={() => edit()}>
									+ Add New
								</button>
							</div>
						</div>
						{editing && (
							<form className="editgrid" onSubmit={save}>
								<h3>{editing === 'new' ? 'Create record' : 'Edit record'}</h3>
								{fields.map((k) => (
									<label key={k}>
										{k.replaceAll('_', ' ')}
										{['active', 'published', 'status', 'mode'].includes(k) ? (
											<select
												value={String(form[k] ?? true)}
												onChange={(e) => F({ ...form, [k]: e.target.value })}
											>
												{['active', 'published'].includes(k) ? (
													<>
														<option value="true">Yes</option>
														<option value="false">No</option>
													</>
												) : k === 'mode' ? (
													<>
														<option value="cash">Cash</option>
														<option value="cheque">Cheque</option>
														<option value="bank_transfer">Bank transfer</option>
													</>
												) : (
													<>
														<option value="draft">Draft</option>
														<option value="published">Published</option>
													</>
												)}
											</select>
										) : ['fields', 'formula', 'description'].includes(k) ? (
											<textarea
												rows="4"
												value={form[k] ?? ''}
												onChange={(e) => F({ ...form, [k]: e.target.value })}
											/>
										) : (
											<input
												type={
													k.includes('date') ||
													['starts_on', 'ends_on'].includes(k)
														? 'date'
														: [
																	'amount_paise',
																	'intake',
																	'score',
																	'rank',
															  ].includes(k)
															? 'number'
															: 'text'
												}
												value={form[k] ?? ''}
												onChange={(e) => F({ ...form, [k]: e.target.value })}
											/>
										)}
									</label>
								))}
								<div className="actions">
									<button className="primary">Save Record</button>
									<button type="button" onClick={() => G(null)}>
										Cancel
									</button>
								</div>
								<p className="hint">
									UUID reference fields must refer to existing records. Form
									fields JSON example:{' '}
									{`[{"key":"full_name","label":"Full Name","type":"text","required":true}]`}
								</p>
							</form>
						)}
						<div className="tablewrap">
							<table>
								<thead>
									<tr>
										{fields.map((f) => (
											<th key={f}>{f.replaceAll('_', ' ')}</th>
										))}
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{visible.map((x) => (
										<tr key={x.id}>
											{fields.map((f) => (
												<td key={f} title={String(x[f] ?? '')}>
													{f === 'amount_paise'
														? money(x[f])
														: typeof x[f] === 'object'
															? JSON.stringify(x[f]).slice(0, 90)
															: String(x[f] ?? '\u2014')}
												</td>
											))}
											<td>
												<button onClick={() => edit(x)}>Edit</button>{' '}
												<button className="danger" onClick={() => remove(x.id)}>
													Delete
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{!visible.length && (
								<div className="empty">
									No records found. Use Add New to get started.
								</div>
							)}
						</div>
					</section>
				) : null}
			</main>
		</div>
	);
}
createRoot(document.getElementById('root')).render(<App />);
