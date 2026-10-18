import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, configured } from './supabase';
import { downloadExcel } from './lib/excel';
import { fieldLabel, isUuid, isUuidField } from './lib/validation';
import { pagePermission } from './lib/accessControl';
import './style.css';
const DynamicFormBuilder = React.lazy(
	() => import('./components/DynamicFormBuilder'),
);
const StudentProfileSchema = React.lazy(
	() => import('./components/StudentProfileSchema'),
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
const WorkbookManager = React.lazy(
	() => import('./components/WorkbookManager'),
);
const ReceiptSequenceManager = React.lazy(
	() => import('./components/ReceiptSequenceManager'),
);
const ReportBuilder = React.lazy(() => import('./components/ReportBuilder'));
const InquiryFormBuilder = React.lazy(
	() => import('./components/InquiryFormBuilder'),
);
const CollegeTiming = React.lazy(() => import('./components/CollegeTiming'));
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
const NoticeBoard = React.lazy(() => import('./components/NoticeBoard'));
const TimetableDashboard = React.lazy(
	() => import('./components/TimetableDashboard'),
);
const LeaveDashboard = React.lazy(() => import('./components/LeaveDashboard'));
const StudentManagement = React.lazy(
	() => import('./components/StudentManagement'),
);
const modules = [
	['Dashboard', 'LayoutDashboard'],
	['Manage Users', '\u{1F465}'],
	['Universities', '\u{1F3DB}\uFE0F'],
	['Colleges', '\u{1F3EB}'],
	['Courses', '\u{1F4DA}'],
	['Branches', '\u{1F33F}'],
	['Academic Calendar', '\u{1F4C5}'],
	['Admission Sequences', '\u{1F522}'],
	['Receipt Sequences', '\u{1F9FE}'],
	['Form Types', '\u{1F3F7}\uFE0F'],
	['Student Profile Schema', '\u{1F4DD}'],
	['Dynamic Forms', '\u{1F4DD}'],
	['Fee Structures', '\u20B9'],
	['Fee Schemes', '\u{1F4B0}'],
	['Payment Gateways', '\u{1F4B3}'],
	['Merit Formulas', '\u{1F3C5}'],
	['Calculate Merit', '\u{1F9EE}'],
	['Inquiry Forms', '\u{1F4DE}'],
	['Report Builder', '\u{1F4CA}'],
	['Documentation', '\u{1F4D6}'],
	['Config Guide', '\u2699\uFE0F'],
	['Bus Seva QR Config', '\u{1F68D}'],
	['Notice Board', '\u{1F4E2}'],
	['Faculty', '\u{1F9D1}\u200D\u{1F3EB}'],
	['Student Management', '\u{1F9D1}\u200D\u{1F393}'],
	['Subjects', '\u{1F4D8}'],
	['Timetable Dashboard', '\u{1F4CA}'],
	['Timetable Management', '\u{1F550}'],
	['College Timing', '\u{1F552}'],
	['Leave Dashboard', '\u{1F334}'],
	['Leave Management', '\u{1F4CB}'],
	['Attendance', '\u2705'],
	['Inquiries', '\u{1F4DE}'],
	['ID Cards', '\u{1F39F}\uFE0F'],
	['Final Admissions', '\u{1F393}'],
	['Applications', '\u{1F468}\u200D\u{1F393}'],
	['Documents', '\u{1F4C1}'],
	['Manage Admission Forms', '\u{1F4C4}'],
	['Fee Assignments', '\u{1F9FE}'],
	['Payments', '\u{1F4B3}'],
	['Merit Entries', '\u{1F4CA}'],
	['Reports', '\u{1F4C8}'],
	['My Applications', '\u{1F464}'],
	['Workbook Data', '\u{1F4D1}'],
];
const moduleCards = [
	{
		id: 'college_info',
		title: 'College information',
		description: 'Users, Universities, Colleges, Courses, Branches, Calendar & Faculty',
		icon: '\u{1F3DB}\uFE0F',
		badge: 'Administrative',
		pages: [
			'Manage Users',
			'Universities',
			'Colleges',
			'Courses',
			'Branches',
			'Academic Calendar',
			'Faculty',
		],
	},
	{
		id: 'admissions',
		title: 'New Admission Student management',
		description: 'Inquiries, Admission Forms, Sequences, Fees, Merit, Reports & Notice Board',
		icon: '\u{1F393}',
		badge: 'Admissions Portal',
		pages: [
			'Dashboard',
			'Admission Sequences',
			'Receipt Sequences',
			'Form Types',
			'Student Profile Schema',
			'Dynamic Forms',
			'Fee Structures',
			'Fee Schemes',
			'Payment Gateways',
			'Merit Formulas',
			'Calculate Merit',
			'Inquiry Forms',
			'Report Builder',
			'Documentation',
			'Config Guide',
			'Bus Seva QR Config',
			'Inquiries',
			'Final Admissions',
			'Manage Admission Forms',
			'Fee Assignments',
			'Payments',
			'Merit Entries',
			'Reports',
			'Workbook Data',
			'Documents',
			'Applications',
			'Notice Board',
		],
	},
	{
		id: 'timetable',
		title: 'Time table',
		description: 'Timetable Dashboard, Subjects, Timetable Management & College Timing',
		icon: '\u{1F550}',
		badge: 'Academics',
		pages: [
			'Timetable Dashboard',
			'Subjects',
			'Timetable Management',
			'College Timing',
		],
	},
	{
		id: 'faculty_leave',
		title: 'Faculty Leave Mangment',
		description: 'Daily Leave & Proxy Dashboard, Approval by Post (HOD/Principal/Chairman) & Docs',
		icon: '\u{1F334}',
		badge: 'Faculty Portal',
		pages: [
			'Leave Dashboard',
			'Leave Management',
		],
	},
	{
		id: 'student_management',
		title: 'Student Management',
		description: 'Admission Year Student Data (ID & Enrollment Wise), Attendance & ID Cards',
		icon: '\u{1F9D1}\u200D\u{1F393}',
		badge: 'Student Records',
		pages: [
			'Student Management',
			'Attendance',
			'ID Cards',
		],
	},
	{
		id: 'super_admin',
		title: 'Super Admin',
		description: 'Full ERP Control, All Module Access, Security & User Roles',
		icon: '\u2699\uFE0F',
		badge: 'Full Access',
		pages: null,
	},
];
const moduleById = Object.fromEntries(moduleCards.map((card) => [card.id, card]));
const superAdminModules = [
	{
		title: 'College Information',
		description: 'Manage users, universities, colleges, courses, branches, and faculty',
		icon: '\u{1F3DB}\uFE0F',
		entryPage: 'Colleges',
		pages: [
			'Manage Users',
			'Universities',
			'Colleges',
			'Courses',
			'Branches',
			'Academic Calendar',
			'Faculty',
		],
	},
	{
		title: 'New Admission Student Management',
		description: 'Inquiries, final admissions, intake, dynamic forms, fees, reports, and notice board',
		icon: '\u{1F393}',
		entryPage: 'Final Admissions',
		pages: [
			'Inquiries',
			'Final Admissions',
			'Applications',
			'Manage Admission Forms',
			'Dynamic Forms',
			'Fee Assignments',
			'Payments',
			'Reports',
			'Notice Board',
		],
	},
	{
		title: 'Time Table Management',
		description: 'Timetable dashboard, subjects, lecture slots, and college timings',
		icon: '\u{1F550}',
		entryPage: 'Timetable Dashboard',
		pages: [
			'Timetable Dashboard',
			'Subjects',
			'Timetable Management',
			'College Timing',
		],
	},
	{
		title: 'Faculty Leave Management',
		description: 'Day-to-day leave & proxy dashboard, and hierarchical approvals',
		icon: '\u{1F334}',
		entryPage: 'Leave Dashboard',
		pages: [
			'Leave Dashboard',
			'Leave Management',
		],
	},
	{
		title: 'Student Management',
		description: 'Admission year student data (ID & Enrollment wise), attendance, and ID cards',
		icon: '\u{1F9D1}\u200D\u{1F393}',
		entryPage: 'Student Management',
		pages: [
			'Student Management',
			'Attendance',
			'ID Cards',
		],
	},
];
const superAdminModulePages = new Set(
	superAdminModules.flatMap((module) => module.pages),
);
function inquiryValueForField(field, inquiry) {
	const key = String(field.key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
	const label = String(field.label ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
	const matches = (...aliases) =>
		aliases.some(
			(alias) =>
				key === alias ||
				label === alias ||
				label.includes(alias),
		);
	let value;
	if (
		matches('studentname', 'applicantname', 'fullname') ||
		key === 'name' ||
		label === 'name'
	) {
		value = inquiry.student_name;
	} else if (
		matches('mobilenumber', 'mobile', 'phonenumber', 'phone', 'contactnumber')
	) {
		value = inquiry.mobile;
	} else if (matches('emailaddress', 'email')) {
		value = inquiry.email;
	} else if (matches('interestedcourse', 'courseinterest', 'coursename', 'course')) {
		value = inquiry.course_interest;
	} else if (matches('preferredbranch', 'branchinterest', 'branchname', 'branch')) {
		value = inquiry.branch_interest;
	} else if (matches('currentqualification', 'qualification', 'education')) {
		value = inquiry.qualification;
	} else if (matches('city', 'town')) {
		value = inquiry.city;
	}
	if (!value || ['file', 'photo', 'document', 'checkbox', 'date', 'number'].includes(field.type)) {
		return '';
	}
	if (field.type === 'select') {
		const option = field.options?.find(
			(item) => String(item).trim().toLowerCase() === String(value).trim().toLowerCase(),
		);
		return option ?? '';
	}
	return value;
}
const meta = {
	Universities: ['universities', ['name', 'active']],
	Colleges: [
		'colleges',
		['name', 'code', 'university_name', 'logo_url', 'active'],
	],
	Courses: [
		'courses',
		[
			'name',
			'code',
			'enrollment_code',
			'college_id',
			'department_id',
			'duration_years',
			'intake_capacity',
			'active',
		],
	],
	Branches: [
		'branches',
		[
			'name',
			'code',
			'enrollment_code',
			'course_id',
			'college_id',
			'intake',
			'intake_heads',
			'active',
		],
	],
	'Academic Years': [
		'academic_years',
		['name', 'starts_on', 'ends_on', 'active'],
	],
	'Academic Calendar': [
		'academic_years',
		['name', 'starts_on', 'ends_on', 'active'],
	],
	'Form Types': ['form_types', ['name', 'code', 'description', 'flags', 'active']],
	'Student Profile Schema': [
		'student_profile_fields',
		[
			'label',
			'key',
			'input_type',
			'default_value',
			'required',
			'force_uppercase',
			'display_order',
		],
	],
	'Manage Admission Forms': [
		'admission_forms',
		[
			'title',
			'academic_year',
			'college_id',
			'course_id',
			'form_type_id',
			'description',
			'status',
			'show_college_logo',
			'application_fee_paise',
			'enabled_for_students',
			'enable_branch_selection',
			'allowed_admission_types',
			'form_layout',
			'form_sections',
			'fields',
		],
	],
	Faculty: [
		'faculty',
		['code', 'name', 'college_id', 'department', 'designation', 'active'],
	],
	'Student Management': [
		'students',
		['enrollment', 'student_id_code', 'name', 'course', 'semester', 'division', 'admission_year', 'active'],
	],
	Subjects: ['subjects', ['code', 'name', 'course', 'semester', 'active']],
	'Form Builder': [
		'admission_forms',
		[
			'title',
			'description',
			'college_id',
			'course_id',
			'academic_year',
			'form_type_id',
			'application_fee_paise',
			'enabled_for_students',
			'enable_branch_selection',
			'allowed_admission_types',
			'form_layout',
			'form_sections',
			'fields',
			'status',
		],
	],
	'Fee Structure Management': [
		'fee_structures',
		[
			'title',
			'course_id',
			'academic_year',
			'form_type_id',
			'fee_scheme_id',
			'amount_paise',
			'components',
			'active',
		],
	],
	'Manage Fee Schemes': ['fee_schemes', ['name', 'description', 'active']],
	'Fee Structures': [
		'fee_structures',
		[
			'title',
			'course_id',
			'academic_year',
			'form_type_id',
			'fee_scheme_id',
			'amount_paise',
			'components',
			'active',
		],
	],
	'Fee Schemes': ['fee_schemes', ['name', 'description', 'active']],
	'Admission Sequences': [
		'admission_sequences',
		[
			'college_id',
			'academic_year',
			'course_id',
			'admission_type',
			'prefix',
			'current_sequence',
			'active',
		],
	],
	'Payment Gateways': [
		'payment_gateways',
		[
			'college_id',
			'name',
			'provider',
			'environment',
			'public_key',
			'description',
			'active',
		],
	],
	'Bus Seva QR Config': [
		'bus_seva_qr_configs',
		['college_id', 'route_code', 'route_name', 'qr_base_url', 'active'],
	],
	'Receipt Sequences': [
		'receipt_sequences',
		[
			'college_id',
			'academic_year',
			'payment_type',
			'course_id',
			'admission_type',
			'prefix',
			'current_sequence',
			'active',
		],
	],
	'Fee Assignments': [
		'fee_assignments',
		['application_id', 'fee_structure_id', 'amount_paise'],
	],
	Payments: [
		'payments',
		['assignment_id', 'amount_paise', 'reference', 'mode'],
	],
	'Merit Formula Management': [
		'merit_schemes',
		['title', 'course_id', 'form_type_id', 'formula', 'status'],
	],
	'Merit Formulas': [
		'merit_schemes',
		['title', 'course_id', 'form_type_id', 'formula', 'status'],
	],
	'Calculate Merit': [
		'merit_entries',
		['scheme_id', 'application_id', 'score', 'rank', 'category', 'published'],
	],
	'Merit Entries': [
		'merit_entries',
		['scheme_id', 'application_id', 'score', 'rank', 'category', 'published'],
	],
};
const referenceTables = {
	college_id: 'colleges',
	course_id: 'courses',
	department_id: 'departments',
	form_type_id: 'form_types',
	fee_scheme_id: 'fee_schemes',
};
const excelReferenceColumns = {
	college_id: {
		table: 'colleges',
		matchColumns: ['name', 'code'],
	},
	course_id: {
		table: 'courses',
		matchColumns: ['name', 'code'],
	},
	department_id: {
		table: 'departments',
		matchColumns: ['name', 'code'],
	},
	form_type_id: {
		table: 'form_types',
		matchColumns: ['name', 'code'],
	},
	fee_scheme_id: {
		table: 'fee_schemes',
		matchColumns: ['name'],
	},
};
const excelImportTables = new Set([
	'universities',
	'colleges',
	'courses',
	'branches',
	'academic_years',
	'form_types',
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

function conditionMatches(condition, values) {
	if (!condition?.fieldKey) return true;
	const actual = String(values?.[condition.fieldKey] ?? '');
	const expected = String(condition.value ?? '');
	if (condition.operator === 'not_equals') return actual !== expected;
	if (condition.operator === 'contains') return actual.includes(expected);
	return actual === expected;
}

function AdmissionField({ field, value, onChange, readOnly = false }) {
	const textCase =
		field.textCase || (field.forceUppercase ? 'uppercase' : 'none');
	const applyTextCase = (input) =>
		typeof input === 'string' && textCase === 'uppercase'
			? input.toUpperCase()
			: typeof input === 'string' && textCase === 'lowercase'
				? input.toLowerCase()
				: input;
	const common = {
		name: field.key,
		required: Boolean(field.required),
		placeholder: field.placeholder ?? '',
	};
	const handleChange = (event) => {
		const nextValue =
			event.target.type === 'checkbox'
				? event.target.checked
				: event.target.value;
		onChange(applyTextCase(nextValue));
	};

	if (field.type === 'select')
		return (
			<select {...common} disabled={readOnly} value={applyTextCase(value ?? field.defaultValue ?? '')} onChange={handleChange}>
				<option value="">Select</option>
				{(field.options ?? []).map((option) => (
					<option key={option} value={applyTextCase(option)}>
						{applyTextCase(option)}
					</option>
				))}
			</select>
			);

	if (field.type === 'textarea')
		return (
			<textarea
				{...common}
				rows={4}
				readOnly={readOnly}
				value={applyTextCase(value ?? field.defaultValue ?? '')}
				onChange={handleChange}
			/>
		);

	if (field.type === 'checkbox')
		return (
			<input
				{...common}
				type="checkbox"
				checked={Boolean(value)}
				onChange={handleChange}
			/>
		);
	if (['file', 'photo', 'document'].includes(field.type))
		return (
			<input
				{...common}
				type="file"
				accept={
					field.type === 'photo'
						? 'image/jpeg,image/png'
						: 'application/pdf,image/jpeg,image/png'
				}
			/>
		);

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
	return (
		<input
			{...common}
			type={inputType}
			readOnly={readOnly}
			value={applyTextCase(value ?? field.defaultValue ?? '')}
			onChange={handleChange}
		/>
	);
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
		[referenceOptions, setReferenceOptions] = useState({}),
		[studentApplications, SA] = useState([]),
		[staffRole, SR] = useState(null),
		[staffFacultyId, SF] = useState(null),
		[staffPermissions, setStaffPermissions] = useState([]),
		[staffAccessLoaded, setStaffAccessLoaded] = useState(false),
		[userAllowedModules, setUserAllowedModules] = useState([]),
		[publicPortalVisibility, setPublicPortalVisibility] = useState(null),
		[activePortal, setActivePortal] = useState(
			() => sessionStorage.getItem('svit-active-portal') || '',
		),
		[publicInquiryRoute, setPublicInquiryRoute] = useState(
			window.location.hash === '#/inquiry',
		),
		[auth, A] = useState({ email: '', password: '', full_name: '' }),
		[signup, SU] = useState(false);
	const admin = profile?.role === 'admin';
	const hasPermission = (permission) =>
		admin || staffPermissions.includes(permission);
	const canAccessPage = (name) =>
		admin || staffPermissions.includes(pagePermission(name));
	const idCardOperator = hasPermission('id_cards.manage');
	const canManageIdCards = idCardOperator;
	const canPrepareAdmissions = hasPermission('admissions.prepare');
	const canDecideAdmissions = hasPermission('admissions.manage');
	const canReadAdmissions =
		canPrepareAdmissions ||
		canDecideAdmissions ||
		hasPermission('admissions.read');
	const canManageInquiries = hasPermission('inquiries.manage');
	const canReadInquiries =
		canManageInquiries || hasPermission('inquiries.read');
	const canManageAcademics = hasPermission('academics.manage');
	const canReadAcademics =
		canManageAcademics || hasPermission('academics.read');
	const canReadStudentRoster =
		canReadAcademics && canAccessPage('Student Management');
	const canRecordAttendance = hasPermission('attendance.record');
	const canManageCurrentMaster =
		admin ||
		hasPermission('masters.manage') ||
		(canManageAcademics &&
			['Student Management', 'Faculty', 'Subjects'].includes(page));
	const canReadCurrentMaster =
		admin ||
		(canAccessPage(page) &&
			(page === 'Student Management'
				? canReadStudentRoster
				: page === 'Merit Entries'
					? hasPermission('merit.read') || hasPermission('merit.manage')
					: canReadAcademics || hasPermission('applications.read')));
	const allowedPortals = new Set([
		...(admin ? moduleCards.map((card) => card.id) : []),
		...((userAllowedModules && userAllowedModules.length > 0)
			? userAllowedModules
			: [
				...(moduleById.college_info?.pages?.some(canAccessPage)
					? ['college_info']
					: []),
				...(moduleById.admissions?.pages?.some(canAccessPage)
					? ['admissions']
					: []),
				...(moduleById.timetable?.pages?.some(canAccessPage)
					? ['timetable']
					: []),
				...(moduleById.faculty_leave?.pages?.some(canAccessPage)
					? ['faculty_leave']
					: []),
				...(moduleById.student_management?.pages?.some(canAccessPage)
					? ['student_management']
					: []),
			]),
		...(!staffRole && profile?.role !== 'admin'
			? ['admissions']
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
	}, [page, session, profile, staffRole, staffPermissions]);
	useEffect(() => {
		const onImport = (event) => {
			if (event.detail === table) void refresh();
		};
		window.addEventListener('erp-data-imported', onImport);
		return () => window.removeEventListener('erp-data-imported', onImport);
	}, [table, session, profile]);
	useEffect(() => {
		let cancelled = false;
		async function loadReferences() {
			const keys = [...new Set((fields ?? []).filter((key) => referenceTables[key]))];
			try {
				const entries = await Promise.all(
					keys.map(async (key) => {
						const { data, error } = await supabase
							.from(referenceTables[key])
							.select('id,name')
							.order('name');
						if (error) throw error;
						return [key, data ?? []];
					}),
				);
				if (!cancelled) setReferenceOptions(Object.fromEntries(entries));
			} catch (error) {
				if (!cancelled)
					E(
						error instanceof Error
							? error.message
							: 'Could not load reference records.',
					);
			}
		}
		if (session && profile && fields?.some((key) => referenceTables[key]))
			void loadReferences();
		else setReferenceOptions({});
		return () => {
			cancelled = true;
		};
	}, [page, session, profile, table]);
	useEffect(() => {
		let cancelled = false;
		async function loadStaffAccess() {
			if (!session || !profile || admin) {
				SR(null);
				SF(null);
				setStaffPermissions([]);
				setStaffAccessLoaded(Boolean(profile));
				return;
			}
			setStaffAccessLoaded(false);
			const { data, error } = await supabase.rpc('get_my_staff_access');
			if (cancelled) return;
			if (error) {
				SR(null);
				SF(null);
				setStaffPermissions([]);
				setStaffAccessLoaded(true);
				if (['PGRST202', '42883'].includes(error.code))
					E('Dynamic staff access is not installed. Apply migration 019_dynamic_role_scope_access.sql in Supabase.');
				else if (error.code !== 'PGRST205' && error.code !== '42P01')
					E(error.message);
				return;
			}
			SR(data?.role_code ?? null);
			SF(data?.faculty_id ?? null);
			setStaffPermissions(data?.permissions ?? []);
			setUserAllowedModules(data?.allowed_modules ?? []);
			setStaffAccessLoaded(true);
		}
		void loadStaffAccess();
		return () => {
			cancelled = true;
		};
	}, [session, profile, admin]);
	useEffect(() => {
		supabase
			.from('login_portal_settings')
			.select('id, visible_to_public')
			.then(({ data, error }) => {
				if (!error && data?.length) {
					const vis = Object.fromEntries(
						data.map((item) => [item.id, Boolean(item.visible_to_public)]),
					);
					setPublicPortalVisibility(vis);
				}
			})
			.catch(() => {});
	}, []);
	useEffect(() => {
		if (session && staffAccessLoaded && !activePortal && allowedPortals.size === 1) {
			const onlyPortal = Array.from(allowedPortals)[0];
			choosePortal(onlyPortal);
		}
	}, [session, staffAccessLoaded, activePortal, allowedPortals]);
	useEffect(() => {
		if (!session || !profile || !staffAccessLoaded || admin || !staffRole) return;
		if (staffPermissions.includes(pagePermission(page))) return;
		const firstAllowedPage = moduleById[activePortal]?.pages?.find((name) =>
			staffPermissions.includes(pagePermission(name)),
		);
		if (firstAllowedPage) Q(firstAllowedPage);
	}, [session, profile, staffAccessLoaded, admin, staffRole, staffPermissions, page, activePortal]);
	useEffect(() => {
		if (!session || !profile || !staffAccessLoaded || !activePortal) return;
		if (allowedPortals.has(activePortal)) {
			E('');
			return;
		}
		E(`Your account does not have access to ${moduleById[activePortal]?.title || 'this module'}.`);
		sessionStorage.removeItem('svit-active-portal');
		setActivePortal('');
	}, [session, profile, staffAccessLoaded, activePortal, staffRole, staffFacultyId, allowedPortals]);
	async function refresh() {
		E('');
		if (!supabase) return;
		let t =
			table ||
			(page === 'Applications' || page === 'My Applications'
				? 'applications'
				: page === 'Documents'
					? 'documents'
					: ['Reports', 'Report Builder'].includes(page)
						? 'applications'
						: null);
		if (page === 'Dashboard') {
			const keys = admin
				? ['applications', 'courses', 'branches', 'fee_structures', 'payments']
				: staffRole
					? [
							...(hasPermission('applications.read') ? ['applications'] : []),
							...(canReadAdmissions ? ['inquiry_admissions'] : []),
							...(canReadInquiries ? ['inquiries'] : []),
							...(hasPermission('fees.manage') ? ['payments'] : []),
							...(canReadAcademics ? ['students'] : []),
						]
					: ['applications'];
			try {
				const results = await Promise.allSettled(
					keys.map(async (key) => {
						let query = supabase
							.from(key)
							.select('id', { count: 'exact', head: true });
						if (!admin && !staffRole)
							query = query.eq('student_id', session.user.id);
						const { count, error } = await query;
						if (error) {
							console.error(`Dashboard count failed for ${key}`, error);
							throw { key, error };
						}
						return [key, count ?? 0];
					}),
				);
				const counts = [];
				const failures = [];
				for (const [index, result] of results.entries()) {
					if (result.status === 'fulfilled') {
						counts.push(result.value);
					} else {
						const { key, error: failure } = result.reason ?? {};
						const details = [
							failure?.message,
							failure?.code && `code ${failure.code}`,
							failure?.status && `HTTP ${failure.status}`,
							failure?.statusText,
							failure?.details,
							failure?.hint,
							failure?.name,
						].filter(Boolean);
						let serializedFailure = '';
						if (!details.length && failure != null) {
							try {
								serializedFailure = JSON.stringify(failure);
							} catch {
								serializedFailure = String(failure);
							}
						}
						failures.push(
							`${key || keys[index]}: ${
								details.join(' — ') ||
								serializedFailure ||
								'No error details returned; check the browser Console and Network response.'
							}`,
						);
					}
				}
				T(Object.fromEntries(counts));
				if (failures.length)
					E(
						failures.join(' | '),
					);
			} catch (error) {
				E(error?.message || 'Could not load dashboard.');
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
		const portalPages = moduleById[portalId]?.pages || [];
		const fallbackPage = portalPages.includes('Dashboard')
			? 'Dashboard'
			: (portalPages[0] || 'Dashboard');
		const startPage = admin || !staffRole
			? fallbackPage
			: (portalPages.find((name) =>
					staffPermissions.includes(pagePermission(name)),
				) || fallbackPage);
		Q(startPage);
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
	async function uploadCollegeLogo(file) {
		if (editing === 'new' || !editing || !isUuid(editing)) {
			E('Save the college before uploading its logo.');
			return;
		}
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!allowedTypes.includes(file.type) || file.size > 2 * 1024 * 1024) {
			E('Choose a JPG, PNG, or WebP image no larger than 2 MB.');
			return;
		}
		E('');
		const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const path = `${editing}/${crypto.randomUUID()}-${safeName}`;
		const { error } = await supabase.storage.from('college-logos').upload(path, file, {
			contentType: file.type,
			upsert: false,
		});
		if (error) {
			E(error.message);
			return;
		}
		const { data } = supabase.storage.from('college-logos').getPublicUrl(path);
		F((current) => ({ ...current, logo_url: data.publicUrl }));
		N('Logo uploaded. Save the college record to apply the new logo.');
	}
	async function printPaymentReceipt(payment) {
		const popup = window.open('', '_blank');
		if (!popup) {
			E('Allow pop-ups to print a receipt.');
			return;
		}
		popup.document.write('<p>Preparing receipt…</p>');
		const one = async (tableName, columns, id) => {
			const { data, error } = await supabase
				.from(tableName)
				.select(columns)
				.eq('id', id)
				.maybeSingle();
			if (error) throw error;
			return data;
		};
		const escapeHtml = (value) =>
			String(value ?? '').replace(/[&<>"']/g, (character) => ({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[character]);
		let logoWarning = '';
		try {
			const assignment = await one(
				'fee_assignments',
				'application_id,fee_structure_id',
				payment.assignment_id,
			);
			if (!assignment) throw new Error('The fee assignment for this payment was not found.');
			const application = await one(
				'applications',
				'application_number,student_id',
				assignment.application_id,
			);
			if (!application) throw new Error('The application for this payment was not found.');
			const [student, fee] = await Promise.all([
				one('profiles', 'full_name', application.student_id),
				assignment.fee_structure_id
					? one('fee_structures', 'title,academic_year,course_id', assignment.fee_structure_id)
					: Promise.resolve(null),
			]);
			const course = fee?.course_id
				? await one('courses', 'name,college_id', fee.course_id)
				: null;
			const college = course?.college_id
				? await one('colleges', 'name,logo_url', course.college_id)
				: null;
			let sequence = null;
			if (course?.college_id) {
				let query = supabase
					.from('receipt_sequences')
					.select('course_id,payment_type,show_college_logo')
					.eq('college_id', course.college_id)
					.eq('active', true);
				if (fee?.academic_year) query = query.eq('academic_year', fee.academic_year);
				const { data, error } = await query;
				if (error) throw error;
				const matching = data ?? [];
				sequence =
					matching.find(
						(item) =>
							item.course_id === fee.course_id &&
							item.payment_type.toLowerCase() === String(fee?.title ?? '').toLowerCase(),
					) ??
					matching.find((item) => item.course_id === fee.course_id) ??
					matching.find(
						(item) =>
							item.course_id === null &&
							item.payment_type.toLowerCase() === String(fee?.title ?? '').toLowerCase(),
					) ??
					matching.find((item) => item.course_id === null) ??
					null;
			}
			let logoUrl = '';
			if (sequence?.show_college_logo && college?.logo_url) {
				try {
					const parsed = new URL(college.logo_url, window.location.origin);
					if (['https:', 'http:'].includes(parsed.protocol)) logoUrl = parsed.href;
				} catch {
					logoUrl = '';
					logoWarning = 'The college logo URL is invalid; printing without the logo.';
				}
			}
			popup.document.open();
			popup.document.write(`<!doctype html>
				<html><head><title>Payment receipt ${escapeHtml(payment.reference)}</title>
				<style>
					body{font:15px Arial,sans-serif;color:#172033;margin:36px}
					header{text-align:center;border-bottom:1px solid #ccd4df;padding-bottom:18px}
					header img{display:block;max-width:170px;max-height:90px;object-fit:contain;margin:0 auto 12px}
					h1{font-size:22px;margin:8px 0}table{width:100%;border-collapse:collapse;margin-top:24px}
					th,td{text-align:left;padding:12px;border:1px solid #d7dee8}
					th{width:34%;background:#f3f6fa}.amount{font-size:18px;font-weight:bold}
					@media print{body{margin:15mm}}
				</style></head><body>
				<header>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="College logo">` : ''}
					${college?.name ? `<h2>${escapeHtml(college.name)}</h2>` : ''}
					<h1>Payment Receipt</h1>
				</header>
				<table><tbody>
					<tr><th>Receipt / Payment Reference</th><td>${escapeHtml(payment.reference)}</td></tr>
					<tr><th>Application Number</th><td>${escapeHtml(application.application_number)}</td></tr>
					<tr><th>Student</th><td>${escapeHtml(student?.full_name)}</td></tr>
					<tr><th>Fee</th><td>${escapeHtml(fee?.title)}</td></tr>
					<tr><th>Course</th><td>${escapeHtml(course?.name)}</td></tr>
					<tr><th>Payment Mode</th><td>${escapeHtml(payment.mode)}</td></tr>
					<tr><th>Paid On</th><td>${escapeHtml(payment.recorded_at ? new Date(payment.recorded_at).toLocaleString() : '')}</td></tr>
					<tr><th>Amount</th><td class="amount">${escapeHtml(money(payment.amount_paise))}</td></tr>
				</tbody></table>
				<script>window.addEventListener('load',()=>window.print())</script>
				</body></html>`);
			popup.document.close();
			E(logoWarning);
		} catch (error) {
			popup.close();
			E(error instanceof Error ? error.message : 'Could not prepare the payment receipt.');
		}
	}
	async function save(e) {
		e.preventDefault();
		E('');
		let data = { ...form };
		if (table === 'branches') {
			let heads = data.intake_heads ?? [];
			if (typeof heads === 'string') {
				try {
					heads = JSON.parse(heads);
				} catch {
					E('Intake headings must be valid JSON.');
					return;
				}
			}
			const totalSeats = Number(data.intake);
			const labels = Array.isArray(heads)
				? heads.map((head) => String(head.name ?? '').trim().toLowerCase())
				: [];
			const categorySeats = Array.isArray(heads)
				? heads.reduce((sum, head) => sum + Number(head.seats), 0)
				: Number.NaN;
			if (
				!Array.isArray(heads) ||
				heads.length === 0 ||
				!Number.isInteger(totalSeats) ||
				totalSeats < 0 ||
				heads.some(
					(head) =>
						!String(head.name ?? '').trim() ||
						String(head.seats ?? '').trim() === '' ||
						!Number.isInteger(Number(head.seats)) ||
						Number(head.seats) < 0,
				) ||
				new Set(labels).size !== labels.length
			) {
				E('Enter a unique heading and a whole seat count of zero or more for every intake category.');
				return;
			}
			if (categorySeats > totalSeats) {
				E(`Intake category seats (${categorySeats}) cannot exceed the branch intake (${totalSeats}).`);
				return;
			}
			data.intake_heads = heads.map((head) => ({
				name: String(head.name).trim(),
				seats: Number(head.seats),
			}));
		}
		for (const [k, v] of Object.entries(data)) {
			if (v === '') data[k] = null;
			if (isUuidField(k) && data[k] !== null && !isUuid(v)) {
				E(`${fieldLabel(k)} must be a valid UUID.`);
				return;
			}
			if (
				['fields', 'formula', 'components', 'form_sections', 'intake_heads'].includes(k) &&
				typeof v === 'string'
			) {
				try {
					data[k] = JSON.parse(v);
				} catch {
					E(k + ' must be valid JSON');
					return;
				}
			}
			if (
				[
					'active',
					'published',
					'required',
					'force_uppercase',
					'show_college_logo',
					'enabled_for_students',
					'enable_branch_selection',
				].includes(k)
			)
				data[k] = v === true || v === 'true';
			if (k === 'allowed_admission_types' && typeof v === 'string')
				data[k] = v
					.split(',')
					.map((type) => type.trim())
					.filter(Boolean);
			if (
				[
					'amount_paise',
					'application_fee_paise',
					'intake',
					'intake_capacity',
					'duration_years',
					'display_order',
					'current_sequence',
					'score',
					'rank',
				].includes(k) &&
				data[k] !== null
			)
				data[k] = Number(data[k]);
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
							'file',
							'photo',
							'document',
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
					k === 'intake_heads'
						? (row[k] ?? [])
						: typeof row[k] === 'object' && row[k] !== null
						? JSON.stringify(row[k], null, 2)
						: (row[k] ??
							(k === 'active'
								? true
								: k === 'published'
									? false
									: ['required', 'force_uppercase', 'show_college_logo'].includes(k)
										? false
									: k === 'status'
										? 'draft'
										: k === 'mode'
											? 'cash'
											: k === 'environment'
												? 'test'
												: k === 'current_sequence'
													? 0
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
		E('');
		const formSections = Array.isArray(published.form_sections)
			? published.form_sections
			: [];
		const hiddenSections = new Set(
			formSections
				.filter((section) => !conditionMatches(section.visibility, applicationValues))
				.map((section) => section.id),
		);
		const uploadedPaths = [];
		const answers = {};
		const failWithCleanup = async (message) => {
			if (uploadedPaths.length) {
				const cleanup = await supabase.storage
					.from('student-documents')
					.remove(uploadedPaths);
				if (cleanup.error)
					message += `; uploaded form files could not be cleaned up: ${cleanup.error.message}`;
			}
			E(message);
		};
		for (const f of published.fields) {
			if (
				hiddenSections.has(f.sectionId) ||
				!conditionMatches(f.visibility, applicationValues)
			)
				continue;
			const control = formElement.elements.namedItem(f.key);
			if (!control) {
				await failWithCleanup(`The published form field "${f.label}" is invalid.`);
				return;
			}
			if (['file', 'photo', 'document'].includes(f.type)) {
				const file = control.files?.[0];
				if (!file) {
					if (f.required) {
						await failWithCleanup(`${f.label} is required`);
						return;
					}
					continue;
				}
				const allowedTypes =
					f.type === 'photo'
						? ['image/jpeg', 'image/png']
						: ['application/pdf', 'image/jpeg', 'image/png'];
				if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
					await failWithCleanup(
						`${f.label} must be a PDF, JPG, or PNG file no larger than 5 MB.`,
					);
					return;
				}
				const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
				const path = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
				const { error } = await supabase.storage
					.from('student-documents')
					.upload(path, file, { contentType: file.type, upsert: false });
				if (error) {
					if (uploadedPaths.length) {
						const cleanup = await supabase.storage
							.from('student-documents')
							.remove(uploadedPaths);
						E(
							cleanup.error
								? `${error.message}; previously uploaded form files could not be cleaned up: ${cleanup.error.message}`
								: error.message,
						);
					} else E(error.message);
					return;
				}
				uploadedPaths.push(path);
				answers[f.key] = { storage_path: path, file_name: file.name };
				continue;
			}
			const copyEnabled =
				f.copyFromCheckbox && applicationValues[`${f.key}__copy_enabled`];
			const v =
				f.type === 'checkbox'
					? control.checked
					: copyEnabled && f.copyFromFieldKey
						? applicationValues[f.copyFromFieldKey]
						: String(control.value ?? '');
			if (f.required && (typeof v === 'boolean' ? !v : !String(v).trim())) {
				await failWithCleanup(f.label + ' is required');
				return;
			}
			answers[f.key] =
				f.forceUppercase && typeof v === 'string' ? v.toUpperCase() : v;
		}
		if (published.allowed_admission_types?.length > 1) {
			const admissionType = applicationValues.admission_type;
			if (!admissionType) {
				await failWithCleanup('Select an admission type.');
				return;
			}
			answers.admission_type = admissionType;
		} else if (published.allowed_admission_types?.length === 1) {
			answers.admission_type = published.allowed_admission_types[0];
		}
		if (published.enable_branch_selection) {
			const branchId = applicationValues.branch_id;
			const branches = published.courses?.branches ?? [];
			if (!branchId || !branches.some((branch) => branch.id === branchId)) {
				await failWithCleanup('Select a valid branch.');
				return;
			}
			answers.branch_id = branchId;
		}
		const { error } = await supabase
			.from('applications')
			.insert({ student_id: session.user.id, form_id: published.id, answers });
		if (error) {
			let message = error.message;
			if (uploadedPaths.length) {
				const cleanup = await supabase.storage
					.from('student-documents')
					.remove(uploadedPaths);
				if (cleanup.error)
					message += `; uploaded form files could not be cleaned up: ${cleanup.error.message}`;
			}
			E(message);
			return;
		}
		N('Application submitted');
		setApplicationValues({});
		formElement.reset();
		await refresh();
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
	const [applicationValues, setApplicationValues] = useState({});
	const [inquiryPrefillNotice, setInquiryPrefillNotice] = useState('');
	useEffect(() => {
		if (session && !admin)
			supabase
				.from('admission_forms')
				.select('*,courses(name,branches(id,name,active))')
				.eq('status', 'published')
				.eq('enabled_for_students', true)
				.order('created_at', { ascending: false })
				.limit(1)
				.then(({ data, error }) => {
					if (error) E(error.message);
					else {
						const form = data?.[0] || null;
						B(form);
						setApplicationValues(
							Object.fromEntries(
								(form?.fields ?? []).map((field) => [
									field.key,
									field.defaultValue ?? (field.type === 'checkbox' ? false : ''),
								]),
							),
						);
					}
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
		let cancelled = false;
		async function prefillFromInquiry() {
			if (!session || admin || !published?.id) {
				setInquiryPrefillNotice('');
				return;
			}
			setInquiryPrefillNotice('Checking for an inquiry using your login email...');
			const { data, error } = await supabase.rpc(
				'student_get_my_inquiry_prefill',
			);
			if (cancelled) return;
			if (error) {
				setInquiryPrefillNotice('');
				E(error.message);
				return;
			}
			if (!data) {
				setInquiryPrefillNotice(
					'No inquiry was found for this verified login email. Sign in with the email used on your inquiry.',
				);
				return;
			}
			setApplicationValues((current) => {
				const next = { ...current };
				for (const field of published.fields ?? []) {
					const value = inquiryValueForField(field, data);
					if (value && (next[field.key] == null || next[field.key] === '')) {
						next[field.key] = value;
					}
				}
				if (published.enable_branch_selection && data.branch_interest) {
					const branch = published.courses?.branches?.find(
						(item) =>
							item.active !== false &&
							item.name.trim().toLowerCase() ===
								String(data.branch_interest).trim().toLowerCase(),
					);
					if (branch && !next.branch_id) {
						next.branch_id = branch.id;
					}
				}
				return next;
			});
			setInquiryPrefillNotice(
				`Inquiry found (${data.inquiry_number}). Matching fields were filled where possible; please review them before submitting.`,
			);
		}
		void prefillFromInquiry();
		return () => {
			cancelled = true;
		};
	}, [session, admin, published?.id]);
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
					{session ? (
						<div className="account">
							<span>{profile?.full_name || session.user.email}</span>
							<button type="button" onClick={() => void signOut()}>
								Sign out
							</button>
						</div>
					) : (
						<div className="account">
							<button
								type="button"
								className="primary"
								onClick={() => choosePortal('admissions')}
							>
								🔑 Sign In to Workspace
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
							.filter((card) => {
								if (session) {
									return staffAccessLoaded && allowedPortals.has(card.id);
								}
								if (publicPortalVisibility && publicPortalVisibility[card.id] !== undefined) {
									return publicPortalVisibility[card.id];
								}
								return card.id !== 'super_admin';
							})
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
		? modules.filter(([name]) => name !== 'My Applications')
		: staffRole
			? modules.filter(([name]) => canAccessPage(name))
			: modules.filter(([name]) =>
					['Dashboard', 'My Applications', 'Documents'].includes(name),
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
						{activePortal === 'super_admin' && (
							<>
								<h3>Super Admin Modules</h3>
								<div className="tiles">
									{superAdminModules.map((module) => (
										<button
											key={module.title}
											type="button"
											className="tile"
											onClick={() => Q(module.entryPage)}
										>
											<span>{module.icon}</span>
											<b>{module.title}</b>
											<small>{module.description}</small>
										</button>
									))}
								</div>
							</>
						)}
						<h3>
							{activePortal === 'super_admin'
								? 'Administration Tools'
								: 'Quick Management Access'}
						</h3>
						<div className="tiles">
							{nav
								.filter(([n]) => n !== 'Dashboard')
								.filter(
									([name]) =>
										activePortal !== 'super_admin' ||
										!superAdminModulePages.has(name),
								)
								.map(([n, i]) => (
									<button key={n} className="tile" onClick={() => Q(n)}>
										<span>{i}</span>
										<b>{n}</b>
										<small>Open module →</small>
									</button>
								))}
						</div>
					</>
				) : page === 'Report Builder' &&
				  canAccessPage('Report Builder') &&
				  (admin || hasPermission('reports.read')) ? (
					<Suspense fallback={<section className="panel">Loading report builder...</section>}>
						<ReportBuilder
							tables={meta}
							canManage={admin || hasPermission('reports.manage')}
						/>
					</Suspense>
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
					</section>
				) : page === 'Inquiry Forms' && admin ? (
					<Suspense fallback={<section className="panel">Loading inquiry form builder...</section>}>
						<InquiryFormBuilder />
					</Suspense>
				) : page === 'Inquiries' && canReadInquiries ? (
					<Suspense fallback={<section className="panel">Loading inquiries...</section>}>
						<InquiryDashboard canManage={canManageInquiries} />
					</Suspense>
				) : page === 'Documentation' && admin ? (
					<section className="panel admin-guide">
						<div className="panelhead">
							<div>
								<small>SVIT ERP · ADMINISTRATION</small>
								<h2>Admin User Guide</h2>
								<p>
									For system administrators configuring and maintaining the
									university admission workspace.
								</p>
							</div>
							<button type="button" onClick={() => Q('Dashboard')}>← Back</button>
						</div>
						<nav aria-label="Guide contents" className="admin-guide-index">
							<a href="#guide-users">User Management</a>
							<a href="#guide-academics">Universities, Colleges &amp; Courses</a>
							<a href="#guide-inquiries">Inquiry Forms</a>
							<a href="#guide-admissions">Admission Form Builder</a>
							<a href="#guide-fees">Fees &amp; Payments</a>
							<a href="#guide-reports">Report Builder</a>
							<a href="#guide-limits">System limitations</a>
						</nav>
						<article className="admin-guide-content">
							<p>
								This guide covers the available administration screens. Access
								is controlled by the signed-in account and its module
								permissions.
							</p>
							<section id="guide-users">
								<h2>1. User Management</h2>
								<h3>Creating and managing users</h3>
								<ol>
									<li>Open <b>Manage Users</b> from the workspace navigation.</li>
									<li>Choose the user action available on that screen and enter the account details.</li>
									<li>Assign only the role and module access needed for that user.</li>
									<li>Review the account before saving; access controls apply to data as well as navigation.</li>
								</ol>
							</section>
							<section id="guide-academics">
								<h2>2. Universities, Colleges &amp; Courses</h2>
								<ol>
									<li>Add universities and colleges under the admission administration module.</li>
									<li>Enter college names and codes, then add courses and branches linked to the correct college.</li>
									<li>Set branch intake values. Course intake is refreshed from its branch intake totals.</li>
									<li>Configure academic years and form types before creating admission forms.</li>
								</ol>
							</section>
							<section id="guide-inquiries">
								<h2>3. Inquiry Forms</h2>
								<ol>
									<li>Open <b>Inquiry Forms</b> and enter a form name, optional academic year, URL slug, and description.</li>
									<li>Add sections, then choose <b>Add Field</b> to define each field and its validation/display options.</li>
									<li>Link a field to the student profile schema when it should reuse a configured profile field.</li>
									<li>Preview the form and save it. Existing forms can be edited or deleted from the side list.</li>
								</ol>
								<p>The form builder stores its configuration. Public inquiry submission still uses the standard inquiry endpoint.</p>
							</section>
							<section id="guide-admissions">
								<h2>4. Admission Form Builder</h2>
								<ol>
									<li>Open <b>Dynamic Forms</b> and create a form draft for the appropriate academic year, course, college, and form type.</li>
									<li>Add sections and fields, set required rules, and link fields to the student profile schema where appropriate.</li>
									<li>Preview and save the form. Publish only after reviewing the student-facing form.</li>
								</ol>
							</section>
							<section id="guide-fees">
								<h2>5. Fees &amp; Payments</h2>
								<ol>
									<li>Set up fee schemes and fee structures for the relevant course and academic year.</li>
									<li>Review student fee assignments and payment records from their respective modules.</li>
									<li>Receipt sequence settings are configuration only and do not themselves generate receipt numbers.</li>
								</ol>
							</section>
							<section id="guide-reports">
								<h2>6. Report Builder</h2>
								<ol>
									<li>Select an available base table in <b>Setup &amp; Guide</b>.</li>
									<li>Choose the columns in Schema Explorer, enter a template name, and select the roles allowed to use the template.</li>
									<li>Set custom column labels, save the template, and preview the records visible to your account.</li>
									<li>Export the preview as CSV. Access to rows continues to follow Supabase row-level policies.</li>
								</ol>
							</section>
							<section id="guide-limits">
								<h2>7. System limitations &amp; setup</h2>
								<ul>
									<li>Payment gateway records store non-secret metadata only; gateway processing is not enabled here.</li>
									<li>Merit schemes and merit entries can be maintained, but scores are not automatically calculated or ranked.</li>
									<li>Bus QR settings store route and URL configuration only; booking or QR generation is not enabled.</li>
									<li>Apply Supabase migrations in numerical order and review <code>docs/ERP_SETUP.md</code> before enabling modules.</li>
								</ul>
							</section>
						</article>
					</section>
				) : page === 'Config Guide' && admin ? (
					<section className="panel">
						<h2>Configuration Guide</h2>
						<ol>
							<li>Set up universities, colleges, courses, and branches.</li>
							<li>Configure the academic year and form types.</li>
							<li>Build and publish admission forms in Dynamic Forms.</li>
							<li>Configure fee structures and fee schemes as needed.</li>
							<li>
								Review sequence, gateway, and bus QR settings; these do not
								enable external integrations.
							</li>
							<li>Configure merit schemes and manage merit entries manually.</li>
						</ol>
					</section>
				) : (page === 'Timetable Dashboard' || (page === 'Dashboard' && activePortal === 'timetable')) && canReadAcademics ? (
					<Suspense fallback={<section className="panel">Loading timetable dashboard...</section>}>
						<TimetableDashboard onNavigate={Q} canManage={canManageAcademics} />
					</Suspense>
				) : (page === 'Leave Dashboard' || (page === 'Dashboard' && activePortal === 'faculty_leave')) && (canReadAcademics || staffRole === 'faculty') ? (
					<Suspense fallback={<section className="panel">Loading leave dashboard...</section>}>
						<LeaveDashboard onNavigate={Q} canManage={canManageAcademics} userRole={staffRole} />
					</Suspense>
				) : page === 'Notice Board' ? (
					<Suspense fallback={<section className="panel">Loading notice board...</section>}>
						<NoticeBoard canManage={canManageInquiries || admin} isAdmin={admin} userRole={staffRole} />
					</Suspense>
				) : page === 'Student Management' && (admin || canReadStudentRoster) ? (
					<Suspense fallback={<section className="panel">Loading student management...</section>}>
						<StudentManagement canManage={canManageAcademics} onNavigate={Q} />
					</Suspense>
				) : page === 'College Timing' && canReadAcademics ? (
					<Suspense fallback={<section className="panel">Loading college timings...</section>}><CollegeTiming canManage={canManageAcademics} /></Suspense>
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
								<form
									onSubmit={apply}
									className={`admission-application-form application-layout-${published.form_layout || 'cards'}`}
								>
									{inquiryPrefillNotice && (
										<p className="hint" role="status">
											{inquiryPrefillNotice}
										</p>
									)}
									{published.show_college_logo && published.college_logo_url && (
										<img
											className="admission-college-logo"
											src={published.college_logo_url}
											alt="College logo"
										/>
									)}
									<h3>{published.title}</h3>
									{published.description && <p>{published.description}</p>}
									<div className="admission-form-meta">
										{published.course_id && (
											<span>
												Course: {published.courses?.name || 'Selected course'}
											</span>
										)}
										{published.academic_year && <span>Admission Cycle: {published.academic_year}</span>}
										{Number(published.application_fee_paise) > 0 && (
											<span>Application Form Fee: {money(published.application_fee_paise)}</span>
										)}
									</div>
									{published.allowed_admission_types?.length > 1 && (
										<label className="admission-field">
											<span>Admission Type *</span>
											<select
												name="__admission_type"
												required
												value={applicationValues.admission_type ?? ''}
												onChange={(event) =>
													setApplicationValues((current) => ({
														...current,
														admission_type: event.target.value,
													}))
												}
											>
												<option value="">Select admission type</option>
												{published.allowed_admission_types.map((type) => (
													<option key={type} value={type}>{type}</option>
												))}
											</select>
										</label>
									)}
									{published.enable_branch_selection && (
										<label className="admission-field">
											<span>Branch *</span>
											<select
												name="__branch_id"
												required
												value={applicationValues.branch_id ?? ''}
												onChange={(event) =>
													setApplicationValues((current) => ({
														...current,
														branch_id: event.target.value,
													}))
												}
											>
												<option value="">Select branch</option>
												{(published.courses?.branches ?? [])
													.filter((branch) => branch.active !== false)
													.map((branch) => (
														<option key={branch.id} value={branch.id}>{branch.name}</option>
													))}
											</select>
										</label>
									)}
									{published.form_layout === 'tabs' && (
										<nav className="admission-section-tabs" aria-label="Form sections">
											{(published.form_sections ?? []).map((section) => (
												<a key={section.id} href={`#admission-section-${section.id}`}>
													{section.title}
												</a>
											))}
										</nav>
									)}
									{(Array.isArray(published.form_sections) && published.form_sections.length
										? published.form_sections
										: [{ id: 'general', title: 'General', layout: 'columns' }]
									)
										.filter((section) => conditionMatches(section.visibility, applicationValues))
										.map((section) => (
											<section
												className={`admission-form-section ${published.form_layout === 'simple' ? 'section-simple' : 'section-card'}`}
												id={`admission-section-${section.id}`}
												key={section.id}
											>
												<h4>{section.title}</h4>
												<div className={`admission-form-fields ${section.layout === 'vertical' ? 'fields-vertical' : ''}`}>
													{(published.fields ?? [])
														.filter(
															(field) =>
																(field.sectionId || 'general') === section.id &&
																conditionMatches(field.visibility, applicationValues),
														)
														.map((field) => (
																<div
																className={`admission-field field-width-${field.width || 'full'}`}
																key={field.key}
															>
																<span>
																	{field.label}
																	{field.required && ' *'}
																</span>
																<AdmissionField
																	field={field}
																		value={
																			field.copyFromCheckbox &&
																			applicationValues[`${field.key}__copy_enabled`]
																				? applicationValues[field.copyFromFieldKey]
																				: applicationValues[field.key]
																		}
																		readOnly={
																			field.copyFromCheckbox &&
																			Boolean(applicationValues[`${field.key}__copy_enabled`])
																		}
																		onChange={(value) =>
																		setApplicationValues((current) => ({
																			...current,
																			[field.key]: value,
																		}))
																	}
																/>
																{field.copyFromCheckbox && field.copyFromFieldKey && (
																	<label className="admission-copy-from">
																		<input
																			type="checkbox"
																			checked={Boolean(applicationValues[`${field.key}__copy_enabled`])}
																			onChange={(event) =>
																				setApplicationValues((current) => ({
																					...current,
																					[`${field.key}__copy_enabled`]: event.target.checked,
																					...(event.target.checked
																						? { [field.key]: current[field.copyFromFieldKey] ?? '' }
																						: {}),
																				}))
																			}
																		/>
																		Copy from {published.fields.find((item) => item.key === field.copyFromFieldKey)?.label || 'selected field'}
																	</label>
																)}
															</div>
														))}
												</div>
											</section>
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
						{page === 'Calculate Merit' && (
							<p className="hint">
								This screen manages saved merit entries. Automatic formula
								calculation and ranking are not implemented.
							</p>
						)}
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
				) : ['Form Builder', 'Dynamic Forms'].includes(page) && admin ? (
					<Suspense fallback={<section className="panel">Loading Form Builder...</section>}>
						<FormBuilderErrorBoundary>
							<DynamicFormBuilder />
						</FormBuilderErrorBoundary>
					</Suspense>
				) : page === 'Student Profile Schema' && admin ? (
					<Suspense fallback={<section className="panel">Loading Student Profile Schema...</section>}>
						<StudentProfileSchema />
					</Suspense>
				) : ['User Management', 'Manage Users'].includes(page) && admin ? (
					<Suspense fallback={<section className="panel">Loading staff management...</section>}>
						<UserManagement />
					</Suspense>
				) : page === 'ID Cards' && canManageIdCards ? (
					<Suspense fallback={<section className="panel">Loading ID Cards...</section>}>
						<SmartIdCards />
					</Suspense>
				) : page === 'Workbook Data' && admin ? (
					<Suspense fallback={<section className="panel">Loading workbook manager...</section>}>
						<WorkbookManager />
					</Suspense>
				) : ['Receipt Sequence Management', 'Receipt Sequences'].includes(page) && admin ? (
					<Suspense fallback={<section className="panel">Loading receipt sequences...</section>}>
						<ReceiptSequenceManager />
					</Suspense>
				) : page === 'Final Admissions' && canReadAdmissions ? (
					<Suspense fallback={<section className="panel">Loading admissions...</section>}>
						<InquiryAdmissions
							canPrepare={canPrepareAdmissions || canDecideAdmissions}
							canDecide={canDecideAdmissions}
							canManageIntakes={hasPermission('intakes.manage')}
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
												referenceColumns={excelReferenceColumns}
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
										{k === 'intake_capacity'
											? 'Intake Capacity (total of branch intakes)'
											: k === 'intake_heads'
												? 'Government Intake Headings & Seats'
												: k === 'intake' && page === 'Branches'
													? 'Total Branch Intake (Government Sanctioned)'
											: k.replaceAll('_', ' ')}
										{page === 'Branches' && k === 'intake_heads' ? (
											<div className="branch-intake-heads">
												<p>
													Add government quota headings and seat counts. Category
													seats cannot exceed this branch's total intake.
												</p>
												{(Array.isArray(form.intake_heads) ? form.intake_heads : []).map(
													(head, index) => (
														<div className="branch-intake-head-row" key={index}>
															<input
																aria-label={`Intake heading ${index + 1}`}
																placeholder="e.g. ACPC / Management / TFWS"
																maxLength={80}
																value={head.name ?? ''}
																onChange={(event) =>
																	F({
																		...form,
																		intake_heads: form.intake_heads.map((item, itemIndex) =>
																			itemIndex === index
																				? { ...item, name: event.target.value }
																				: item,
																		),
																	})
																}
															/>
															<input
																aria-label={`Seats for intake heading ${index + 1}`}
																type="number"
																min="0"
																step="1"
																placeholder="Seats"
																value={head.seats ?? ''}
																onChange={(event) =>
																	F({
																		...form,
																		intake_heads: form.intake_heads.map((item, itemIndex) =>
																			itemIndex === index
																				? { ...item, seats: event.target.value }
																				: item,
																		),
																	})
																}
															/>
															<button
																type="button"
																className="danger"
																onClick={() =>
																	F({
																		...form,
																		intake_heads: form.intake_heads.filter(
																			(_, itemIndex) => itemIndex !== index,
																		),
																	})
																}
															>
																Remove
															</button>
														</div>
													),
												)}
												<button
													type="button"
													onClick={() =>
														F({
															...form,
															intake_heads: [
																...(Array.isArray(form.intake_heads) ? form.intake_heads : []),
																{ name: '', seats: '' },
															],
														})
													}
												>
													+ Add intake heading
												</button>
												<small>
													Allocated: {(form.intake_heads ?? []).reduce(
														(total, head) => total + (Number(head.seats) || 0),
														0,
													)} / {Number(form.intake) || 0} seats
												</small>
											</div>
										) : page === 'Colleges' && k === 'logo_url' ? (
											<>
												<input
													type="url"
													value={form[k] ?? ''}
													onChange={(e) => F({ ...form, [k]: e.target.value })}
													placeholder="Uploaded logo URL"
												/>
												<input
													type="file"
													accept="image/png,image/jpeg,image/webp"
													disabled={editing === 'new'}
													aria-label="Upload college logo"
													onChange={(event) => {
														const file = event.target.files?.[0];
														event.target.value = '';
														if (file) void uploadCollegeLogo(file);
													}}
												/>
												{editing === 'new' && (
													<small>Save this college first, then upload its logo.</small>
												)}
												{form[k] && (
													<img
														className="college-logo-editor-preview"
														src={form[k]}
														alt="College logo preview"
													/>
												)}
											</>
										) : referenceTables[k] ? (
											<select
												value={form[k] ?? ''}
												onChange={(e) => F({ ...form, [k]: e.target.value })}
											>
												<option value="">Select</option>
												{(referenceOptions[k] ?? []).map((option) => (
													<option key={option.id} value={option.id}>
														{option.name}
													</option>
												))}
											</select>
										) : [
												'active',
												'published',
												'required',
												'force_uppercase',
												'show_college_logo',
												'status',
												'mode',
												'environment',
											].includes(k) ? (
											<select
												value={String(
													form[k] ?? ['active', 'published'].includes(k),
												)}
												onChange={(e) => F({ ...form, [k]: e.target.value })}
											>
												{[
													'active',
													'published',
													'required',
													'force_uppercase',
													'show_college_logo',
												].includes(k) ? (
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
												) : k === 'environment' ? (
													<>
														<option value="test">Test</option>
														<option value="production">Production</option>
													</>
												) : (
													<>
														<option value="draft">Draft</option>
														<option value="published">Published</option>
													</>
												)}
											</select>
										) : ['fields', 'formula', 'components', 'description'].includes(k) ? (
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
																	'intake_capacity',
																	'duration_years',
																	'display_order',
																	'current_sequence',
																	'score',
																	'rank',
															  ].includes(k)
															? 'number'
															: 'text'
												}
												readOnly={
													table === 'courses' && k === 'intake_capacity'
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
														: f === 'intake_heads' && Array.isArray(x[f])
															? x[f].map((head) => `${head.name}: ${head.seats}`).join(', ') || '—'
														: referenceTables[f]
															? (referenceOptions[f] ?? []).find(
																	(option) => option.id === x[f],
																)?.name ?? '\u2014'
														: typeof x[f] === 'object'
															? JSON.stringify(x[f]).slice(0, 90)
															: String(x[f] ?? '\u2014')}
												</td>
											))}
											{canManageCurrentMaster && (
												<td>
													{page === 'Payments' && (
														<button type="button" onClick={() => void printPaymentReceipt(x)}>
															Print Receipt
														</button>
													)}{' '}
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
