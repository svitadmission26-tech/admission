// The admission types that an admission form can allow.
//
// The stored value is the short code that is written to
// `admission_forms.allowed_admission_types` and to
// `applications.answers.admission_type`. The label is the text that is shown
// to the administrator and to the student.
export const admissionTypeOptions = [
	{ value: 'Regular', label: 'Regular' },
	{ value: 'C2D', label: 'C2D (C to D)' },
	{ value: 'D2D', label: 'D2D (D to D)' },
];

// The types that are allowed when a form does not say anything.
export const defaultAdmissionTypes = admissionTypeOptions.map(
	(option) => option.value,
);

const labelByValue = new Map(
	admissionTypeOptions.map((option) => [option.value, option.label]),
);

// The text that is shown for a stored admission type. A type that is not
// known keeps its own text, so an older form never loses its value.
export const admissionTypeLabel = (value) => labelByValue.get(value) ?? value;

// The admission types of a form as a clean list of codes. The value can be
// an array, a comma separated string, a JSON array string or missing.
export const normalizeAdmissionTypes = (value) => {
	if (Array.isArray(value)) {
		return [
			...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)),
		];
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.startsWith('[')) {
			// The generic record editor writes the list as JSON.
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) return normalizeAdmissionTypes(parsed);
			} catch {
				/* not JSON, the comma separated list is used instead */
			}
		}
		return [
			...new Set(
				trimmed
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean),
			),
		];
	}
	return [];
};
