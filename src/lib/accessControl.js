import { erpModules } from './erpModules.js';

export const accessPages = [
	'Dashboard',
	'Universities',
	'Colleges',
	'Courses',
	'Branches',
	'Fee Structures',
	'Report Builder',
	'Faculty',
	'Designation',
	'Student Management',
	'Subjects',
	'Timetable Dashboard',
	'Timetable Management',
	'College Timing',
	'Leave Dashboard',
	'Leave Management',
	'Attendance',
	'Inquiries',
	'Notice Board',
	'ID Cards',
	'Final Admissions',
	'Applications',
	'Documents',
	'Fee Assignments',
	'Payments',
	'Merit Entries',
	'Reports',
];

export const accessPermissions = [
	['users.manage', 'Manage users and roles'],
	['masters.manage', 'Manage master data'],
	['applications.read', 'Read applications'],
	['applications.create', 'Create applications'],
	['applications.review', 'Review applications'],
	['fees.manage', 'Manage fees and payments'],
	['id_cards.manage', 'Manage ID cards'],
	['merit.manage', 'Manage merit'],
	['merit.read', 'Read merit'],
	['reports.read', 'View reports'],
	['reports.manage', 'Manage report templates'],
	['admissions.read', 'Read final admissions'],
	['admissions.prepare', 'Prepare final admissions'],
	['admissions.manage', 'Decide final admissions'],
	['intakes.manage', 'Manage quota intake allocations'],
	['inquiries.read', 'Read inquiries'],
	['inquiries.manage', 'Manage inquiries'],
	['academics.read', 'Read academics'],
	['academics.manage', 'Manage academics'],
	['attendance.record', 'Record attendance'],
	['modules.manage', 'Manage the module registry and the permissions'],
	['settings.manage', 'Manage the system configuration'],
	['audit.read', 'Read the audit trail'],
	['accounts.read', 'Read the finance records'],
	['accounts.manage', 'Manage the finance records'],
	['accounts.approve', 'Approve a finance voucher'],
	['transport.read', 'Read the transport records'],
	['transport.manage', 'Manage the transport records'],
	['attendance.read', 'Read the attendance records'],
	['attendance.approve', 'Approve an attendance regularisation'],
	['examinations.read', 'Read the examination records'],
	['examinations.manage', 'Manage the examination records'],
	['examinations.publish', 'Publish the examination results'],
	['departments.read', 'Read the department records'],
	['departments.manage', 'Manage the department records'],
	['hr.read', 'Read the human resource records'],
	['hr.manage', 'Manage the human resource records'],
	['payroll.read', 'Read the payroll records'],
	['payroll.manage', 'Manage the payroll records'],
	['library.read', 'Read the library records'],
	['library.manage', 'Manage the library records'],
	['hostel.read', 'Read the hostel records'],
	['hostel.manage', 'Manage the hostel records'],
	['communication.read', 'Read the communication records'],
	['communication.manage', 'Manage the communication records'],
	['parents.read', 'Read the guardian records'],
	['parents.manage', 'Manage the guardian records'],
	['inventory.read', 'Read the inventory records'],
	['inventory.manage', 'Manage the inventory records'],
	['inventory.purchase', 'Manage the purchase orders'],
	['placement.read', 'Read the placement records'],
	['placement.manage', 'Manage the placement records'],
	['training.manage', 'Manage the training programmes'],
	['certificates.read', 'Read the certificate records'],
	['certificates.manage', 'Manage the certificate records'],
	['certificates.issue', 'Issue a certificate'],
	['website.read', 'Read the website records'],
	['website.manage', 'Manage the website records'],
	['website.publish', 'Publish a website page or post'],
	['helpdesk.read', 'Read the helpdesk records'],
	['helpdesk.manage', 'Manage the helpdesk records'],
	['helpdesk.respond', 'Respond to a helpdesk ticket'],
];

export const pagePermission = (page) => `page:${page}`;

// The ERP modules bring their own pages. They are derived from the module
// registry so that a new module appears in the navigation automatically.
const erpPageIcons = {
	'Super Admin Dashboard': '\u{1F6E0}\uFE0F',
	'Accounts Dashboard': '\u{1F4B0}',
	'Transport Dashboard': '\u{1F68C}',
	'Academic Dashboard': '\u{1F4DA}',
	'Attendance Dashboard': '\u2705',
	'Examination Dashboard': '\u{1F9EE}',
	'Department Dashboard': '\u{1F3DB}\uFE0F',
	'HR Dashboard': '\u{1F9D1}\u200D\u{1F4BC}',
	'Library Dashboard': '\u{1F4D6}',
	'Hostel Dashboard': '\u{1F3E0}',
	'Communication Dashboard': '\u{1F4E8}',
	'Parent Dashboard': '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
	'Student Portal': '\u{1F393}',
	'Inventory Dashboard': '\u{1F4E6}',
	'Placement Dashboard': '\u{1F3AF}',
	'Certificate Dashboard': '\u{1F4DC}',
	'Website Dashboard': '\u{1F310}',
	'Helpdesk Dashboard': '\u{1F3A7}',
	'Analytics Dashboard': '\u{1F4C8}',
	'Configuration Dashboard': '\u2699\uFE0F',
};

