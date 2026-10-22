// Checks the migration files themselves.
//
// A migration that is cut short by accident still looks like a valid file, so
// the chain would stop with a confusing error in the middle of a run. These
// checks catch it before the migrations are applied:
//
//   - every file is a real migration, not a fragment
//   - the dollar quoting is balanced
//   - every migration that calls public.erp_apply_module_policies() also
//     defines it, so a single module migration can be applied on its own
//
//   npm run test:migrations
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, '..', 'supabase', 'migrations');

const CREATE_HELPER = 'create or replace function public.erp_apply_module_policies(';
const REVOKE_HELPER =
	'revoke all on function public.erp_apply_module_policies(text, text) from public;';

// Splits a script into its top level statements. The dollar quoting and the
// string literals are respected, so a statement is never cut in the middle.
function splitStatements(sql) {
	const out = [];
	let buf = '';
	let i = 0;
	let inLine = false;
	let inBlock = false;
	let inString = false;
	let dollarTag = null;

	while (i < sql.length) {
		const c = sql[i];
		const next = sql[i + 1];

		if (inLine) {
			buf += c;
			if (c === '\n') inLine = false;
			i++;
			continue;
		}
		if (inBlock) {
			buf += c;
			if (c === '*' && next === '/') {
				buf += next;
				i += 2;
				inBlock = false;
				continue;
			}
			i++;
			continue;
		}
		if (dollarTag) {
			if (c === '$' && sql.startsWith(dollarTag, i)) {
				buf += dollarTag;
				i += dollarTag.length;
				dollarTag = null;
				continue;
			}
			buf += c;
			i++;
			continue;
		}
		if (inString) {
			buf += c;
			if (c === "'") {
				if (next === "'") {
					buf += next;
					i += 2;
					continue;
				}
				inString = false;
			}
			i++;
			continue;
		}

		if (c === '-' && next === '-') {
			inLine = true;
			buf += c;
			i++;
			continue;
		}
		if (c === '/' && next === '*') {
			inBlock = true;
			buf += c;
			i++;
			continue;
		}
		if (c === "'") {
			inString = true;
			buf += c;
			i++;
			continue;
		}
		if (c === '$') {
			const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
			if (m) {
				dollarTag = m[0];
				buf += m[0];
				i += m[0].length;
				continue;
			}
		}
		if (c === ';') {
			buf += c;
			out.push(buf);
			buf = '';
			i++;
			continue;
		}
		buf += c;
		i++;
	}
	if (buf.trim()) out.push(buf);
	return out;
}

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

const files = readdirSync(folder)
	.filter((file) => file.endsWith('.sql'))
	.sort();

check('the migrations are found', files.length >= 42, String(files.length));

// The ERP migrations are the ones that this project adds. They are checked
// strictly; the legacy migrations keep their own style.
const erpFiles = files.filter((file) => Number(file.slice(0, 3)) >= 35);

const contents = new Map();
for (const file of files) {
	const sql = readFileSync(join(folder, file), 'utf8');
	contents.set(file, sql);

	const name = file.replace(/\.sql$/, '');
	const isErp = Number(file.slice(0, 3)) >= 35;

	check(
		`${name}: the file is a complete migration`,
		sql.length > 200 && sql.trim().endsWith(';'),
		`${sql.length} bytes`,
	);
	check(
		`${name}: the dollar quoting is balanced`,
		(sql.match(/\$\$/g) ?? []).length % 2 === 0,
		`${(sql.match(/\$\$/g) ?? []).length} markers`,
	);
	check(
		`${name}: the file holds a statement`,
		/\b(create|alter|drop|insert|update|grant|revoke|comment|select)\b/i.test(sql),
	);
	if (isErp) {
		check(
			`${name}: the file starts with a comment`,
			sql.split('\n')[0].startsWith('--'),
			sql.split('\n')[0],
		);
		check(
			`${name}: the file names the migration`,
			sql.includes(`Migration ${file.slice(0, 3)}`),
			'the header has to name the migration',
		);
	}
}

