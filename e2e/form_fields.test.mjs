// Tests for the admission form builder helpers: the field key handling, the
// multi select add, the move up / move down of a field and the branch
// selection options.
import {
	branchOptionsForField,
	fieldPositionInSection,
	makeFieldKey,
	moveFieldInList,
	moveFieldToPosition,
	uniqueFieldKey,
} from '../src/lib/formFields.js';

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

check(
	'the key is built from the label',
	makeFieldKey('Full Name') === 'full_name',
	makeFieldKey('Full Name'),
);
check(
	'special characters are removed from the key',
	makeFieldKey('Father\'s Name (Hindi)') === 'father_s_name_hindi',
	makeFieldKey("Father's Name (Hindi)"),
);
check(
	'an empty label gives an empty key',
	makeFieldKey('') === '',
);

const used = new Set(['full_name']);
check(
	'a used key gets a numeric suffix',
	uniqueFieldKey('full_name', used) === 'full_name_2',
);
check(
	'the used key is reserved',
	used.has('full_name_2'),
);
check(
	'an unused key is kept',
	uniqueFieldKey('email_address', used) === 'email_address',
);

const list = [
	{ key: 'a', sectionId: 'general' },
	{ key: 'b', sectionId: 'general' },
	{ key: 'c', sectionId: 'personal' },
	{ key: 'd', sectionId: 'general' },
];
const movedDown = moveFieldInList(list, 0, 1);
check(
	'a field moves down inside its section',
	movedDown.map((field) => field.key).join(',') === 'b,a,c,d',
	movedDown.map((field) => field.key).join(','),
);
const movedUp = moveFieldInList(movedDown, 1, -1);
check(
	'a field moves up inside its section',
	movedUp.map((field) => field.key).join(',') === 'a,b,c,d',
	movedUp.map((field) => field.key).join(','),
);
check(
	'the first field cannot move up',
	moveFieldInList(list, 0, -1) === list,
);
check(
	'the last field of a section cannot move down',
	moveFieldInList(list, 3, 1) === list,
);
check(
	'a field never crosses a section',
	moveFieldInList(list, 1, 1).find((field) => field.key === 'c')
		?.sectionId === 'personal',
);

check(
	'the position of a field in its section is counted from 0',
	fieldPositionInSection(list, 0) === 0 &&
		fieldPositionInSection(list, 1) === 1 &&
		fieldPositionInSection(list, 3) === 2,
	[fieldPositionInSection(list, 0), fieldPositionInSection(list, 1), fieldPositionInSection(list, 3)].join(','),
);
check(
	'a field of another section does not change the position',
	fieldPositionInSection(list, 2) === 0,
	fieldPositionInSection(list, 2),
);

const generalOrder = (fields) =>
	fields
		.filter((field) => field.sectionId === 'general')
		.map((field) => field.key)
		.join(',');

const movedToFirst = moveFieldToPosition(list, 3, 0);
check(
	'a field moves to the first number of its section',
	generalOrder(movedToFirst) === 'd,a,b',
	generalOrder(movedToFirst),
);
check(
	'the fields of the other sections keep their place',
	movedToFirst[2].key === 'c' && movedToFirst[2].sectionId === 'personal',
);
const movedToLast = moveFieldToPosition(list, 0, 2);
check(
	'a field moves to the last number of its section',
	generalOrder(movedToLast) === 'b,d,a',
	generalOrder(movedToLast),
);
check(
	'a field keeps its place when the number is the same',
	moveFieldToPosition(list, 0, 0) === list,
);
check(
	'a number that is too large moves the field to the end',
	generalOrder(moveFieldToPosition(list, 0, 99)) === 'b,d,a',
	generalOrder(moveFieldToPosition(list, 0, 99)),
);
check(
	'a number that is too small moves the field to the start',
	generalOrder(moveFieldToPosition(list, 3, -5)) === 'd,a,b',
	generalOrder(moveFieldToPosition(list, 3, -5)),
);

const branches = [
	{ id: 'b1', name: 'Computer Engineering', active: true },
	{ id: 'b2', name: 'Civil Engineering', active: true },
	{ id: 'b3', name: 'Old Branch', active: false },
];
check(
	'branch selection offers every active branch by default',
	branchOptionsForField({ options: [] }, branches).length === 2,
);
check(
	'branch selection can be limited to a few branches',
	branchOptionsForField({ options: ['b2'] }, branches).length === 1 &&
		branchOptionsForField({ options: ['b2'] }, branches)[0].id === 'b2',
);
check(
	'an inactive branch is never offered',
	branchOptionsForField({ options: ['b3'] }, branches).length === 0,
);

console.log(
	`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`,
);
process.exit(failures === 0 ? 0 : 1);
