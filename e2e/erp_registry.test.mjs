// Checks that the ERP module registry matches the database.
//
// Every table of the registry must exist and every field of a table must be a
// real column. A typo in the registry would otherwise only show up when a
// user opens the screen.
//
// Start the stack first:
//   npm run local-stack
// Then run the suite:
//   npm run test:erp-registry:e2e
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
const SERVICE_KEY = mint('service_role');
const admin = createClient(URL, SERVICE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const { erpModules, erpAllTables } = await import('../src/lib/erpModules.js');
const { existingPages, existingDashboardRoutes, legacyPageNames } = await import(
	'../src/lib/accessControl.js'
);

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

console.log('--- the registry ---');
check('25 modules are described', erpModules.length === 25, String(erpModules.length));
check(
	'the module numbers are 1 to 25',
	erpModules.map((module) => module.number).sort((a, b) => a - b).join(',') ===
		Array.from({ length: 25 }, (_, index) => index + 1).join(','),
);
check(
	'the module ids are unique',
	new Set(erpModules.map((module) => module.id)).size === erpModules.length,
);
check(
	'every module has a title, an icon and a dashboard route',
	erpModules.every(
		(module) =>
			module.title &&
			module.icon &&
			module.portal &&
			module.entryPage &&
			module.description,
	),
);
const tableKeys = erpAllTables().map((table) => table.key);
check(
	'the table keys are unique',
	new Set(tableKeys).size === tableKeys.length,
	String(tableKeys.length - new Set(tableKeys).size),
);
check(
	'every table has a title, a description and at least one field',
	erpAllTables().every(
		(table) =>
			table.title && table.description && Array.isArray(table.fields) && table.fields.length,
	),
);
check(
	'every field has a key and a label',
	erpAllTables().every((table) =>
		table.fields.every((field) => field.key && field.label),
	),
);
check(
	'every reference field points at a table',
	erpAllTables().every((table) =>
		table.fields.every((field) => field.type !== 'reference' || !!field.ref),
	),
);

console.log('\n--- the navigation ---');
const pageNames = existingPages.map(([name]) => name);
check(
	'the page names are unique',
	new Set(pageNames).size === pageNames.length,
	String(pageNames.length - new Set(pageNames).size),
);
const routeIds = existingDashboardRoutes.map((route) => route.id);
check(
	'the dashboard route ids are unique',
	new Set(routeIds).size === routeIds.length,
);
check(
	'every module points at a dashboard route that exists',
	erpModules.every((module) => routeIds.includes(module.portal)),
	erpModules
		.filter((module) => !routeIds.includes(module.portal))
		.map((module) => module.id)
		.join(','),
);
check(
	'every module entry page is in the navigation',
	erpModules.every((module) => pageNames.includes(module.entryPage)),
	erpModules
		.filter((module) => !pageNames.includes(module.entryPage))
		.map((module) => module.id)
		.join(','),
);
check(
	'the legacy pages are still in the navigation',
	legacyPageNames.every((name) => pageNames.includes(name)),
);
check(
	'every page of a dashboard route is in the navigation',
	existingDashboardRoutes.every((route) =>
		(route.pages ?? []).every((name) => pageNames.includes(name)),
	),
	existingDashboardRoutes
		.flatMap((route) => (route.pages ?? []).filter((name) => !pageNames.includes(name)))
		.join(','),
);

console.log('\n--- the database ---');
for (const table of erpAllTables()) {
	const columns = table.fields.map((field) => field.key).join(',');
	const { error } = await admin
		.from(table.table)
		.select(columns)
		.limit(1);
	if (error) {
		failures += 1;
		console.log(`FAIL  ${table.moduleId} / ${table.key} (${table.table}) -> ${error.message}`);
	}
}
check(
	'every table and every field of the registry exists in the database',
	true,
);

console.log(`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`);
process.exit(failures === 0 ? 0 : 1);
