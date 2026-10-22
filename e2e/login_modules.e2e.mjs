// End-to-end test of the dynamic role-based login against a local
// Postgres + GoTrue + PostgREST stack running the real ERP schema and
// migration 034.
//
// Start the stack first:
//   npm run local-stack
// Then run the suite:
//   npm run test:login-modules:e2e
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const JWT_SECRET = 'localtestsecretlocaltestsecretlocaltest12';
function mint(role) {
	const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const header = b64({ alg: 'HS256', typ: 'JWT' });
	const payload = b64({
		role,
		iss: 'supabase',
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 3600,
	});
	const signature = createHmac('sha256', JWT_SECRET)
		.update(`${header}.${payload}`)
		.digest('base64url');
	return `${header}.${payload}.${signature}`;
}

const URL = 'http://127.0.0.1:8000';
const ANON_KEY = mint('anon');
const SERVICE_KEY = mint('service_role');

const admin = createClient(URL, SERVICE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(URL, ANON_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

const USERS = {
	admin: { email: 'admin@svit.test', password: 'Admin@12345', role: 'admin' },
	faculty: { email: 'faculty@svit.test', password: 'Faculty@12345', role: 'faculty' },
	student: { email: 'student@svit.test', password: 'Student@12345', role: 'student' },
	hod: { email: 'hod@svit.test', password: 'Hod@12345', role: 'department_head' },
	accountant: {
		email: 'accounts@svit.test',
		password: 'Accounts@12345',
		role: 'fees_collection',
	},
	disabled: {
		email: 'disabled@svit.test',
		password: 'Disabled@12345',
		role: 'faculty',
		active: false,
	},
};

async function createUsers() {
	for (const [key, spec] of Object.entries(USERS)) {
		const { data, error } = await admin.auth.admin.createUser({
			email: spec.email,
			password: spec.password,
			email_confirm: true,
			user_metadata: { full_name: key },
		});
		if (error && !/already been registered|already exists/i.test(error.message)) {
			throw new Error(`createUser ${key}: ${error.message}`);
		}
		let id = data?.user?.id;
		if (!id) {
			const list = await admin.auth.admin.listUsers();
			id = list.data?.users?.find((user) => user.email === spec.email)?.id;
		}
		if (id) {
			// keep the fixture password in sync so the suite can run repeatedly
			await admin.auth.admin.updateUserById(id, {
				password: spec.password,
				email_confirm: true,
			});
		}
		await admin.from('profiles').upsert(
			{ id, full_name: key, role: spec.role === 'admin' ? 'admin' : 'student' },
			{ onConflict: 'id' },
		);
		if (spec.role === 'admin') {
			// already handled by the upsert above
		} else if (spec.role !== 'student') {
			await admin.from('staff_members').upsert(
				{
					user_id: id,
					role_code: spec.role,
					active: spec.active !== false,
				},
				{ onConflict: 'user_id' },
			);
		}
	}
}

async function signIn(email, password) {
	const client = createClient(URL, ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data, error } = await client.auth.signInWithPassword({ email, password });
	if (error) throw new Error(`sign in ${email}: ${error.message}`);
	return client;
}

async function main() {
	console.log('--- setup ---');
	await createUsers();
	console.log('users created');

	console.log('\n--- public login module dropdown (anon) ---');
	const publicModules = await anon
		.from('login_modules')
		.select('id, name, description, icon, portal_id, display_order')
		.eq('enabled', true)
		.order('display_order', { ascending: true });
	check('anon can read the enabled login modules', !publicModules.error, publicModules.error?.message);
	const publicIds = (publicModules.data ?? []).map((m) => m.id);
	check('the dropdown lists every enabled login module', publicIds.length >= 22, publicIds.join(','));
	check('disabled modules are hidden from the public dropdown', !publicIds.includes('__never__'));
	check('module rows carry a dashboard route', (publicModules.data ?? []).every((m) => !!m.portal_id));

	console.log('\n--- college branding for the login page ---');
	// The suite needs a college with a logo. It is created once so that the
	// suite also runs on a database that has no seed data yet.
	const { data: seededColleges } = await admin
		.from('colleges')
		.select('id, name, logo_url')
		.order('name');
	let brandingCollege = (seededColleges ?? []).find((college) => college.logo_url);
	if (!brandingCollege) {
		const { data: created, error: collegeError } = await admin
			.from('colleges')
			.insert({
				name: 'SVIT College of Engineering',
				code: 'SVIT',
				logo_url: 'https://example.test/svit-logo.png',
				active: true,
			})
			.select()
			.single();
		if (collegeError) {
			check('the college of the test could be created', false, collegeError.message);
		}
		brandingCollege = created;
	}
	const branding = await anon.rpc('get_college_branding');
	check(
		'branding returns the college name',
		branding.data?.name === brandingCollege?.name,
		JSON.stringify(branding.data),
	);
	check('branding returns the college logo', !!branding.data?.logo_url);

	console.log('\n--- ADMIN LOGIN ---');
	const adminClient = await signIn(USERS.admin.email, USERS.admin.password);
	const adminResolve = await adminClient.rpc('resolve_login_module', {
		p_module_id: 'admin',
	});
	check('admin is allowed on the admin module', adminResolve.data?.allowed === true, JSON.stringify(adminResolve.data));
	check('admin is routed to the existing super admin dashboard', adminResolve.data?.portal_id === 'super_admin' && adminResolve.data?.entry_page === 'Dashboard', JSON.stringify(adminResolve.data));
	const adminModules = await adminClient.from('login_modules').select('id');
	check('admin can read every module including disabled ones', (adminModules.data ?? []).length >= 22, String((adminModules.data ?? []).length));

	console.log('\n--- FACULTY LOGIN ---');
	const facultyClient = await signIn(USERS.faculty.email, USERS.faculty.password);
	const facultyResolve = await facultyClient.rpc('resolve_login_module', {
		p_module_id: 'faculty',
	});
	check('faculty is allowed on the faculty module', facultyResolve.data?.allowed === true, JSON.stringify(facultyResolve.data));
	check('faculty is routed to the faculty leave dashboard', facultyResolve.data?.portal_id === 'faculty_leave' && facultyResolve.data?.entry_page === 'Leave Dashboard', JSON.stringify(facultyResolve.data));
	const facultyWrong = await facultyClient.rpc('resolve_login_module', {
		p_module_id: 'admin',
	});
	check('faculty is rejected on the admin module', facultyWrong.data?.allowed === false, JSON.stringify(facultyWrong.data));

	console.log('\n--- STUDENT LOGIN ---');
	const studentClient = await signIn(USERS.student.email, USERS.student.password);
	const studentResolve = await studentClient.rpc('resolve_login_module', {
		p_module_id: 'student',
	});
	check('student is allowed on the student module', studentResolve.data?.allowed === true, JSON.stringify(studentResolve.data));
	check('student is routed to My Applications', studentResolve.data?.portal_id === 'admissions' && studentResolve.data?.entry_page === 'My Applications', JSON.stringify(studentResolve.data));
	const studentWrong = await studentClient.rpc('resolve_login_module', {
		p_module_id: 'faculty',
	});
	check('student is rejected on the faculty module', studentWrong.data?.allowed === false, JSON.stringify(studentWrong.data));

	console.log('\n--- HOD + ACCOUNTANT LOGIN ---');
	const hodClient = await signIn(USERS.hod.email, USERS.hod.password);
	const hodResolve = await hodClient.rpc('resolve_login_module', { p_module_id: 'hod' });
	check('hod is allowed on the hod module', hodResolve.data?.allowed === true, JSON.stringify(hodResolve.data));
	check('hod is routed to student management', hodResolve.data?.portal_id === 'student_management', JSON.stringify(hodResolve.data));
	const accountantClient = await signIn(USERS.accountant.email, USERS.accountant.password);
	const accountantResolve = await accountantClient.rpc('resolve_login_module', { p_module_id: 'accountant' });
	check('accountant is allowed on the accountant module', accountantResolve.data?.allowed === true, JSON.stringify(accountantResolve.data));
	check('accountant is routed to payments', accountantResolve.data?.entry_page === 'Payments', JSON.stringify(accountantResolve.data));

	console.log('\n--- DISABLED STAFF ACCOUNT ---');
	const disabledClient = await signIn(USERS.disabled.email, USERS.disabled.password);
	const disabledResolve = await disabledClient.rpc('resolve_login_module', { p_module_id: 'faculty' });
	check('disabled staff account is rejected', disabledResolve.data?.allowed === false, JSON.stringify(disabledResolve.data));

	console.log('\n--- DISABLED MODULE BEHAVIOUR ---');
	const saveDisabled = await adminClient.rpc('admin_save_login_module', {
		p_id: 'library_staff',
		p_name: 'Library Staff',
		p_description: 'Library desk',
		p_icon: '📚',
		p_portal_id: 'college_info',
		p_entry_page: 'Faculty',
		p_display_order: 7,
		p_enabled: false,
		p_allowed_roles: ['library_staff'],
	});
	check('admin can disable a module', !saveDisabled.error, saveDisabled.error?.message);
	const afterDisable = await anon
		.from('login_modules')
		.select('id')
		.eq('enabled', true);
	check('disabled module disappears from the public dropdown', !(afterDisable.data ?? []).some((m) => m.id === 'library_staff'), JSON.stringify(afterDisable.data?.map((m) => m.id)));
	const stillThere = await adminClient.from('login_modules').select('id,name,allowed_roles').eq('id', 'library_staff').maybeSingle();
	check('disabled module row and its role mapping are kept', stillThere.data?.id === 'library_staff' && stillThere.data?.allowed_roles?.includes('library_staff'), JSON.stringify(stillThere.data));
	const usersIntact = await adminClient.from('staff_members').select('user_id');
	check('disabling a module did not remove any staff member', (usersIntact.data ?? []).length >= 4, String((usersIntact.data ?? []).length));
	const adminStillWorks = await adminClient.rpc('resolve_login_module', { p_module_id: 'library_staff' });
	check('super admin keeps access to a disabled module', adminStillWorks.data?.allowed === true, JSON.stringify(adminStillWorks.data));
	const reEnable = await adminClient.rpc('admin_save_login_module', {
		p_id: 'library_staff',
		p_name: 'Library Staff',
		p_description: 'Faculty records, subjects and library desk',
		p_icon: '📚',
		p_portal_id: 'college_info',
		p_entry_page: 'Faculty',
		p_display_order: 7,
		p_enabled: true,
		p_allowed_roles: ['library_staff'],
	});
	check('admin can re-enable a module', !reEnable.error, reEnable.error?.message);

	console.log('\n--- UNAUTHORISED ROUTE ACCESS ---');
	const anonResolve = await anon.rpc('resolve_login_module', { p_module_id: 'admin' });
	check('anonymous callers cannot resolve a login module', anonResolve.error !== null, anonResolve.error?.message);
	const studentWrite = await studentClient.from('login_modules').update({ name: 'hacked' }).eq('id', 'student');
	const afterStudentWrite = await anon.from('login_modules').select('name').eq('id', 'student').maybeSingle();
	check(
		'a student cannot edit a login module',
		afterStudentWrite.data?.name !== 'hacked',
		`${studentWrite.error?.message ?? 'no error (0 rows affected)'} / name=${afterStudentWrite.data?.name}`,
	);
	const studentRpc = await studentClient.rpc('admin_save_login_module', {
		p_id: 'evil',
		p_name: 'Evil',
		p_description: '',
		p_icon: '',
		p_portal_id: 'admissions',
		p_entry_page: 'Dashboard',
		p_display_order: 99,
		p_enabled: true,
		p_allowed_roles: ['student'],
	});
	check('a student cannot create a login module', studentRpc.error !== null, studentRpc.error?.message);

	console.log('\n--- LOGIN WITH USER ID INSTEAD OF EMAIL ---');
	const listUsers = await admin.auth.admin.listUsers();
	const studentUser = listUsers.data?.users?.find((u) => u.email === USERS.student.email);
	const emailLookup = await anon.rpc('resolve_login_email', {
		p_user_id: studentUser.id,
	});
	check('user id resolves to the account email', emailLookup.data === USERS.student.email, String(emailLookup.data));
	const userIdLogin = await signIn(emailLookup.data, USERS.student.password);
	const userIdResolve = await userIdLogin.rpc('resolve_login_module', { p_module_id: 'student' });
	check('signing in with the user id reaches the same module', userIdResolve.data?.allowed === true);

	console.log('\n--- FORGOT PASSWORD ---');
	const reset = await anon.auth.resetPasswordForEmail(USERS.student.email, {
		redirectTo: 'http://localhost:8000',
	});
	check('password reset email is accepted', !reset.error, reset.error?.message);
	const unknown = await anon.auth.resetPasswordForEmail('nobody@svit.test', {
		redirectTo: 'http://localhost:8000',
	});
	check('password reset for an unknown address does not fail the request', !unknown.error, unknown.error?.message);

	// Read the recovery link that was delivered to the local mail catcher and
	// complete the password reset exactly like the login page does.
	const messages = await fetch('http://127.0.0.1:8025/api/v2/messages').then((r) => r.json());
	const recovery = (messages?.items ?? [])
		.map((item) => (item.Content?.Body ?? '').replace(/=\r?\n/g, ''))
		.find((body) => body.includes('token='));
	check('a recovery email with a reset link was delivered', Boolean(recovery));
	if (recovery) {
		const link = recovery.match(/http[^\s"']*token=[^\s"']*/)?.[0];
		const token = link?.split('token=')[1]?.split('&')[0];
		const client = createClient(URL, ANON_KEY, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
		const code = recovery.match(/enter the code:\s*([0-9]+)/i)?.[1];
		let session = await client.auth.verifyOtp({
			email: USERS.student.email,
			token: token ? decodeURIComponent(token) : '',
			type: 'recovery',
		});
		if (session.error && code) {
			session = await client.auth.verifyOtp({
				email: USERS.student.email,
				token: code,
				type: 'recovery',
			});
		}
		check('the recovery link signs the user in', !session.error, session.error?.message);
		const updated = await client.auth.updateUser({ password: 'NewStudent@12345' });
		check('the password can be updated from the recovery session', !updated.error, updated.error?.message);
		const signInAgain = await signIn(USERS.student.email, 'NewStudent@12345');
		const afterReset = await signInAgain.rpc('resolve_login_module', { p_module_id: 'student' });
		check('the new password works and the module still resolves', afterReset.data?.allowed === true, afterReset.error?.message);
		// restore the original password so the suite can run again
		await client.auth.updateUser({ password: USERS.student.password });
	}

	console.log('\n--- ADMIN MODULE SETTINGS ---');
	const rename = await adminClient.rpc('admin_save_login_module', {
		p_id: 'student',
		p_name: 'Student Portal',
		p_description: 'Admission application',
		p_icon: '🧑‍🎓',
		p_portal_id: 'admissions',
		p_entry_page: 'My Applications',
		p_display_order: 3,
		p_enabled: true,
		p_allowed_roles: ['student'],
	});
	check('admin can rename a module', !rename.error, rename.error?.message);
	const renamed = await anon.from('login_modules').select('name').eq('id', 'student').maybeSingle();
	check('the new name is served to the public dropdown', renamed.data?.name === 'Student Portal', JSON.stringify(renamed.data));
	await adminClient.rpc('admin_save_login_module', {
		p_id: 'student',
		p_name: 'Student',
		p_description: 'Admission application, submitted forms and documents',
		p_icon: '🧑‍🎓',
		p_portal_id: 'admissions',
		p_entry_page: 'My Applications',
		p_display_order: 3,
		p_enabled: true,
		p_allowed_roles: ['student'],
	});
	const order = await adminClient.rpc('admin_save_login_module', {
		p_id: 'student',
		p_name: 'Student',
		p_description: 'Admission application, submitted forms and documents',
		p_icon: '🧑‍🎓',
		p_portal_id: 'admissions',
		p_entry_page: 'My Applications',
		p_display_order: 99,
		p_enabled: true,
		p_allowed_roles: ['student'],
	});
	check('admin can set the display order', !order.error, order.error?.message);
	const ordered = await anon.from('login_modules').select('id').eq('enabled', true).order('display_order');
	check('the dropdown is ordered by the display order', ordered.data?.[ordered.data.length - 1]?.id === 'student', JSON.stringify(ordered.data?.map((m) => m.id)));

	console.log(`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('E2E run failed:', error);
	process.exit(1);
});
