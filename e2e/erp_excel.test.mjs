// Unit tests of the shared Excel layer of the ERP modules.
//
// The layer is used by every module, so a mistake here would break the
// import of every module at once.
//
//   npm run test:erp-excel
import {
	convertRow,
	excelColumns,
	fieldLabel,
	findDuplicate,
} from '../src/lib/erpExcel.js';

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

const fields = [
	{ key: 'route_code', label: 'Route code', type: 'text', required: true, unique: true },
	{ key: 'name', label: 'Route name', type: 'text', required: true },
	{ key: 'fare_paise', label: 'Fare', type: 'money' },
	{ key: 'capacity', label: 'Capacity', type: 'number' },
	{ key: 'active', label: 'Active', type: 'boolean' },
	{ key: 'route_id', label: 'Route', type: 'reference', ref: 'erp_transport_routes', refLabel: 'route', matchColumns: ['name', 'route_code'] },
	{ key: 'mode', label: 'Mode', type: 'select', options: ['morning', 'evening'] },
	{ key: 'serves_on', label: 'Serves on', type: 'date' },
	{ key: 'email', label: 'Email', type: 'email' },
	{ key: 'phone', label: 'Phone', type: 'phone' },
];

console.log('--- the labels and the columns ---');
check('a label is used when there is one', fieldLabel(fields[0]) === 'Route code');
check('a key becomes a readable label', fieldLabel('route_code') === 'Route Code');
check(
	'the columns keep the order of the fields',
	excelColumns(fields).map((column) => column.key).join(',') ===
		'route_code,name,fare_paise,capacity,active,route_id,mode,serves_on,email,phone',
);

console.log('\n--- the conversion of a row ---');
const referenceOptions = {
	route_id: [
		{ id: 'a1', name: 'North route', route_code: 'N1' },
		{ id: 'b2', name: 'South route', route_code: 'S2' },
	],
};
const converted = convertRow(
	{
		route_code: 'T-1',
		name: 'Campus route',
		fare_paise: '250.50',
		capacity: '40',
		active: 'Yes',
		route_id: 'North route',
		mode: 'morning',
		serves_on: '2026-08-01',
		email: 'transport@svit.test',
		phone: '+91 98765 43210',
	},
	fields,
	referenceOptions,
);
check('the text is kept', converted.route_code === 'T-1');
check('the amount is stored in paise', converted.fare_paise === 25050, String(converted.fare_paise));
check('the number is stored as a number', converted.capacity === 40);
check('the boolean is stored as a boolean', converted.active === true);
check('a reference is resolved to its id', converted.route_id === 'a1', String(converted.route_id));
check('the select keeps its value', converted.mode === 'morning');
check('the date is kept', converted.serves_on === '2026-08-01');
check('the email is kept', converted.email === 'transport@svit.test');
check('the phone is kept', converted.phone === '+91 98765 43210');

console.log('\n--- the validation of a row ---');
function rejects(label, row, expected) {
	try {
		convertRow(row, fields, referenceOptions);
		check(label, false, 'the row was accepted');
	} catch (error) {
		check(label, error.message.includes(expected), error.message);
	}
}
rejects('a missing required field is refused', { name: 'x' }, 'required');
rejects('a number that is not a number is refused', { route_code: 'a', name: 'b', capacity: 'many' }, 'number');
rejects('an invalid e-mail is refused', { route_code: 'a', name: 'b', email: 'nope' }, 'email');
rejects('an invalid phone number is refused', { route_code: 'a', name: 'b', phone: '123' }, 'phone');
rejects('an unknown reference is refused', { route_code: 'a', name: 'b', route_id: 'West route' }, 'does not match');
rejects('an option that is not offered is refused', { route_code: 'a', name: 'b', mode: 'night' }, 'must be one of');
rejects('a date in the wrong format is refused', { route_code: 'a', name: 'b', serves_on: '01/08/2026' }, 'YYYY-MM-DD');

console.log('\n--- the duplicate detection ---');
const existing = new Set(['route_code::t-1']);
const duplicate = findDuplicate(
	{ route_code: 'T-1', name: 'Campus route' },
	fields,
	existing,
);
check('a duplicate of an existing record is found', duplicate?.field?.key === 'route_code', JSON.stringify(duplicate?.field?.key));
const secondDuplicate = findDuplicate(
	{ route_code: 'T-2', name: 'Another route' },
	fields,
	existing,
);
check('a new record is not a duplicate', secondDuplicate === null);
const withinFile = findDuplicate(
	{ route_code: 'T-2', name: 'Another route' },
	fields,
	new Set(),
);
check('the first occurrence in a file is accepted', withinFile === null);
const secondInFile = findDuplicate(
	{ route_code: 't-2', name: 'Another route' },
	fields,
	new Set(['route_code::t-2']),
);
check(
	'the same value twice in one file is a duplicate',
	secondInFile?.field?.key === 'route_code',
);

console.log(`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`);
process.exit(failures === 0 ? 0 : 1);
