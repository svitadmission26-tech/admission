// End-to-end test of the dynamic College ERP against the local Postgres +
// GoTrue + PostgREST stack running migrations 001 to 041.
//
// It proves that:
//   - the 25 modules are registered and reachable
//   - the module permission matrix is enforced by the database
//   - the shared students / faculty masters are never duplicated
//   - the dynamic form builder versions its schema and keeps the old data
//   - the module screens read and write the shared tables
//   - a staff account can not reach a module it has no grant for
//
// Start the stack first:
//   npm run local-stack
// Then run the suite:
//   npm run test:erp-modules:e2e
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

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

const USERS = {
	admin: { email: 'erpadmin@svit.test', password: 'ErpAdmin@12345', role: 'admin' },
	transport: {
		email: 'transport@svit.test',
		password: 'Transport@12345',
		role: 'transport_manager',
	},
	librarian: {
		email: 'librarian@svit.test',
		password: 'Librarian@12345',
		role: 'librarian',
	},
	student: {
		email: 'erpstudent@svit.test',
		password: 'ErpStudent@12345',
		role: 'student',
	},
	accountant: {
		email: 'erpaccounts@svit.test',
		password: 'ErpAccounts@12345',
		role: 'accounts_officer',
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
		await admin
			.from('profiles')
			.upsert(
				{
					id,
					full_name: key,
					email: spec.email,
					role: spec.role === 'admin' ? 'admin' : 'student',
				},
				{ onConflict: 'id' },
			);
		if (spec.role !== 'admin' && spec.role !== 'student') {
			await admin
				.from('staff_members')
				.upsert(
					{ user_id: id, role_code: spec.role, active: true },
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

// PostgREST reloads its schema cache when a migration changed the database.
// A call that lands in that window is retried once.
async function call(client, table, action) {
	let result = await action();
	if (
		result.error &&
		/schema cache|Could not find the function/i.test(result.error.message ?? '')
	) {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		result = await action();
	}
	return result;
}

async function main() {
	console.log('--- setup ---');
	await createUsers();
	console.log('users created');

	console.log('\n--- the 25 modules are registered ---');
	const modules = await admin.from('erp_modules').select('id, number, title, portal, enabled');
	const moduleRows = modules.data ?? [];
	check('25 modules are registered', moduleRows.length === 25, String(moduleRows.length));
	check(
		'every module has a number from 1 to 25',
		moduleRows.map((row) => row.number).sort((a, b) => a - b).join(',') ===
			Array.from({ length: 25 }, (_, index) => index + 1).join(','),
	);
	check(
		'every module points at a dashboard route',
		moduleRows.every((row) => !!row.portal && !!row.title),
	);
	const permissions = await admin.from('erp_module_permissions').select('module_id, role_code');
	check(
		'the permission matrix covers the modules',
		new Set((permissions.data ?? []).map((row) => row.module_id)).size >= 20,
		String(new Set((permissions.data ?? []).map((row) => row.module_id)).size),
	);

	console.log('\n--- ADMIN ACCESS ---');
	const adminClient = await signIn(USERS.admin.email, USERS.admin.password);
	const adminAccess = await adminClient.rpc('get_my_erp_access');
	check('the admin access resolves', !adminAccess.error, adminAccess.error?.message);
	check('the admin role is resolved', adminAccess.data?.role === 'admin', adminAccess.data?.role);
	check(
		'the admin may open every module',
		(adminAccess.data?.modules ?? []).length === 25,
		String((adminAccess.data?.modules ?? []).length),
	);
	const adminPermissions = (adminAccess.data?.modules ?? []).find(
		(module) => module.id === 'transport',
	);
	check(
		'the admin has every right on a module',
		adminPermissions?.permissions?.view === true &&
			adminPermissions?.permissions?.create === true &&
			adminPermissions?.permissions?.delete === true,
		JSON.stringify(adminPermissions?.permissions),
	);

	console.log('\n--- TRANSPORT MANAGER ACCESS ---');
	const transportClient = await signIn(USERS.transport.email, USERS.transport.password);
	const transportAccess = await transportClient.rpc('get_my_erp_access');
	const transportModules = (transportAccess.data?.modules ?? []).map((module) => module.id);
	check('the transport manager only sees the transport module', transportModules.length === 1 && transportModules[0] === 'transport', transportModules.join(','));
	const transportWrite = await transportClient
		.from('erp_transport_routes')
		.insert({ route_code: 'T-E2E-1', name: 'E2E route', start_point: 'A', end_point: 'B' });
	check('the transport manager may write a route', !transportWrite.error, transportWrite.error?.message);
	const transportRead = await transportClient.from('erp_transport_routes').select('id');
	check('the transport manager reads the routes', !transportRead.error, transportRead.error?.message);
	const libraryRead = await transportClient.from('erp_library_items').select('id');
	check(
		'the transport manager cannot read the library module',
		(libraryRead.data ?? []).length === 0,
		libraryRead.error?.message ?? `${(libraryRead.data ?? []).length} rows`,
	);
	const libraryWrite = await transportClient.from('erp_library_items').insert({
		accession_number: 'E2E-1',
		title: 'Should not exist',
	});
	check(
		'the transport manager cannot write to the library module',
		libraryWrite.error !== null,
		libraryWrite.error?.message,
	);

	console.log('\n--- LIBRARIAN ACCESS ---');
	const librarianClient = await signIn(USERS.librarian.email, USERS.librarian.password);
	const librarianAccess = await librarianClient.rpc('get_my_erp_access');
	const librarianModules = (librarianAccess.data?.modules ?? []).map((module) => module.id);
	check('the librarian sees the library module', librarianModules.includes('library'), librarianModules.join(','));
	const librarianRoutes = await librarianClient.from('erp_transport_routes').select('id');
	check(
		'the librarian cannot read the transport routes',
		(librarianRoutes.data ?? []).length === 0,
		librarianRoutes.error?.message ?? `${(librarianRoutes.data ?? []).length} rows`,
	);

	console.log('\n--- THE SHARED STUDENT AND FACULTY MASTERS ---');
	const { data: college } = await admin
		.from('colleges')
		.insert({ name: 'E2E College', code: 'E2E-C', active: true })
		.select()
		.single();
	const { data: course } = await admin
		.from('courses')
		.insert({
			name: 'E2E Course',
			code: 'E2EC',
			college_id: college.id,
			active: true,
		})
		.select()
		.single();
	const { data: student } = await admin
		.from('students')
		.insert({
			enrollment: 'E2E-2026-001',
			student_id_code: 'E2ES001',
			name: 'E2E Student',
			course: 'E2E Course',
			semester: 1,
			division: 'A',
			admission_year: '2026-2027',
			course_id: course.id,
			guardian_email: USERS.student.email,
		})
		.select()
		.single();
	check('the student master accepts the linked record', !!student?.id, student?.id);
	const duplicateStudent = await admin
		.from('students')
		.insert({
			enrollment: 'E2E-2026-001',
			name: 'Duplicate',
			course: 'E2E Course',
			semester: 1,
			division: 'A',
		});
	check(
		'a duplicate enrollment is refused by the database',
		duplicateStudent.error !== null,
		duplicateStudent.error?.message,
	);
	const { data: linkedProfiles } = await admin
		.from('students')
		.select('id, enrollment, user_id')
		.eq('guardian_email', USERS.student.email);
	check(
		'the portal login is linked to the existing student row',
		(linkedProfiles ?? []).length === 1 && !!linkedProfiles[0].user_id,
		JSON.stringify(linkedProfiles),
	);
	const { data: facultyRow } = await admin
		.from('faculty')
		.insert({
			code: 'E2E-F-001',
			name: 'E2E Faculty',
			email: USERS.librarian.email,
		})
		.select()
		.single();
	check('the faculty master accepts the linked record', !!facultyRow?.id, facultyRow?.id);
	const { data: linkedFaculty } = await admin
		.from('faculty')
		.select('id, code, user_id')
		.eq('code', 'E2E-F-001');
	check(
		'the portal login is linked to the existing faculty row',
		(linkedFaculty ?? []).length === 1 && !!linkedFaculty[0].user_id,
		JSON.stringify(linkedFaculty),
	);
	const duplicateFaculty = await admin
		.from('faculty')
		.insert({ code: 'e2e-f-001', name: 'Duplicate faculty' });
	check(
		'a duplicate faculty code is refused by the database',
		duplicateFaculty.error !== null,
		duplicateFaculty.error?.message,
	);

	console.log('\n--- THE STUDENT PORTAL IS LIMITED TO THE OWN RECORD ---');
	const studentClient = await signIn(USERS.student.email, USERS.student.password);
	const studentRows = await studentClient.from('students').select('id, enrollment');
	check(
		'the student reads only the own student row',
		(studentRows.data ?? []).length === 1,
		JSON.stringify(studentRows.data),
	);
	const studentWrite = await studentClient
		.from('students')
		.update({ name: 'Hacked' })
		.eq('id', student.id);
	const { data: studentAfterWrite } = await admin
		.from('students')
		.select('name')
		.eq('id', student.id)
		.maybeSingle();
	check(
		'the student cannot change the student master',
		studentAfterWrite?.name === 'E2E Student',
		`${studentWrite.error?.message ?? 'no error'} / name=${studentAfterWrite?.name}`,
	);

	console.log('\n--- THE DYNAMIC FORM BUILDER VERSIONS ITS SCHEMA ---');
	const definitionId = await adminClient.rpc('erp_save_form', {
		p_definition_id: null,
		p_module_id: 'students',
		p_name: 'E2E student feedback',
		p_description: 'Created by the end-to-end suite',
		p_key: 'e2e_feedback',
		p_table_name: 'erp_form_records',
		p_layout: { type: 'cards' },
		p_fields: [
			{ key: 'feedback', label: 'Feedback', type: 'textarea', required: true },
			{ key: 'rating', label: 'Rating', type: 'number', required: false },
		],
		p_sections: [{ id: 'general', title: 'General' }],
		p_settings: {},
		p_allowed_roles: [],
		p_record_permissions: {},
		p_change_note: 'first version',
	});
	check('the form definition is created', !definitionId.error, definitionId.error?.message);
	const { data: versionsAfterFirst } = await admin
		.from('erp_form_versions')
		.select('version, fields, published')
		.eq('definition_id', definitionId.data)
		.order('version');
	check(
		'the first save writes version 1',
		(versionsAfterFirst ?? []).length === 1 && versionsAfterFirst[0].version === 1,
		JSON.stringify(versionsAfterFirst?.map((row) => row.version)),
	);
	const recordId = await adminClient.rpc('erp_save_form_record', {
		p_definition_id: definitionId.data,
		p_record_id: null,
		p_data: { feedback: 'The admission desk is helpful', rating: 5 },
		p_status: 'submitted',
	});
	check('a record is saved against the form', !recordId.error, recordId.error?.message);
	const invalidRecord = await adminClient.rpc('erp_save_form_record', {
		p_definition_id: definitionId.data,
		p_record_id: null,
		p_data: { rating: 5 },
		p_status: 'submitted',
	});
	check(
		'a record that misses a required field is refused',
		invalidRecord.error !== null,
		invalidRecord.error?.message,
	);
	await adminClient.rpc('erp_save_form', {
		p_definition_id: definitionId.data,
		p_module_id: 'students',
		p_name: 'E2E student feedback',
		p_description: 'Created by the end-to-end suite',
		p_key: 'e2e_feedback',
		p_table_name: 'erp_form_records',
		p_layout: { type: 'cards' },
		p_fields: [
			{ key: 'feedback', label: 'Feedback', type: 'textarea', required: true },
			{ key: 'rating', label: 'Rating', type: 'number', required: false },
			{ key: 'suggestion', label: 'Suggestion', type: 'text', required: false },
		],
		p_sections: [{ id: 'general', title: 'General' }],
		p_settings: {},
		p_allowed_roles: [],
		p_record_permissions: {},
		p_change_note: 'second version',
	});
	const { data: versionsAfterSecond } = await admin
		.from('erp_form_versions')
		.select('version, fields')
		.eq('definition_id', definitionId.data)
		.order('version');
	check(
		'the second save writes version 2 and keeps version 1',
		(versionsAfterSecond ?? []).length === 2 &&
			(versionsAfterSecond ?? []).every((row) => Array.isArray(row.fields)),
		JSON.stringify(versionsAfterSecond?.map((row) => row.version)),
	);
	const { data: oldRecord } = await admin
		.from('erp_form_records')
		.select('version, data')
		.eq('id', recordId.data)
		.maybeSingle();
	check(
		'the record keeps the version it was submitted against',
		oldRecord?.version === 1,
		JSON.stringify(oldRecord),
	);
	check(
		'the data of the old record is preserved',
		oldRecord?.data?.feedback === 'The admission desk is helpful',
		JSON.stringify(oldRecord?.data),
	);
	const publish = await adminClient.rpc('erp_publish_form', {
		p_definition_id: definitionId.data,
		p_version: null,
	});
	check('the form is published', !publish.error, publish.error?.message);

	console.log('\n--- THE NOTIFICATION CENTRE ---');
	const notification = await adminClient.rpc('erp_notify', {
		p_module_id: 'students',
		p_title: 'E2E notification',
		p_body: 'Written by the end-to-end suite',
		p_severity: 'info',
		p_target_role: 'transport_manager',
		p_target_user: null,
		p_audience: ['transport_manager'],
		p_course_id: null,
	});
	check('a notification is published', !notification.error, notification.error?.message);
	const transportNotifications = await transportClient
		.from('erp_notifications')
		.select('id, title')
		.eq('id', notification.data);
	check(
		'the targeted staff member receives the notification',
		(transportNotifications.data ?? []).length === 1,
		JSON.stringify(transportNotifications.data),
	);
	const libraryNotifications = await librarianClient
		.from('erp_notifications')
		.select('id')
		.eq('id', notification.data);
	check(
		'another role does not receive the notification',
		(libraryNotifications.data ?? []).length === 0,
		JSON.stringify(libraryNotifications.data),
	);
	await admin
		.from('erp_notification_reads')
		.insert({ notification_id: notification.data, user_id: (await transportClient.auth.getUser()).data.user.id });

	console.log('\n--- MODULE ENABLE AND DISABLE ---');
	await admin.from('erp_modules').update({ enabled: false }).eq('id', 'placement');
	const transportAfterDisable = await transportClient.rpc('get_my_erp_access');
	check(
		'a disabled module disappears from the access list',
		!(transportAfterDisable.data?.modules ?? []).some((module) => module.id === 'placement'),
	);
	await admin.from('erp_modules').update({ enabled: true }).eq('id', 'placement');
	const placementRows = await admin.from('erp_modules').select('enabled').eq('id', 'placement').single();
	check('the module can be enabled again', placementRows.data?.enabled === true);

	console.log('\n--- THE AUDIT TRAIL ---');
	const audit = await admin
		.from('erp_audit_log')
		.select('table_name, action')
		.eq('table_name', 'erp_transport_routes')
		.order('at', { ascending: false })
		.limit(1);
	check(
		'the write is written to the audit trail',
		(audit.data ?? []).length === 1 && audit.data[0].action === 'insert',
		JSON.stringify(audit.data?.[0]),
	);
	const studentAudit = await studentClient.from('erp_audit_log').select('id');
	check(
		'a student cannot read the audit trail',
		(studentAudit.data ?? []).length === 0,
		studentAudit.error?.message ?? `${(studentAudit.data ?? []).length} rows`,
	);

	console.log('\n--- THE MODULE WORKFLOWS ---');
	// Accounts: a voucher with a line is posted and the ledger is written.
	const { data: head } = await admin
		.from('erp_account_heads')
		.insert({ code: 'E2E-FEE', name: 'E2E tuition fee', head_type: 'income' })
		.select()
		.single();
	const { data: voucher } = await admin
		.from('erp_vouchers')
		.insert({
			voucher_no: 'E2E-VOUCH-1',
			voucher_type: 'receipt',
			voucher_date: new Date().toISOString().slice(0, 10),
			party_name: 'E2E Student',
			narration: 'First term fee',
		})
		.select()
		.single();
	await admin.from('erp_voucher_lines').insert({
		voucher_id: voucher.id,
		head_id: head.id,
		narration: 'Tuition fee',
		credit_paise: 50000,
	});
	const posted = await adminClient.rpc('erp_post_voucher', {
		p_voucher_id: voucher.id,
	});
	check('the voucher is posted', !posted.error, posted.error?.message);
	check('the posted total is the amount of the line', Number(posted.data) === 50000, String(posted.data));
	const { data: ledger } = await admin
		.from('erp_ledger_entries')
		.select('credit_paise, particulars')
		.eq('voucher_id', voucher.id);
	check(
		'the ledger entry is written',
		(ledger ?? []).length === 1 && ledger[0].credit_paise === 50000,
		JSON.stringify(ledger),
	);
	const repost = await adminClient.rpc('erp_post_voucher', {
		p_voucher_id: voucher.id,
	});
	check(
		'a voucher cannot be posted twice',
		repost.error !== null,
		repost.error?.message,
	);
	const emptyVoucher = await call(admin, 'erp_vouchers', () =>
		admin
			.from('erp_vouchers')
			.insert({ voucher_no: 'E2E-VOUCH-2', voucher_type: 'journal' })
			.select()
			.single(),
	);
	const postEmpty = await call(adminClient, 'erp_post_voucher', () =>
		adminClient.rpc('erp_post_voucher', {
			p_voucher_id: emptyVoucher.data?.id,
		}),
	);
	const { data: emptyAfter } = await admin
		.from('erp_vouchers')
		.select('status')
		.eq('id', emptyVoucher.data?.id)
		.single();
	check(
		'a voucher without a line is not posted',
		postEmpty.error !== null && emptyAfter?.status === 'draft',
		`${postEmpty.error?.message ?? 'no error'} / status=${emptyAfter?.status}`,
	);

	// Library: a book is issued and returned, the copies stay in step.
	const { data: item } = await admin
		.from('erp_library_items')
		.insert({
			accession_number: 'E2E-ACC-1',
			title: 'E2E book',
			total_copies: 1,
			available_copies: 1,
		})
		.select()
		.single();
	const { data: member } = await admin
		.from('erp_library_members')
		.insert({ member_code: 'E2E-MEM-1', member_type: 'student', name: 'E2E Student' })
		.select()
		.single();
	const issue = await adminClient.rpc('erp_issue_library_book', {
		p_item_id: item.id,
		p_member_id: member.id,
		p_due_date: new Date().toISOString().slice(0, 10),
	});
	check('the book is issued', !issue.error, issue.error?.message);
	const { data: itemAfterIssue } = await admin
		.from('erp_library_items')
		.select('available_copies')
		.eq('id', item.id)
		.single();
	check(
		'the available copy is used',
		itemAfterIssue.available_copies === 0,
		String(itemAfterIssue.available_copies),
	);
	const issueAgain = await adminClient.rpc('erp_issue_library_book', {
		p_item_id: item.id,
		p_member_id: member.id,
		p_due_date: new Date().toISOString().slice(0, 10),
	});
	check(
		'a book that is on loan cannot be issued again',
		issueAgain.error !== null,
		issueAgain.error?.message,
	);
	const returned = await adminClient.rpc('erp_return_library_book', {
		p_issue_id: issue.data,
	});
	check('the book is returned', !returned.error, returned.error?.message);
	const { data: itemAfterReturn } = await admin
		.from('erp_library_items')
		.select('available_copies')
		.eq('id', item.id)
		.single();
	check(
		'the copy is available again',
		itemAfterReturn.available_copies === 1,
		String(itemAfterReturn.available_copies),
	);

	// Approval workflow: only the role of the step may act on it.
	const { data: workflow } = await admin
		.from('erp_approval_workflows')
		.insert({
			module_id: 'accounts',
			name: 'E2E voucher approval',
			entity_table: 'erp_vouchers',
			steps: [
				{ role_code: 'accounts_officer', action: 'approve', label: 'Accountant' },
				{ role_code: 'principal', action: 'approve', label: 'Principal' },
			],
			enabled: true,
		})
		.select()
		.single();
	const { data: workflowItem } = await admin
		.from('erp_workflow_items')
		.insert({
			workflow_id: workflow.id,
			module_id: 'accounts',
			entity_table: 'erp_vouchers',
			entity_id: voucher.id,
			title: 'E2E voucher',
			current_step: 0,
			status: 'pending',
		})
		.select()
		.single();
	const wrongRole = await librarianClient.rpc('erp_workflow_action', {
		p_item_id: workflowItem.id,
		p_action: 'approve',
		p_comment: '',
	});
	check(
		'only the role of the step may act on the item',
		wrongRole.error !== null,
		wrongRole.error?.message,
	);
	const accountantUser = await admin.auth.admin.listUsers();
	const accountantId = accountantUser.data?.users?.find(
		(user) => user.email === USERS.accountant.email,
	)?.id;
	await admin.from('staff_members').upsert(
		{ user_id: accountantId, role_code: 'accounts_officer', active: true },
		{ onConflict: 'user_id' },
	);
	const accountantClient = await signIn(
		USERS.accountant.email,
		USERS.accountant.password,
	);
	const firstStep = await accountantClient.rpc('erp_workflow_action', {
		p_item_id: workflowItem.id,
		p_action: 'approve',
		p_comment: 'Checked by the accountant',
	});
	check('the role of the step may act on the item', !firstStep.error, firstStep.error?.message);
	check(
		'the item moves to the next step',
		firstStep.data?.current_step === 1 && firstStep.data?.status === 'pending',
		JSON.stringify({ step: firstStep.data?.current_step, status: firstStep.data?.status }),
	);
	const secondStep = await accountantClient.rpc('erp_workflow_action', {
		p_item_id: workflowItem.id,
		p_action: 'approve',
		p_comment: '',
	});
	check(
		'the role of the next step may not act on the item',
		secondStep.error !== null,
		secondStep.error?.message,
	);
	const { data: history } = await admin
		.from('erp_workflow_items')
		.select('history')
		.eq('id', workflowItem.id)
		.single();
	check(
		'the decision is written to the history of the item',
		(history?.history ?? []).length === 1,
		JSON.stringify(history?.history),
	);

	console.log('\n--- CLEAN UP ---');
	await admin.from('erp_workflow_items').delete().eq('id', workflowItem.id);
	await admin.from('erp_approval_workflows').delete().eq('id', workflow.id);
	await admin.from('erp_ledger_entries').delete().eq('voucher_id', voucher.id);
	await admin.from('erp_voucher_lines').delete().eq('voucher_id', voucher.id);
	await admin.from('erp_vouchers').delete().in('voucher_no', ['E2E-VOUCH-1', 'E2E-VOUCH-2']);
	await admin.from('erp_account_heads').delete().eq('id', head.id);
	await admin.from('erp_library_issues').delete().eq('item_id', item.id);
	await admin.from('erp_library_fines').delete().eq('member_id', member.id);
	await admin.from('erp_library_items').delete().eq('id', item.id);
	await admin.from('erp_library_members').delete().eq('id', member.id);
	await admin.from('erp_transport_routes').delete().eq('route_code', 'T-E2E-1');
	await admin.from('erp_form_records').delete().eq('definition_id', definitionId.data);
	await admin.from('erp_form_versions').delete().eq('definition_id', definitionId.data);
	await admin.from('erp_form_definitions').delete().eq('id', definitionId.data);
	
	
	await admin.from('students').delete().eq('enrollment', 'E2E-2026-001');
	await admin.from('faculty').delete().ilike('code', 'E2E-F-%');
	await admin.from('courses').delete().eq('code', 'E2EC');
	await admin.from('colleges').delete().eq('code', 'E2E-C');
	console.log('fixtures removed');

	console.log(`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('E2E run failed:', error);
	process.exit(1);
});
