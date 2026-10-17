import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, configured } from './supabase';
import { downloadExcel } from './lib/excel';
import { fieldLabel, isUuid, isUuidField } from './lib/validation';
import './style.css';
const DynamicFormBuilder = React.lazy(
	() => import('./components/DynamicFormBuilder'),
);
const SmartIdCards = React.lazy(() => import('./components/SmartIdCards'));
const UserManagement = React.lazy(() => import('./components/UserManagement'));
const PublicInquiry = React.lazy(() =>
	import('./components/InquiryModule').then((module) => ({
		default: module.PublicInquiry,
	})),
);
const InquiryDashboard = React.lazy(() =>
	import('./components/InquiryModule').then((module) => ({
		default: module.InquiryDashboard,
	})),
);
const InquiryAdmissions = React.lazy(
	() => import('./components/InquiryAdmissions'),
);
const ExcelTableTools = React.lazy(
	() => import('./components/ExcelTableTools'),
);
const TimetableModule = React.lazy(() =>
	import('./components/Academics').then((module) => ({
		default: module.TimetableModule,
	})),
);
const LeaveModule = React.lazy(() =>
	import('./components/Academics').then((module) => ({
		default: module.LeaveModule,
	})),
);
const AttendanceModule = React.lazy(() =>
	import('./components/Academics').then((module) => ({
		default: module.AttendanceModule,
	})),
);
const modules = [
	['Dashboard', 'LayoutDashboard'],
	['Colleges', '\u{1F3EB}'],
	['Courses', '\u{1F4DA}'],
	['Branches', '\u{1F33F}'],
	['Academic Years', '\u{1F4C5}'],
	['Faculty', '\u{1F9D1}\u200D\u{1F3EB}'],
	['Student Management', '\u{1F9D1}\u200D\u{1F393}'],
	['Subjects', '\u{1F4D8}'],
	['Timetable Management', '\u{1F550}'],
	['Leave Management', '\u{1F334}'],
	['Attendance', '\u2705'],
	['Inquiries', '\u{1F4DE}'],
	['Form Builder', '\u{1F4DD}'],
	['User Management', '\u{1F465}'],
	['ID Cards', '\u{1F39F}\uFE0F'],
	['Final Admissions', '\u{1F393}'],
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
const moduleCards = [
	{
		id: 'admissions',
		title: 'Admission Management',
		description: 'Inquiry, Admission, Intake, Fees & Receipt',
		icon: '\u{1F4CB}',
		badge: 'Separate Login',
		pages: [
			'Dashboard',
			'Inquiries',
			'Applications',
			'ID Cards',
			'Final Admissions',
			'Documents',
			'Fee Structures',
			'Fee Assignments',
			'Payments',
			'Form Builder',
		],
	},
	{
		id: 'student_management',
		title: 'Student Management',
		description: 'Student Master, Department, Semester, Division',
		icon: '\u{1F465}',
		badge: 'Separate Login',
		pages: ['Dashboard', 'Student Management'],
	},
	{
		id: 'timetable_faculty',
		title: 'Time Table & Faculty',
		description: 'Faculty Login, Leave, Proxy & Attendance',
		icon: '\u{1F4C5}',
		badge: 'Separate Login',
		pages: [
			'Dashboard',
			'Faculty',
			'Subjects',
			'Timetable Management',
			'Leave Management',
			'Attendance',
		],
	},
	{
		id: 'super_admin',
		title: 'Super Admin',
		description: 'College Settings, Users, Permissions, Excel Templates',
		icon: '\u2699\uFE0F',
		badge: 'Restricted',
		pages: null,
	},
];
const moduleById = Object.fromEntries(moduleCards.map((card) => [card.id, card]));
const meta = {
	Colleges: ['colleges', ['name', 'active']],
	Courses: ['courses', ['name', 'code', 'active']],
	Branches: ['branches', ['name', 'course_id', 'intake', 'active']],
	'Academic Years': [
		'academic_years',
		['name', 'starts_on', 'ends_on', 'active'],
	],
	Faculty: ['faculty', ['code', 'name', 'department', 'active']],
	'Student Management': [
		'students',
		['enrollment', 'name', 'course', 'semester', 'division', 'active'],
	],
	Subjects: ['subjects', ['code', 'name', 'course', 'semester', 'active']],
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
const excelImportTables = new Set([
	'colleges',
	'courses',
	'branches',
	'academic_years',
	'fee_structures',
	'faculty',
	'students',
	'subjects',
]);
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

	if (field.type === 'radio')
		return (
			<div className="admission-radio-group">
				{(field.options ?? []).map((option) => (
					<label key={option}>
						<input
							type="radio"
							name={field.key}
							value={option}
							required={Boolean(field.required)}
						/>
						{option}
					</label>
				))}
			</div>
		);
	const inputType = ['email', 'date', 'number', 'tel', 'url'].includes(
		field.type,
	)
		? field.type
		: 'text';
	return <input {...common} type={inputType} />;
}

class FormBuilderErrorBoundary extends React.Component {
	state = { error: null };

	static getDerivedStateFromError(error) {
		return { error };
	}

	componentDidCatch(error) {
		console.error('Form Builder failed to render:', error);
	}

	render() {
		if (this.state.error) {
			return (
				<section className="panel">
					<h2>Form Builder could not be opened</h2>
					<p>{this.state.error.message || 'An unexpected rendering error occurred.'}</p>
					<button
						type="button"
						onClick={() => this.setState({ error: null })}
					>
						Try again
					</button>
				</section>
			);
		}
		return this.props.children;
	}
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
		[staffRole, SR] = useState(null),
		[staffFacultyId, SF] = useState(null),
		[staffAccessLoaded, setStaffAccessLoaded] = useState(false),
		[activePortal, setActivePortal] = useState(
			() => sessionStorage.getItem('svit-active-portal') || '',
		),
		[publicInquiryRoute, setPublicInquiryRoute] = useState(
			window.location.hash === '#/inquiry',
		),
		[auth, A] = useState({ email: '', password: '', full_name: '' }),
		[signup, SU] = useState(false);
	const admin = profile?.role === 'admin';
	const idCardOperator = staffRole === 'id_card';
	const canManageIdCards = admin || idCardOperator;
	const canPrepareAdmissions = admin || staffRole === 'data_entry';
	const canDecideAdmissions = admin || staffRole === 'authority';
	const canReadAdmissions =
		admin ||
		['data_entry', 'authority', 'principal', 'department_head'].includes(
			staffRole,
		);
	const canManageInquiries =
		admin || ['authority', 'data_entry'].includes(staffRole);
	const canReadInquiries =
		canManageInquiries || ['principal', 'department_head'].includes(staffRole);
	const canManageAcademics = admin || staffRole === 'department_head';
	const canReadAcademics =
		canManageAcademics ||
		['authority', 'principal', 'data_entry', 'faculty'].includes(staffRole);
	const canReadStudentRoster =
		canReadAcademics && staffRole !== 'faculty';
	const canRecordAttendance = canManageAcademics || staffRole === 'faculty';
	const canManageCurrentMaster =
		admin ||
		(canManageAcademics &&
			['Student Management', 'Faculty', 'Subjects'].includes(page));
	const canReadCurrentMaster =
		admin ||
		(page === 'Student Management' && canReadStudentRoster) ||
		(['Faculty', 'Subjects'].includes(page) && canReadAcademics);
	const allowedPortals = new Set([
		...(admin ? moduleCards.map((card) => card.id) : []),
		...(canReadAdmissions ||
		canReadInquiries ||
		idCardOperator ||
		(!staffRole && profile?.role !== 'admin')
			? ['admissions']
			: []),
		...(canReadStudentRoster ? ['student_management'] : []),
		...(canReadAcademics &&
		(staffRole !== 'faculty' || Boolean(staffFacultyId))
			? ['timetable_faculty']
			: []),
	]);
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
		const updateRoute = () =>
			setPublicInquiryRoute(window.location.hash === '#/inquiry');
		window.addEventListener('hashchange', updateRoute);
		return () => window.removeEventListener('hashchange', updateRoute);
	}, []);
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
	useEffect(() => {
		const onImport = (event) => {
			if (event.detail === table) void refresh();
		};
		window.addEventListener('erp-data-imported', onImport);
		return () => window.removeEventListener('erp-data-imported', onImport);
	}, [table, session, profile]);
	useEffect(() => {
		let cancelled = false;
		async function loadStaffAccess() {
			if (!session || !profile || admin) {
				SR(null);
				SF(null);
				setStaffAccessLoaded(Boolean(profile));
				return;
			}
			setStaffAccessLoaded(false);
			const { data, error } = await supabase
				.from('staff_members')
				.select('role_code,active,faculty_id')
				.eq('user_id', session.user.id)
				.maybeSingle();
			if (cancelled) return;
			if (error) {
				SR(null);
				SF(null);
				setStaffAccessLoaded(true);
				if (error.code !== 'PGRST205' && error.code !== '42P01')
					E(error.message);
				return;
			}
			SR(data?.active ? data.role_code : null);
			SF(data?.active ? data.faculty_id ?? null : null);
			setStaffAccessLoaded(true);
		}
		void loadStaffAccess();
		return () => {
			cancelled = true;
		};
	}, [session, profile, admin]);
	useEffect(() => {
		if (!session || !profile || !staffAccessLoaded || !activePortal) return;
		if (allowedPortals.has(activePortal)) {
			E('');
			return;
		}
		E('Your account does not have access to this module.');
		sessionStorage.removeItem('svit-active-portal');
		setActivePortal('');
		void supabase.auth.signOut();
	}, [session, profile, staffAccessLoaded, activePortal, staffRole, staffFacultyId]);
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
	function choosePortal(portalId) {
		sessionStorage.setItem('svit-active-portal', portalId);
		setActivePortal(portalId);
		Q('Dashboard');
		SU(false);
		E('');
		N('');
	}
	async function signOut() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			E(error.message);
			return;
		}
		sessionStorage.removeItem('svit-active-portal');
		setActivePortal('');
		Q('Dashboard');
		G(null);
	}
	async function save(e) {
		e.preventDefault();
		E('');
		let data = { ...form };
		for (const [k, v] of Object.entries(data)) {
			if (v === '') data[k] = null;
			if (isUuidField(k) && data[k] !== null && !isUuid(v)) {
				E(`${fieldLabel(k)} must be a valid UUID.`);
				return;
			}
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
		const res =
			editing && editing !== 'new'
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
		if (!published?.id || !Array.isArray(published.fields)) {
			E('No published admission form available');
			return;
		}
		let answers = {};
		for (const f of published.fields) {
			const control = formElement.elements.namedItem(f.key);
			if (!control) {
				E(`The published form field "${f.label}" is invalid.`);
				return;
			}
			const v =
				f.type === 'checkbox' ? control.checked : (control.value ?? '');
			if (f.required && (typeof v === 'boolean' ? !v : !String(v).trim())) {
				E(f.label + ' is required');
				return;
			}
			answers[f.key] = v;
		}
		const r = await supabase
			.from('applications')
			.insert({ student_id: session.user.id, form_id: published.id, answers });
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
				.order('created_at', { ascending: false })
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
	if (publicInquiryRoute)
		return (
			<Suspense fallback={<div className="setup">Loading inquiry form...</div>}>
				<PublicInquiry />
			</Suspense>
		);
	if (loading) return <div className="setup">Loading…</div>;
	if ((!session && !activePortal) || (session && !activePortal && staffAccessLoaded))
		return (
			<div className="module-home">
				<header className="module-home-header">
					<div>
						<div className="module-eyebrow">SVIT ERP</div>
						<h1>Main Dashboard Structure</h1>
					</div>
					{session && (
						<div className="account">
							<span>{profile?.full_name || session.user.email}</span>
							<button type="button" onClick={() => void signOut()}>
								Sign out
							</button>
						</div>
					)}
				</header>
				<section className="module-group">
					<h2>
						<span aria-hidden="true">🎓</span> College Management System
					</h2>
					<div className="module-cards">
						{moduleCards
							.filter(
								(card) =>
									!session ||
									(staffAccessLoaded && allowedPortals.has(card.id)),
							)
							.map((card) => (
								<button
									type="button"
									className="module-card"
									key={card.id}
									onClick={() => choosePortal(card.id)}
								>
									<span className="module-icon" aria-hidden="true">
										{card.icon}
									</span>
									<span className="module-title">{card.title}</span>
									<span className="module-description">
										{card.description}
									</span>
									<span
										className={`module-badge ${card.id === 'super_admin' ? 'restricted' : ''}`}
									>
										{card.badge}
									</span>
								</button>
							))}
					</div>
					{session && staffAccessLoaded && !allowedPortals.size && (
						<div className="error">
							This account has no active module access. Contact the
							administrator.
						</div>
					)}
				</section>
				{err && <div className="error">{err}</div>}
			</div>
		);
	if (!session)
		return (
			<div className="authwrap">
				<div className="authbrand">
					<div className="logo">S</div>
					<p className="module-eyebrow">SVIT ERP MODULE LOGIN</p>
					<h1>{moduleById[activePortal]?.title || 'Module Login'}</h1>
					<p>
						{moduleById[activePortal]?.description ||
							'Sign in to continue to your workspace.'}
					</p>
					<div className="authart">
						{moduleById[activePortal]?.title || 'SVIT ERP'}
					</div>
				</div>
				<form className="authcard" onSubmit={login}>
					<h2>{signup ? 'Student Registration' : 'Welcome back'}</h2>
					<p>
						Sign in to{' '}
						{moduleById[activePortal]?.title || 'your selected module'}
					</p>
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
					{activePortal === 'admissions' && (
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
					)}
					<button
						type="button"
						className="link"
						onClick={() => {
							setActivePortal('');
							sessionStorage.removeItem('svit-active-portal');
							SU(false);
							E('');
						}}
					>
						← Choose another module
					</button>
					{activePortal === 'admissions' && (
						<a className="link" href="#/inquiry">
							Ask about admission
						</a>
					)}
				</form>
			</div>
		);
	if (!profile || !staffAccessLoaded)
		return <div className="setup">Loading account access…</div>;
	if (!allowedPortals.has(activePortal))
		return (
			<div className="setup">
				<h1>Module access restricted</h1>
				<p>Your account does not have access to this module.</p>
				<div className="actions">
					<button
						type="button"
						onClick={() => {
							setActivePortal('');
							sessionStorage.removeItem('svit-active-portal');
						}}
					>
						Choose another module
					</button>
					<button type="button" onClick={() => void signOut()}>
						Sign out
					</button>
				</div>
			</div>
		);
	const roleNav = admin
		? modules.filter(([x]) => x !== 'My Applications')
		: staffRole
			? modules.filter(([x]) =>
					[
						'Dashboard',
						...(canReadInquiries ? ['Inquiries'] : []),
						...(idCardOperator ? ['Applications', 'ID Cards'] : []),
						...(canReadAdmissions ? ['Final Admissions'] : []),
						...(canReadStudentRoster ? ['Student Management'] : []),
						...(canReadAcademics ? ['Faculty', 'Subjects'] : []),
						...(canReadAcademics &&
						(staffRole !== 'faculty' || Boolean(staffFacultyId))
							? ['Timetable Management']
							: []),
						...(canManageAcademics ||
						(staffRole === 'faculty' && Boolean(staffFacultyId))
							? ['Leave Management']
							: []),
						...(canRecordAttendance &&
						(canManageAcademics || Boolean(staffFacultyId))
							? ['Attendance']
							: []),
					].includes(x),
				)
			: modules.filter(([x]) =>
					['Dashboard', 'My Applications', 'Documents'].includes(x),
				);
	const nav =
		activePortal === 'super_admin'
			? roleNav
			: roleNav.filter(([name]) =>
					moduleById[activePortal]?.pages?.includes(name),
				);
	const visible = rows.filter((r) =>
		JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
	);
	async function exportApplications() {
		try {
			await downloadExcel({
				fileName: 'svit-applications',
				sheetName: 'Applications',
				columns: [
					{ key: 'application_number', label: 'Application number' },
					{ key: 'student_id', label: 'Student ID' },
					{ key: 'status', label: 'Status' },
					{ key: 'created_at', label: 'Created at' },
				],
				rows: visible,
			});
		} catch (error) {
			E(error instanceof Error ? error.message : 'Excel export failed.');
		}
	}
	async function exportDocuments() {
		try {
			await downloadExcel({
				fileName: 'svit-document-register',
				sheetName: 'Document register',
				columns: [
					{ key: 'label', label: 'Document label' },
					{ key: 'application_id', label: 'Application ID' },
					{ key: 'created_at', label: 'Uploaded at' },
				],
				rows: visible,
			});
		} catch (error) {
			E(error instanceof Error ? error.message : 'Excel export failed.');
		}
	}
	async function exportReport() {
		try {
			await downloadExcel({
				fileName: 'svit-admission-overview',
				sheetName: 'Overview',
				columns: [
					{ key: 'metric', label: 'Metric' },
					{ key: 'value', label: 'Value' },
				],
				rows: Object.entries(stats).map(([metric, value]) => ({
					metric,
					value,
				})),
			});
		} catch (error) {
			E(error instanceof Error ? error.message : 'Excel export failed.');
		}
	}
	return (
		<div className="shell">
			<aside>
				<div className="brand">
					<div className="logo">S</div>
					<div>
						<b>SVIT ERP</b>
						<small>{moduleById[activePortal]?.title}</small>
					</div>
				</div>
				<div className="navtitle">
					{moduleById[activePortal]?.title || 'WORKSPACE'}
				</div>
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
						<small>
							SVIT / {moduleById[activePortal]?.title} / {page}
						</small>
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
						<button onClick={() => void signOut()}>Sign out</button>
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
								<span>{moduleById[activePortal]?.title?.toUpperCase()}</span>
								<h2>Welcome to SVIT ERP</h2>
								<p>
									{moduleById[activePortal]?.description}
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
						<button type="button" onClick={() => void exportReport()}>
							Export overview Excel
						</button>
						<p className="hint">
							This is a basic report. Fee reconciliation and full report builder
							need further work.
						</p>
					</section>
				) : page === 'Inquiries' && canReadInquiries ? (
					<Suspense fallback={<section className="panel">Loading inquiries...</section>}>
						<InquiryDashboard canManage={canManageInquiries} />
					</Suspense>
				) : page === 'Timetable Management' && canReadAcademics ? (
					<Suspense fallback={<section className="panel">Loading timetable...</section>}>
						<TimetableModule
							canManage={canManageAcademics}
							facultyId={staffRole === 'faculty' ? staffFacultyId : null}
						/>
					</Suspense>
				) : page === 'Leave Management' &&
					(canManageAcademics || (staffRole === 'faculty' && staffFacultyId)) ? (
					<Suspense fallback={<section className="panel">Loading faculty leave...</section>}>
						<LeaveModule
							canManage={canManageAcademics}
							facultyId={staffRole === 'faculty' ? staffFacultyId : null}
						/>
					</Suspense>
				) : page === 'Attendance' &&
					canRecordAttendance &&
					(canManageAcademics || staffFacultyId) ? (
					<Suspense fallback={<section className="panel">Loading attendance...</section>}>
						<AttendanceModule
							canManage={canManageAcademics}
							facultyId={staffRole === 'faculty' ? staffFacultyId : null}
						/>
					</Suspense>
				) : page === 'My Applications' && !admin ? (
					<>
						<section className="panel">
							<h2>New Admission Application</h2>
							{published ? (
								<form onSubmit={apply} className="editgrid">
									<h3>{published.title}</h3>
									{published.description && <p>{published.description}</p>}
									{(Array.isArray(published.fields)
										? published.fields
										: []
									).map((f) => (
										<div className="admission-field" key={f.key}>
											<span>
												{f.label}
												{f.required && ' *'}
											</span>
											<AdmissionField field={f} />
										</div>
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
							<button type="button" onClick={() => void exportApplications()}>
								Export Excel
							</button>
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
						<div className="panelhead">
							<h2>Private Student Documents</h2>
							<button type="button" onClick={() => void exportDocuments()}>
								Export register Excel
							</button>
						</div>
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
				) : page === 'Form Builder' && admin ? (
					<Suspense fallback={<section className="panel">Loading Form Builder...</section>}>
						<FormBuilderErrorBoundary>
							<DynamicFormBuilder />
						</FormBuilderErrorBoundary>
					</Suspense>
				) : page === 'User Management' && admin ? (
					<Suspense fallback={<section className="panel">Loading staff management...</section>}>
						<UserManagement />
					</Suspense>
				) : page === 'ID Cards' && canManageIdCards ? (
					<Suspense fallback={<section className="panel">Loading ID Cards...</section>}>
						<SmartIdCards />
					</Suspense>
				) : page === 'Final Admissions' && canReadAdmissions ? (
					<Suspense fallback={<section className="panel">Loading admissions...</section>}>
						<InquiryAdmissions
							canPrepare={canPrepareAdmissions || canDecideAdmissions}
							canDecide={canDecideAdmissions}
							canManageIntakes={admin}
						/>
					</Suspense>
				) : table && canReadCurrentMaster ? (
					<section className="panel">
						<div className="panelhead">
							<div>
								<h2>{page}</h2>
								<p>
									{canManageCurrentMaster
										? `Manage ${page.toLowerCase()} records`
										: `View ${page.toLowerCase()} records`}
								</p>
							</div>
							<div className="actions">
								<input
									placeholder="Search records..."
									value={search}
									onChange={(e) => U(e.target.value)}
								/>
								{canManageCurrentMaster && (
									<>
										<Suspense fallback={null}>
											<ExcelTableTools
												table={table}
												page={page}
												fields={fields}
												allowImport={excelImportTables.has(table)}
											/>
										</Suspense>
										<button className="primary" onClick={() => edit()}>
											{page === 'Student Management'
												? '+ Add Student'
												: '+ Add New'}
										</button>
									</>
								)}
							</div>
						</div>
						{editing && canManageCurrentMaster && (
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
										{canManageCurrentMaster && <th>Actions</th>}
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
											{canManageCurrentMaster && (
												<td>
													<button onClick={() => edit(x)}>Edit</button>{' '}
													<button className="danger" onClick={() => remove(x.id)}>
														Delete
													</button>
												</td>
											)}
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
