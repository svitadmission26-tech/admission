// Helpers for the admission form builder. The functions are pure so that the
// field list behaviour can be tested without a browser.

// The database key of a field, built from its label.
export const makeFieldKey = (label) =>
	String(label ?? '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');

// Returns a key that is not used yet. A duplicate key gets a numeric suffix
// so that the form definition stays valid.
export const uniqueFieldKey = (base, usedKeys) => {
	let key = base;
	let suffix = 2;
	while (usedKeys.has(key)) {
		key = `${base}_${suffix}`;
		suffix += 1;
	}
	usedKeys.add(key);
	return key;
};

// Moves a field up or down inside its own section. The fields of the other
// sections keep their position. The same list is returned when the field
// cannot move any further.
export const moveFieldInList = (fields, index, offset) => {
	const sectionId = fields[index]?.sectionId;
	const sectionIndexes = fields
		.map((field, fieldIndex) =>
			field.sectionId === sectionId ? fieldIndex : -1,
		)
		.filter((fieldIndex) => fieldIndex >= 0);
	const position = sectionIndexes.indexOf(index);
	const target = sectionIndexes[position + offset];
	if (position < 0 || target === undefined) return fields;
	const reordered = [...fields];
	[reordered[index], reordered[target]] = [
		reordered[target],
		reordered[index],
	];
	return reordered;
};

// The position of a field inside its own section, counted from 0. A field
// that is not in the list gives -1.
export const fieldPositionInSection = (fields, index) => {
	const sectionId = fields[index]?.sectionId;
	if (!sectionId) return -1;
	let position = 0;
	for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
		if (fields[fieldIndex].sectionId !== sectionId) continue;
		if (fieldIndex === index) return position;
		position += 1;
	}
	return -1;
};

// Moves a field to a new position (counted from 0) inside its own section.
// The fields of the other sections and the order of the whole list keep
// their place. The same list is returned when the field already has that
// position or when the target is out of range.
export const moveFieldToPosition = (fields, index, targetPosition) => {
	const sectionId = fields[index]?.sectionId;
	const sectionIndexes = fields
		.map((field, fieldIndex) =>
			field.sectionId === sectionId ? fieldIndex : -1,
		)
		.filter((fieldIndex) => fieldIndex >= 0);
	const currentPosition = sectionIndexes.indexOf(index);
	if (currentPosition < 0) return fields;
	const target = Math.min(
		Math.max(Math.trunc(targetPosition), 0),
		sectionIndexes.length - 1,
	);
	if (target === currentPosition) return fields;

	// Only the fields of the section are reordered, the other fields stay on
	// the same index of the list.
	const sectionFields = sectionIndexes.map((fieldIndex) => fields[fieldIndex]);
	const [moved] = sectionFields.splice(currentPosition, 1);
	sectionFields.splice(target, 0, moved);
	const reordered = [...fields];
	sectionIndexes.forEach((fieldIndex, position) => {
		reordered[fieldIndex] = sectionFields[position];
	});
	return reordered;
};

// The branches that a branch field offers. An empty option list means that
// every active branch of the course is offered.
export const branchOptionsForField = (field, branches = []) =>
	(branches ?? []).filter(
		(branch) =>
			branch.active !== false &&
			(!field?.options?.length || field.options.includes(branch.id)),
	);
