// Tests for the admission types of an admission form: the codes that are
// stored, the labels that are shown and the clean up of a value that comes
// from the database or from the generic record editor.
import {
	admissionTypeLabel,
	admissionTypeOptions,
	defaultAdmissionTypes,
	normalizeAdmissionTypes,
} from '../src/lib/admissionTypes.js';

let failures = 0;
function check(label, condition, extra = '') {
	const ok = Boolean(condition);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
}

check(
	'the three admission types are offered',
	admissionTypeOptions.map((option) => option.value).join(',') ===
		'Regular,C2D,D2D',
	admissionTypeOptions.map((option) => option.value).join(','),
);
check(
	'C2D is shown as C to D',
	admissionTypeLabel('C2D') === 'C2D (C to D)',
	admissionTypeLabel('C2D'),
);
check(
	'D2D is shown as D to D',
	admissionTypeLabel('D2D') === 'D2D (D to D)',
	admissionTypeLabel('D2D'),
);
check(
	'Regular keeps its own text',
	admissionTypeLabel('Regular') === 'Regular',
	admissionTypeLabel('Regular'),
);
check(
	'an unknown type keeps its own text',
	admissionTypeLabel('Sports') === 'Sports',
	admissionTypeLabel('Sports'),
);
check(
	'every type is allowed by default',
	defaultAdmissionTypes.join(',') === 'Regular,C2D,D2D',
	defaultAdmissionTypes.join(','),
);

check(
	'an array is kept',
	normalizeAdmissionTypes(['Regular', 'C2D']).join(',') === 'Regular,C2D',
	normalizeAdmissionTypes(['Regular', 'C2D']).join(','),
);
check(
	'a comma separated string is split',
	normalizeAdmissionTypes('Regular, D2D ,C2D').join(',') === 'Regular,D2D,C2D',
	normalizeAdmissionTypes('Regular, D2D ,C2D').join(','),
);
check(
	'a duplicate is removed',
	normalizeAdmissionTypes(['Regular', 'Regular']).join(',') === 'Regular',
	normalizeAdmissionTypes(['Regular', 'Regular']).join(','),
);
check(
	'an empty value gives an empty list',
	normalizeAdmissionTypes('').length === 0,
	JSON.stringify(normalizeAdmissionTypes('')),
);
check(
	'a missing value gives an empty list',
	normalizeAdmissionTypes(null).length === 0,
);
check(
	'a JSON array string is read',
	normalizeAdmissionTypes('["Regular","C2D"]').join(',') === 'Regular,C2D',
	normalizeAdmissionTypes('["Regular","C2D"]').join(','),
);
check(
	'an unknown type is not dropped',
	normalizeAdmissionTypes(['Regular', 'Sports']).join(',') === 'Regular,Sports',
	normalizeAdmissionTypes(['Regular', 'Sports']).join(','),
);

if (failures) {
	console.log(`\n${failures} check(s) failed.`);
	process.exit(1);
}
console.log('\n===== ALL CHECKS PASSED =====');
