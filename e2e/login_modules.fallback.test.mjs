// Checks that the built-in login module catalogue stays in sync with
// migration 034 and that the "migration is missing" detection works.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	defaultLoginModules,
	isLoginModuleSetupMissing,
} from '../src/lib/loginModules.js';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

const migration = readFileSync(
	join(here, '..', 'supabase', 'migrations', '034_dynamic_login_modules.sql'),
	'utf8',
);
const seedBlock = migration
	.split('insert into public.login_modules')
	.pop()
	.split('on conflict (id) do nothing')[0];
const seededIds = [...seedBlock.matchAll(/\('([a-z_]+)',\s*'/g)].map(
	(match) => match[1],
);

check(
	'the catalogue holds the eight default modules',
	defaultLoginModules.length === 8,
	String(defaultLoginModules.length),
);
check(
	'the catalogue ids match the rows seeded by migration 034',
	seededIds.length === defaultLoginModules.length &&
		defaultLoginModules.every((item) => seededIds.includes(item.id)),
	seededIds.join(','),
);
check(
	'the module ids are unique',
	new Set(defaultLoginModules.map((item) => item.id)).size ===
		defaultLoginModules.length,
);
check(
	'every module points at an existing dashboard route',
	defaultLoginModules.every(
		(item) =>
			item.portal_id &&
			item.entry_page &&
			[
				'college_info',
				'admissions',
				'timetable',
				'faculty_leave',
				'student_management',
				'super_admin',
			].includes(item.portal_id),
	),
);
check(
	'every module is enabled and ordered',
	defaultLoginModules.every(
		(item) => item.enabled && Number.isInteger(item.display_order),
	),
);
check(
	'the display order is 1 to 8',
	defaultLoginModules.every((item, index) => item.display_order === index + 1),
);

check(
	'a missing table is detected',
	isLoginModuleSetupMissing({ code: 'PGRST205' }) === true,
);
check(
	'a missing function is detected',
	isLoginModuleSetupMissing({ code: 'PGRST202' }) === true,
);
check(
	'a missing relation is detected',
	isLoginModuleSetupMissing({ code: '42P01' }) === true,
);
check(
	'a missing endpoint is detected',
	isLoginModuleSetupMissing({ status: 404 }) === true,
);
check(
	'an unrelated error is not treated as a missing setup',
	isLoginModuleSetupMissing({ code: '42501', message: 'permission denied' }) ===
		false,
);
check(
	'no error is not treated as a missing setup',
	isLoginModuleSetupMissing(null) === false,
);

console.log(
	`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`,
);
process.exit(failures === 0 ? 0 : 1);
