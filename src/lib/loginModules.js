// The login modules that the ERP ships with.
//
// The database table public.login_modules (migration
// 034_dynamic_login_modules.sql) is the source of truth: an administrator can
// rename, reorder, enable, disable and restrict every module from the Manage
// Users screen. The list below is only the built-in fallback that keeps the
// login page usable while that table has not been created in the connected
// database yet. It mirrors the rows that migration 034 seeds.
export const defaultLoginModules = [
	{
		id: 'admin',
		name: 'Admin',
		description: 'Full ERP control, all modules, users and security',
		icon: '\u{1F6E0}\uFE0F',
		portal_id: 'super_admin',
		entry_page: 'Dashboard',
		display_order: 1,
		enabled: true,
		allowed_roles: ['admin'],
	},
	{
		id: 'faculty',
		name: 'Faculty',
		description: 'Faculty leave, proxy, timetable and attendance workspace',
		icon: '\u{1F9D1}\u200D\u{1F3EB}',
		portal_id: 'faculty_leave',
		entry_page: 'Leave Dashboard',
		display_order: 2,
		enabled: true,
		allowed_roles: ['faculty'],
	},
	{
		id: 'student',
		name: 'Student',
		description: 'Admission application, submitted forms and documents',
		icon: '\u{1F9D1}\u200D\u{1F393}',
		portal_id: 'admissions',
		entry_page: 'My Applications',
		display_order: 3,
		enabled: true,
		allowed_roles: ['student'],
	},
	{
		id: 'hod',
		name: 'HOD',
		description: 'Department students, attendance and approvals',
		icon: '\u{1F3DB}\uFE0F',
		portal_id: 'student_management',
		entry_page: 'Student Management',
		display_order: 4,
		enabled: true,
		allowed_roles: ['department_head'],
	},
	{
		id: 'admission_staff',
		name: 'Admission Staff',
		description: 'Inquiries, final admissions and application review',
		icon: '\u{1F5C2}\uFE0F',
		portal_id: 'admissions',
		entry_page: 'Inquiries',
		display_order: 5,
		enabled: true,
		allowed_roles: ['authority', 'data_entry', 'admission_staff'],
	},
	{
		id: 'accountant',
		name: 'Accountant',
		description: 'Fee structures, fee assignments and payments',
		icon: '\u{1F4B0}',
		portal_id: 'admissions',
		entry_page: 'Payments',
		display_order: 6,
		enabled: true,
		allowed_roles: ['fees_collection', 'accountant'],
	},
	{
		id: 'library_staff',
		name: 'Library Staff',
		description: 'Faculty records, subjects and library desk',
		icon: '\u{1F4DA}',
		portal_id: 'college_info',
		entry_page: 'Faculty',
		display_order: 7,
		enabled: true,
		allowed_roles: ['library_staff'],
	},
	{
		id: 'examination_cell',
		name: 'Examination Cell',
		description: 'Applications, merit entries and result reports',
		icon: '\u{1F9EE}',
		portal_id: 'admissions',
		entry_page: 'Reports',
		display_order: 8,
		enabled: true,
		allowed_roles: ['examination_cell'],
	},
];

// PostgREST and Postgres report a missing table or function with these codes.
const missingObjectCodes = [
	'PGRST205', // table not found in the schema cache
	'PGRST202', // function not found in the schema cache
	'PGRST204', // column not found
	'42P01', // undefined_table
	'42883', // undefined_function
	'404', // the endpoint itself is missing
];

// True when the database does not have the login module table or functions
// yet, which means migration 034 has not been applied.
export function isLoginModuleSetupMissing(error) {
	if (!error) return false;
	const code = String(error.code ?? '');
	if (missingObjectCodes.includes(code)) return true;
	const status = Number(error.status ?? 0);
	if (status === 404) return true;
	return /does not exist|not found|schema cache/i.test(
		String(error.message ?? ''),
	);
}