// The helper has to travel with every migration that calls it.
const helperCall = /select\s+public\.erp_apply_module_policies\s*\(/i;
const helperDefinition = /create or replace function public\.erp_apply_module_policies\s*\(/i;
for (const [file, sql] of contents) {
	if (!helperCall.test(sql)) continue;
	check(
		`${file.replace(/\.sql$/, '')}: defines the helper it calls`,
		helperDefinition.test(sql),
		'the helper has to be in the same file',
	);
}

// ---------------------------------------------------------------------------
// The module migrations 036 to 042
//
// Every one of them carries the policy helper, not only the ones that call
// it, so that a single module migration can be applied on its own. The copies
// have to be the same, otherwise a fix in one of them is lost in the others.
// ---------------------------------------------------------------------------
const moduleFiles = files.filter((file) => {
	const number = Number(file.slice(0, 3));
	return number >= 36 && number <= 42;
});

check(
	'the module migrations 036 to 042 are all there',
	moduleFiles.length === 7,
	moduleFiles.map((file) => file.slice(0, 3)).join(','),
);

// The helper block, from the removal of a stale overload until the revoke.
function helperBlock(sql) {
	const end = sql.indexOf(
		'revoke all on function public.erp_apply_module_policies(text, text) from public;',
	);
	if (end < 0) return null;
	const from = sql.indexOf('do $$');
	if (from < 0) return null;
	return sql.slice(from, end);
}

const helperBlocks = new Map();
for (const file of moduleFiles) {
	const sql = contents.get(file);
	const name = file.replace(/\.sql$/, '');
	const block = helperBlock(sql);

	check(`${name}: carries the policy helper`, Boolean(block));
	helperBlocks.set(file, block);

	check(
		`${name}: removes a stale helper before it replaces it`,
		/drop function %s/i.test(sql),
		'an old overload would stop the migration',
	);
	check(
		`${name}: removes a stale helper even when something still uses it`,
		/drop function %s cascade/i.test(sql),
		'otherwise PostgreSQL refuses to replace the helper',
	);
	check(
		`${name}: names the migration that has to come first`,
		/035_erp_core_framework\.sql must be applied before this migration/i.test(sql),
	);
	check(
		`${name}: the helper never stops a migration`,
		!/raise exception/i.test(block) && /when others then/i.test(block),
		'a failing step has to be a warning, not an exception',
	);
	check(
		`${name}: the helper installs a safe fallback for the permission function`,
		/create or replace function public\.erp_module_permission\(/i.test(block),
		'without it the policies of the module tables cannot be created',
	);

	// Every statement of a module migration has to be protected. The Supabase
	// SQL Editor runs a whole script in one transaction, so a single error
	// rolls the whole migration back.
	const statements = splitStatements(sql);
	const bare = statements.filter((part) => {
		const code = part
			.split('\n')
			.filter((line) => !/^\s*--/.test(line))
			.join('\n')
			.trim();
		if (!code) return false;
		if (/^do\b/i.test(code)) return false;
		if (code.includes(CREATE_HELPER)) return false;
		if (code.includes(REVOKE_HELPER)) return false;
		return true;
	});
	check(
		`${name}: every statement of the migration is protected`,
		bare.every((part) => /do \$do\$[\s\S]*exception[\s\S]*when others then/.test(part)),
		`${bare.filter((p) => !/do \$do\$/.test(p)).length} statements without a protection`,
	);
}

check(
	'the policy helper is the same in every module migration',
	new Set(helperBlocks.values()).size === 1,
	`${new Set(helperBlocks.values()).size} different copies`,
);

// ---------------------------------------------------------------------------
// The shared masters
//
// A module migration must never read a table or a column that another
// migration owns without making sure it is there first. Otherwise the
// migration stops with "does not exist" when it is applied on its own.
// ---------------------------------------------------------------------------
const ensuresStudentLink =
	/alter table public\.students\s+add column if not exists user_id uuid references public\.profiles/i;
const usesStudentLink = /\bstudents?\s*\.\s*user_id\b/i;

for (const [file, sql] of contents) {
	const name = file.replace(/\.sql$/, '');
	if (!usesStudentLink.test(sql)) continue;
	check(
		`${name}: makes sure the student link to the portal login exists`,
		ensuresStudentLink.test(sql),
		'the migration reads students.user_id',
	);
}

const ensuresRooms = /create table if not exists public\.erp_timetable_rooms\s*\(/i;
const usesRooms = /\berp_timetable_rooms\b/i;
for (const [file, sql] of contents) {
	const name = file.replace(/\.sql$/, '');
	if (!usesRooms.test(sql)) continue;
	check(
		`${name}: makes sure the timetable room master exists`,
		ensuresRooms.test(sql),
		'the migration reads the timetable rooms',
	);
}

// The room master is written more than once, so the copies have to match.
function roomsBlock(sql) {
	const start = sql.indexOf('create table if not exists public.erp_timetable_rooms (');
	if (start < 0) return null;
	const end = sql.indexOf('on public.erp_timetable_rooms (lower(code));', start);
	if (end < 0) return null;
	return sql.slice(start, end);
}
const roomBlocks = new Map();
for (const file of files) {
	const block = roomsBlock(contents.get(file));
	if (block) roomBlocks.set(file, block);
}
check(
	'the timetable room master is written the same way everywhere',
	new Set(roomBlocks.values()).size === 1,
	`${new Set(roomBlocks.values()).size} different copies`,
);

// ---------------------------------------------------------------------------
// The repair files
//
// They are the answer for a database that was stopped halfway, so they have
// to be complete and they have to carry the same helper as the migrations.
// ---------------------------------------------------------------------------
const repairFolder = join(here, '..', 'supabase', 'repair');
const repairFiles = ['erp_apply_module_policies.sql', 'module_policies.sql'];
for (const file of repairFiles) {
	let sql = '';
	try {
		sql = readFileSync(join(repairFolder, file), 'utf8');
	} catch {
		sql = '';
	}
	check(`${file}: the file is there`, sql.length > 0, `${sql.length} bytes`);
	if (!sql) continue;

	check(`${file}: the file is a complete script`, sql.trim().endsWith(';'));
	check(
		`${file}: the dollar quoting is balanced`,
		(sql.match(/\$\$/g) ?? []).length % 2 === 0,
		`${(sql.match(/\$\$/g) ?? []).length} markers`,
	);
	check(
		`${file}: defines the policy helper`,
		/create or replace function public\.erp_apply_module_policies\s*\(/i.test(sql),
	);
	check(
		`${file}: removes a stale helper before it replaces it`,
		/drop function %s/i.test(sql),
	);
	check(
		`${file}: removes a stale helper even when something still uses it`,
		/drop function %s cascade/i.test(sql),
	);
	check(
		`${file}: makes sure the student link to the portal login exists`,
		/alter table public\.students\s+add column if not exists user_id uuid references public\.profiles/i.test(
			sql,
		),
	);
	check(
		`${file}: makes sure the timetable room master exists`,
		/create table if not exists public\.erp_timetable_rooms\s*\(/i.test(sql),
	);
	check(
		`${file}: the helper is the same as the one of the migrations`,
		helperBlock(sql) === helperBlocks.get(moduleFiles[0]),
	);
	check(
		`${file}: the report counts the tables that are really protected`,
		/protected_module_tables/i.test(sql) &&
			/module_tables/i.test(sql) &&
			/pg_policies/i.test(sql),
		'a count of the existing tables says nothing about the permissions',
	);
	check(
		`${file}: the report lists the tables without the module policies`,
		/table_without_the_module_policies/i.test(sql),
	);
	check(
		`${file}: the loop counts the policies that were really created`,
		/into v_policies/i.test(sql),
	);

	// The Supabase SQL Editor runs the whole script in one transaction. A
	// single error rolls the entire repair back, the helper included. The
	// report may therefore not read a table directly, it may only read the
	// catalogs of PostgreSQL or reach a table through dynamic SQL.
	const withoutStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
	const directTable = withoutStrings.match(
		/\b(from|join|update|into|table)\s+public\.[a-z_]+/gi,
	);
	check(
		`${file}: the report does not read a table directly`,
		directTable === null,
		directTable ? directTable.join(', ') : '',
	);
}

// ---------------------------------------------------------------------------
// The diagnosis file
//
// It is the first thing to run when a module migration stops. It only reads,
// so it must never fail on any database.
// ---------------------------------------------------------------------------
const diagnosePath = join(repairFolder, 'diagnose.sql');
let diagnose = '';
try {
	diagnose = readFileSync(diagnosePath, 'utf8');
} catch {
	diagnose = '';
}
check('diagnose.sql: the file is there', diagnose.length > 0, `${diagnose.length} bytes`);
if (diagnose) {
	check('diagnose.sql: the dollar quoting is balanced', (diagnose.match(/\$\$/g) ?? []).length % 2 === 0);
	check(
		'diagnose.sql: shows every version of the policy helper',
		/from pg_proc p[\s\S]*erp_apply_module_policies/i.test(diagnose),
	);
	check(
		'diagnose.sql: shows what still uses the policy helper',
		/from pg_depend d/i.test(diagnose),
	);
	check(
		'diagnose.sql: shows the module tables and their permissions',
		/module_policies/i.test(diagnose),
	);
	check(
		'diagnose.sql: ends with one summary of every check',
		/the permission function reads the matrix/i.test(diagnose) &&
			/every module table has its four module policies/i.test(diagnose) &&
			/the student master links to the portal login/i.test(diagnose) &&
			/the timetable room master exists/i.test(diagnose),
		'one table shows whether everything is in place',
	);
	check(
		'diagnose.sql: counts the rows of a table that may be missing',
		/query_to_xml/i.test(diagnose),
		'a direct select on a table that may not exist would break the diagnosis',
	);
	check(
		'diagnose.sql: never changes anything',
		!/^\s*(insert|update|delete|drop|alter|truncate|create)\s/im.test(diagnose),
		'the diagnosis only reads',
	);
}
//
// The repair files hold the list of the module tables that they protect. It
// has to be the same list as the one of the migrations, otherwise a table of
// a migration is left without its permissions after a repair.
// ---------------------------------------------------------------------------
function moduleTableCalls(sql) {
	const found = new Set();
	const pattern = /erp_apply_module_policies\(\s*'([a-z_]+)',\s*'([a-z_]+)'\s*\)/g;
	let match = pattern.exec(sql);
	while (match) {
		found.add(`${match[1]}|${match[2]}`);
		match = pattern.exec(sql);
	}
	return found;
}

const migrationTables = new Set();
for (const file of moduleFiles) {
	for (const entry of moduleTableCalls(contents.get(file))) {
		migrationTables.add(entry);
	}
}
check(
	'the module migrations protect a table for every module',
	migrationTables.size >= 89,
	`${migrationTables.size} tables`,
);

for (const file of repairFiles) {
	const sql = readFileSync(join(repairFolder, file), 'utf8');
	const repairTables = new Set();
	const pattern = /\[\s*'([a-z_]+)',\s*'([a-z_]+)'\s*\]/g;
	let match = pattern.exec(sql);
	while (match) {
		repairTables.add(`${match[1]}|${match[2]}`);
		match = pattern.exec(sql);
	}

	const missing = [...migrationTables].filter((entry) => !repairTables.has(entry));
	const extra = [...repairTables].filter((entry) => !migrationTables.has(entry));

	check(
		`${file}: protects every module table of the migrations`,
		missing.length === 0,
		missing.length ? `missing: ${missing.join(', ')}` : `${repairTables.size} tables`,
	);
	check(
		`${file}: does not protect a table that no migration protects`,
		extra.length === 0,
		extra.length ? `extra: ${extra.join(', ')}` : '',
	);
}

// The ERP migrations are numbered in order and every number is used once.
const erpNumbers = erpFiles.map((file) => Number(file.slice(0, 3)));
check(
	'the ERP migration numbers are unique',
	new Set(erpNumbers).size === erpNumbers.length,
	erpNumbers.join(','),
);
check(
	'the ERP migration numbers are in order',
	erpNumbers.every((value, index) => index === 0 || value > erpNumbers[index - 1]),
	erpNumbers.join(','),
);
check(
	'the ERP migrations start at 035 and have no gap',
	erpNumbers[0] === 35 &&
		erpNumbers.every((value, index) => index === 0 || value === erpNumbers[index - 1] + 1),
	erpNumbers.join(','),
);

console.log(`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`);
process.exit(failures === 0 ? 0 : 1);