const legacyPages = [
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
	['Designation', '\u{1F4BC}'],
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
	['Lateral Entry Intake', '\u{1F4CB}'],
	['Intake Report', '\u{1F4CA}'],
	['My Applications', '\u{1F464}'],
	['Workbook Data', '\u{1F4D1}'],
];

// The pages that the ERP modules bring. A page that already exists in the
// legacy navigation keeps its legacy screen, so the admission, faculty,
// timetable and ID card screens stay exactly as they are.
const erpModulePages = erpModules.map((module) => ({
	moduleId: module.id,
	portal: module.portal,
	icon: module.icon ?? '\u{1F4CB}',
	pages: [
		module.entryPage,
		...(module.tables ?? []).map((table) => table.title),
	],
}));

const erpDerivedPages = [];
for (const entry of erpModulePages) {
	for (const page of entry.pages) {
		if (legacyPages.some(([name]) => name === page)) continue;
		if (erpDerivedPages.some(([name]) => name === page)) continue;
		erpDerivedPages.push([page, erpPageIcons[page] ?? entry.icon]);
	}
}

// Every page that exists in the ERP navigation. A login module must point at
// one of these pages so that it can never open a dashboard that is missing.
export const existingPages = [...legacyPages, ...erpDerivedPages];


export const existingPageNames = existingPages.map(([name]) => name);

// The pages of the original ERP. A page that already exists here keeps its
// legacy screen, so the existing admission, faculty, timetable and ID card
// screens are never replaced by a module screen.
export const legacyPageNames = legacyPages.map(([name]) => name);

// The dashboard routes (workspaces) that already exist in the ERP. Login
// modules reuse these routes, no new dashboard is generated.
export const existingDashboardRoutes = [
	{
		id: 'college_info',
		title: 'College information',
		description:
			'Users, Universities, Colleges, Courses, Branches, Calendar & Faculty',
		icon: '\u{1F3DB}\uFE0F',
		badge: 'Administrative',
		pages: [
			'Manage Users',
			'Universities',
			'Colleges',
			'Courses',
			'Branches',
			'Academic Calendar',
			'Designation',
			'Faculty',
		],
	},
	{
		id: 'admissions',
		title: 'New Admission Student management',
		description:
			'Inquiries, Admission Forms, Sequences, Fees, Merit, Reports & Notice Board',
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
			'Lateral Entry Intake',
			'Intake Report',
		],
	},
	{
		id: 'timetable',
		title: 'Time table',
		description:
			'Timetable Dashboard, Subjects, Timetable Management & College Timing',
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
		description:
			'Daily Leave & Proxy Dashboard, Approval by Post (HOD/Principal/Chairman) & Docs',
		icon: '\u{1F334}',
		badge: 'Faculty Portal',
		pages: ['Leave Dashboard', 'Leave Management'],
	},
	{
		id: 'student_management',
		title: 'Student Management',
		description:
			'Admission Year Student Data (ID & Enrollment Wise), Attendance & ID Cards',
		icon: '\u{1F9D1}\u200D\u{1F393}',
		badge: 'Student Records',
		pages: ['Student Management', 'Attendance', 'ID Cards'],
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

// The portals of the 25 ERP modules that do not have a dashboard route yet.
const knownPortals = new Set(existingDashboardRoutes.map((route) => route.id));
const erpPortalRoutes = [];
for (const module of erpModules) {
	if (knownPortals.has(module.portal)) continue;
	knownPortals.add(module.portal);
	const siblings = erpModules.filter((entry) => entry.portal === module.portal);
	const pages = new Set();
	for (const sibling of siblings) {
		pages.add(sibling.entryPage);
		for (const table of sibling.tables ?? []) pages.add(table.title);
	}
	erpPortalRoutes.push({
		id: module.portal,
		title: module.title,
		description: module.description,
		icon: module.icon ?? '\u{1F4CB}',
		badge: `${siblings.length} module${siblings.length === 1 ? '' : 's'}`,
		pages: Array.from(pages),
	});
}

existingDashboardRoutes.push(...erpPortalRoutes);

// Every portal also lists the pages of the ERP modules that belong to it, so
// that one navigation serves the legacy screens and the module screens.
for (const route of existingDashboardRoutes) {
	if (!route.pages) continue;
	const pages = new Set(route.pages);
	for (const entry of erpModulePages) {
		if (entry.portal !== route.id) continue;
		for (const page of entry.pages) pages.add(page);
	}
	route.pages = Array.from(pages);
}



export const availableModulePortals = existingDashboardRoutes.map((route) => ({
	id: route.id,
	title: route.title,
	icon: route.icon,
}));

export const emptyStaffForm = {
	full_name: '',
	email: '',
	role_code: 'data_entry',
	department_id: '',
	faculty_id: '',
	active: true,
	scope_all: false,
	college_scope_ids: [],
	department_scope_ids: [],
	course_scope_ids: [],
	allowed_modules: [],
};
