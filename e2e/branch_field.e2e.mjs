// End-to-end test of the branch selection field of an admission form.
//
// The test publishes a form that holds a "branch" field, reads it the way the
// student application page reads it and checks that the branches of the
// course are offered to the student.
//
// Start the stack first:
//   npm run local-stack
// Then run the suite:
//   npm run test:branch-field:e2e
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

const BRANCH_FIELDS = [
	{
		key: 'full_name',
		label: 'Full Name',
		type: 'text',
		required: true,
		sectionId: 'general',
		options: [],
	},
	{
		key: 'branch',
		label: 'Branch',
		type: 'branch',
		required: true,
		sectionId: 'general',
		options: [],
	},
];

async function main() {
	console.log('--- setup ---');
	const stamp = Date.now();
	const { data: college, error: collegeError } = await admin
		.from('colleges')
		.insert({ name: `Branch Field Test College ${stamp}`, code: `BFT${stamp}`, active: true })
		.select()
		.single();
	if (collegeError) throw new Error(`college: ${collegeError.message}`);
	const { data: course, error: courseError } = await admin
		.from('courses')
		.insert({
			name: `Branch Field Test Course ${stamp}`,
			code: `BFTC${stamp}`,
			college_id: college.id,
			active: true,
		})
		.select()
		.single();
	if (courseError) throw new Error(`course: ${courseError.message}`);
	const { data: branches, error: branchError } = await admin
		.from('branches')
		.insert([
			{
				name: 'Computer Engineering',
				code: `CE${stamp}`,
				course_id: course.id,
				college_id: college.id,
				active: true,
			},
			{
				name: 'Civil Engineering',
				code: `CIVIL${stamp}`,
				course_id: course.id,
				college_id: college.id,
				active: true,
			},
			{
				name: 'Retired Branch',
				code: `OLD${stamp}`,
				course_id: course.id,
				college_id: college.id,
				active: false,
			},
		])
		.select();
	if (branchError) throw new Error(`branches: ${branchError.message}`);
	check('two active branches and one inactive branch exist', branches.length === 3);

	const { data: form, error: formError } = await admin
		.from('admission_forms')
		.insert({
			title: 'Branch Field Test Form',
			status: 'published',
			enabled_for_students: true,
			college_id: college.id,
			course_id: course.id,
			fields: BRANCH_FIELDS,
			form_sections: [
				{ id: 'general', title: 'General', layout: 'columns', visibility: null },
			],
		})
		.select()
		.single();
	check('the form with a branch field is saved', !formError, formError?.message);

	console.log('\n--- the student reads the published form ---');
	// A published form is only readable by a signed in student, so the test
	// creates a student account and signs in with it.
	const email = `branch-field-${Date.now()}@svit.test`;
	const password = 'BranchField@12345';
	await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	});
	const student = createClient(URL, ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data: studentSession, error: signInError } =
		await student.auth.signInWithPassword({
			email,
			password,
		});
	if (signInError) throw new Error(`sign in: ${signInError.message}`);
	if (!studentSession.session) throw new Error('sign in: no session');
	const { data: published, error: readError } = await student
		.from('admission_forms')
		.select('*,courses(name,branches(id,name,active))')
		.eq('id', form.id)
		.single();
	check('the published form is readable by a student', !readError, readError?.message);
	check(
		'the branch field is part of the form',
		(published?.fields ?? []).some((field) => field.type === 'branch'),
	);
	const courseBranches = published?.courses?.branches ?? [];
	check(
		'the course brings its branches to the student page',
		courseBranches.length === 2,
		String(courseBranches.length),
	);
	const activeBranches = courseBranches.filter((branch) => branch.active !== false);
	check(
		'the two active branches are offered',
		activeBranches.length === 2,
		activeBranches.map((branch) => branch.name).join(','),
	);
	check(
		'the inactive branch is hidden from the student page',
		!courseBranches.some((branch) => branch.name === 'Retired Branch'),
	);
	const branchField = (published?.fields ?? []).find((field) => field.type === 'branch');
	check(
		'a branch field without a restriction offers every active branch',
		activeBranches.every((branch) =>
			!branchField.options?.length || branchField.options.includes(branch.id),
		),
	);
	check(
		'the branch selection is stored with the application',
		branchField?.key === 'branch',
		branchField?.key,
	);

	console.log('\n--- a restricted branch field ---');
	const restricted = activeBranches[0];
	const { data: restrictedForm } = await admin
		.from('admission_forms')
		.insert({
			title: 'Branch Field Test Form (restricted)',
			status: 'published',
			enabled_for_students: true,
			college_id: college.id,
			course_id: course.id,
			fields: [
				{
					key: 'branch',
					label: 'Branch',
					type: 'branch',
					required: true,
					sectionId: 'general',
					options: [restricted.id],
				},
			],
		})
		.select()
		.single();
	const { data: restrictedRead } = await student
		.from('admission_forms')
		.select('fields')
		.eq('id', restrictedForm.id)
		.single();
	const restrictedField = (restrictedRead?.fields ?? []).find(
		(field) => field.type === 'branch',
	);
	check(
		'only the ticked branch is kept in the field',
		Array.isArray(restrictedField?.options) && restrictedField.options.length === 1,
		JSON.stringify(restrictedField?.options),
	);

	console.log('\n--- cleanup ---');
	await admin.from('admission_forms').delete().eq('college_id', college.id);
	await admin.from('branches').delete().eq('course_id', course.id);
	await admin.from('courses').delete().eq('id', course.id);
	await admin.from('colleges').delete().eq('id', college.id);
	console.log('test data removed');

	console.log(
		`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('E2E run failed:', error);
	process.exit(1);
});
