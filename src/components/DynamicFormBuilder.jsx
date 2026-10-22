import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import {
	downloadExcel,
	downloadExcelTemplate,
	readExcelRows,
} from '../lib/excel';
import {
	branchOptionsForField,
	fieldPositionInSection,
	makeFieldKey,
	moveFieldInList,
	moveFieldToPosition,
	uniqueFieldKey,
} from '../lib/formFields';
import {
	admissionTypeLabel,
	admissionTypeOptions,
	defaultAdmissionTypes,
	normalizeAdmissionTypes,
} from '../lib/admissionTypes';
import './DynamicFormBuilder.css';

const fieldTypes = [
	'text',
	'email',
	'number',
	'date',
	'textarea',
	'select',
	'checkbox',
	'file',
	'photo',
	'document',
	'branch',
	'table',
];
const fieldTypeLabels = {
	text: 'Text',
	email: 'Email',
	number: 'Number',
	date: 'Date',
	textarea: 'Textarea',
	select: 'Select',
	checkbox: 'Checkbox',
	file: 'File Upload (Any)',
	photo: 'Document (Photo)',
	document: 'Document (Document)',
	branch: 'Branch Selection',
	table: 'Table (Marks Entry)',
};
// The label that is used when a field type is added from the multi select
// panel. Every label can be changed afterwards with Configure.
const defaultFieldLabels = {
	text: 'Full Name',
	email: 'Email Address',
	number: 'Mobile Number',
	date: 'Date of Birth',
	textarea: 'Address',
	select: 'Select Option',
	checkbox: 'I Agree',
	file: 'Upload Document',
	photo: 'Passport Photo',
	document: 'Upload Certificate',
	branch: 'Branch',
	table: 'Marks Table',
};
// The student profile field types that map directly onto a form field.
const profileFieldType = (profileField) =>
	profileField.input_type === 'image'
		? 'photo'
		: fieldTypes.includes(profileField.input_type)
			? profileField.input_type
			: 'text';

const emptyField = () => ({
	key: '',
	label: '',
	type: 'text',
	sectionId: 'general',
	width: 'full',
	required: false,
	merit: false,
	placeholder: '',
	defaultValue: '',
	forceUppercase: false,
	textCase: 'none',
	copyFromCheckbox: false,
	copyFromFieldKey: '',
	profileFieldId: '',
	visibility: { fieldKey: '', operator: 'equals', value: '' },
	options: [],
	rows: 5,
});
const defaultSections = () => [
	{ id: 'general', title: 'General', layout: 'columns', visibility: null },
];

const makeKey = makeFieldKey;
const formExcelColumns = [
	{ key: 'title', label: 'Form title' },
	{ key: 'description', label: 'Description' },
	{ key: 'fields', label: 'Fields JSON' },
];

function errorMessage(error) {
	return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function validateFormDefinition(
	title,
	fields,
	sections = defaultSections(),
	requireFields = false,
) {
	if (!title.trim()) return 'Form title is required.';
	if (!Array.isArray(sections) || !sections.length)
		return 'Add at least one form section.';
	if (requireFields && !fields.length) return 'Add at least one field.';
	const keys = new Set();
	const sectionIds = new Set();
	for (const section of sections) {
		if (!section.id || !section.title?.trim())
			return 'Every section needs a title.';
		if (sectionIds.has(section.id)) return `Duplicate section: ${section.title}.`;
		sectionIds.add(section.id);
	}
	for (const field of fields) {
		if (!field.key || !/^[a-z][a-z0-9_]*$/.test(field.key))
			return `Invalid key for ${field.label || 'field'}; use lowercase letters, numbers, and underscores.`;
		if (keys.has(field.key)) return `Duplicate field key: ${field.key}.`;
		keys.add(field.key);
		if (!field.label.trim()) return 'Every field needs a label.';
		if (!fieldTypes.includes(field.type)) return 'Invalid field type.';
		if (field.sectionId && !sectionIds.has(field.sectionId))
			return `${field.label}: select an existing form section.`;
		if (field.type === 'select') {
			if (!field.options.length) return `${field.label}: add at least one option.`;
			if (new Set(field.options).size !== field.options.length)
				return `${field.label}: options must be unique.`;
		}
	}
	for (const field of fields) {
		if (field.visibility?.fieldKey && !keys.has(field.visibility.fieldKey))
			return `${field.label}: conditional visibility refers to a missing field.`;
		if (field.visibility?.fieldKey === field.key)
			return `${field.label}: a field cannot depend on itself.`;
		if (
			field.copyFromCheckbox &&
			(!field.copyFromFieldKey ||
				!keys.has(field.copyFromFieldKey) ||
				field.copyFromFieldKey === field.key)
		)
			return `${field.label}: select an existing field to copy from.`;
	}
	for (const section of sections) {
		if (section.visibility?.fieldKey && !keys.has(section.visibility.fieldKey))
			return `${section.title}: conditional visibility refers to a missing field.`;
	}
	return '';
}

function PreviewField({ field, branches = [] }) {
	const textCase =
		field.textCase || (field.forceUppercase ? 'uppercase' : 'none');
	const common = {
		name: field.key,
		required: Boolean(field.required),
		placeholder: field.placeholder || undefined,
		defaultValue: field.defaultValue || '',
		style: {
			textTransform:
				textCase === 'uppercase'
					? 'uppercase'
					: textCase === 'lowercase'
						? 'lowercase'
						: undefined,
		},
	};

	if (field.type === 'textarea') return <textarea {...common} rows={3} />;
	if (field.type === 'checkbox')
		return (
			<input
				{...common}
				type="checkbox"
				defaultChecked={field.defaultValue === true || field.defaultValue === 'true'}
			/>
		);
	if (['file', 'photo', 'document'].includes(field.type))
		return (
			<input
				{...common}
				type="file"
				accept={field.type === 'photo' ? 'image/*' : undefined}
			/>
		);
	if (field.type === 'select')
		return (
			<select {...common} defaultValue={field.defaultValue || ''}>
				<option value="">Select...</option>
				{field.options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		);
	if (field.type === 'branch') {
		const options = branchOptionsForField(field, branches);
		return (
			<select {...common} defaultValue={field.defaultValue || ''}>
				<option value="">Select branch...</option>
				{options.map((branch) => (
					<option key={branch.id} value={branch.id}>
						{branch.name}
					</option>
				))}
			</select>
		);
	}
	if (field.type === 'radio')
		return (
			<div className="dfb-radio-options">
				{field.options.map((option) => (
					<label key={option}>
						<input
							type="radio"
							name={field.key}
							value={option}
							required={Boolean(field.required)}
						/>
						{option}
					</label>
				))}
			</div>
		);
	if (field.type === 'table')
		return (
			<div className="dfb-table-preview">
				Marks table ({Number(field.rows) > 0 ? Number(field.rows) : 5} rows)
			</div>
		);
	return <input {...common} type={field.type} />;
}

// The form builder. An administrator builds and publishes the admission
// forms. A staff member that has the "Dynamic Forms" page can open the
// screen to read the forms, but cannot change them.
export default function DynamicFormBuilder({ canManage = true }) {
	const importRef = useRef(null);
	const [forms, setForms] = useState([]);
	const [formView, setFormView] = useState('list');
	const [selected, setSelected] = useState(null);
	const [listAcademicYear, setListAcademicYear] = useState('');
	const [listCourseId, setListCourseId] = useState('');
	const [listFormTypeId, setListFormTypeId] = useState('');
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [collegeId, setCollegeId] = useState('');
	const [showCollegeLogo, setShowCollegeLogo] = useState(false);
	const [colleges, setColleges] = useState([]);
	const [courses, setCourses] = useState([]);
	const [academicYears, setAcademicYears] = useState([]);
	const [formTypes, setFormTypes] = useState([]);
	const [profileFields, setProfileFields] = useState([]);
	const [applicationFee, setApplicationFee] = useState('0');
	const [enabledForStudents, setEnabledForStudents] = useState(true);
	const [enableBranchSelection, setEnableBranchSelection] = useState(false);
	const [allowedAdmissionTypes, setAllowedAdmissionTypes] = useState(
		defaultAdmissionTypes,
	);
	const [courseId, setCourseId] = useState('');
	const [academicYear, setAcademicYear] = useState('');
	const [formTypeId, setFormTypeId] = useState('');
	const [formLayout, setFormLayout] = useState('cards');
	const [sections, setSections] = useState(defaultSections);
	const [activeSectionId, setActiveSectionId] = useState('general');
	const [editingFieldIndex, setEditingFieldIndex] = useState(null);
	const [fieldDraft, setFieldDraft] = useState(null);
	const [fieldDraftMoveTo, setFieldDraftMoveTo] = useState('');
	const [inlineMoveInputs, setInlineMoveInputs] = useState({});
	const [sectionDraft, setSectionDraft] = useState(null);
	const [newSectionTitle, setNewSectionTitle] = useState('');
	const [fields, setFields] = useState([]);
	const [branches, setBranches] = useState([]);
	const [bulkDraft, setBulkDraft] = useState(null);
	const [preview, setPreview] = useState(false);
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	// A published form can be changed like a draft. Saving a change applies it
	// to the live form straight away. A staff member may only read a form.
	const readOnly = !canManage;
	const published = selected?.status === 'published';
	const locked = readOnly;

	async function loadForms() {
		try {
			const [
				formsResult,
				collegesResult,
				coursesResult,
				yearsResult,
				formTypesResult,
				profileFieldsResult,
				branchesResult,
			] = await Promise.all([
				supabase
					.from('admission_forms')
					.select('*')
					.order('created_at', { ascending: false }),
				supabase.from('colleges').select('id,name,logo_url').order('name'),
				supabase.from('courses').select('id,name,code,college_id').order('name'),
				supabase.from('academic_years').select('id,name').order('name', { ascending: false }),
				supabase.from('form_types').select('id,name').eq('active', true).order('name'),
				supabase.from('student_profile_fields').select('id,label,key,input_type,required,default_value,force_uppercase,text_case,options').order('display_order'),
				supabase.from('branches').select('id,name,course_id,college_id,active').order('name'),
			]);
			// The forms are the important part of the screen. A failing lookup
			// of a reference list must never empty the list, so the lookups
			// are handled one by one and only the forms stop the load.
			if (formsResult.error) {
				setMessage(formsResult.error.message);
				return formsResult.error.message;
			}
			setForms(formsResult.data ?? []);
			const lookups = [
				[collegesResult, setColleges],
				[coursesResult, setCourses],
				[yearsResult, setAcademicYears],
				[formTypesResult, setFormTypes],
				[profileFieldsResult, setProfileFields],
				[branchesResult, setBranches],
			];
			const failed = lookups.filter(([result]) => result.error);
			for (const [result, apply] of lookups) {
				if (!result.error) apply(result.data ?? []);
			}
			if (failed.length) {
				// The list stays usable, the reference lists keep the values
				// that were loaded before.
				const message = `The admission forms are listed, but some reference lists could not be loaded: ${failed
					.map(([result]) => result.error.message)
					.join(' | ')}`;
				setMessage(message);
				return message;
			}
			return null;
		} catch (error) {
			const message = errorMessage(error);
			setMessage(message);
			return message;
		} finally {
			setLoading(false);
		}
	}

	async function exportForms() {
		try {
			await downloadExcel({
				fileName: 'svit-admission-forms',
				sheetName: 'Form drafts and versions',
				columns: [
					...formExcelColumns,
					{ key: 'status', label: 'Status' },
					{ key: 'created_at', label: 'Created at' },
				],
				rows: forms.map((form) => ({
					...form,
					fields: JSON.stringify(form.fields ?? []),
				})),
			});
		} catch (error) {
			setMessage(errorMessage(error));
		}
	}

	async function downloadFormTemplate() {
		try {
			await downloadExcelTemplate({
				fileName: 'svit-admission-form-template',
				sheetName: 'Draft forms',
				columns: formExcelColumns,
				instructions: [
					'Imported forms are always saved as drafts; publish them from Form Builder after review.',
					'Fields JSON must be a JSON array. Example: [{"key":"full_name","label":"Full name","type":"text","required":true}].',
					'Supported types: text, email, number, date, textarea, select, checkbox, file, photo, document.',
				],
			});
		} catch (error) {
			setMessage(errorMessage(error));
		}
	}

	async function importForms(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		if (!canManage) {
			setMessage('Only an administrator can import admission forms.');
			return;
		}
		setBusy(true);
		setMessage('');
		let imported = 0;
		try {
			const rows = await readExcelRows(file, formExcelColumns);
			const formsToInsert = rows.map((row, index) => {
					let parsedFields;
					try {
						parsedFields =
							typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields;
					} catch {
						throw new Error(`Row ${index + 2}: Fields JSON is invalid.`);
					}
					if (!Array.isArray(parsedFields))
						throw new Error(`Row ${index + 2}: Fields JSON must be an array.`);
					const fields = parsedFields.map((field) => {
						if (!field || typeof field !== 'object' || Array.isArray(field))
							throw new Error(`Row ${index + 2}: every field must be an object.`);
						return {
							key: typeof field.key === 'string' ? field.key.trim() : '',
							label: typeof field.label === 'string' ? field.label.trim() : '',
							type: field.type,
							required: field.required === true,
							placeholder:
								typeof field.placeholder === 'string' ? field.placeholder : '',
							options: Array.isArray(field.options)
								? field.options.map((option) =>
										typeof option === 'string' ? option.trim() : '',
									).filter(Boolean)
								: [],
						};
					});
					const title = String(row.title ?? '').trim();
					const validationError = validateFormDefinition(title, fields, defaultSections(), true);
					if (validationError)
						throw new Error(`Row ${index + 2}: ${validationError}`);
					return {
						title,
						description: String(row.description ?? '').trim(),
						fields,
						status: 'draft',
					};
			});

			for (let offset = 0; offset < formsToInsert.length; offset += 100) {
				const batch = formsToInsert.slice(offset, offset + 100);
				const { error } = await supabase.from('admission_forms').insert(batch);
				if (error)
					throw new Error(
						`${imported} forms imported before row ${offset + 2} failed: ${error.message}`,
					);
				imported += batch.length;
			}
			const refreshError = await loadForms();
			setMessage(
				refreshError
					? `Imported ${imported} draft forms, but the list could not be refreshed: ${refreshError}`
					: `Imported ${formsToInsert.length} draft forms. Review them before publishing.`,
			);
		} catch (error) {
			setMessage(errorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		void loadForms();
	}, []);

	function resetForm() {
		setSelected(null);
		setTitle('');
		setDescription('');
		setCollegeId('');
		setShowCollegeLogo(false);
		setApplicationFee('0');
		setEnabledForStudents(true);
		setEnableBranchSelection(false);
		setAllowedAdmissionTypes(defaultAdmissionTypes);
		setCourseId('');
		setAcademicYear('');
		setFormTypeId('');
		setFormLayout('cards');
		setSections(defaultSections());
		setActiveSectionId('general');
		setFields([]);
		setFieldDraft(null);
		setEditingFieldIndex(null);
		setSectionDraft(null);
		setBulkDraft(null);
		setPreview(false);
		setMessage('');
	}

	function editForm(form, { copy = false, duplicate = false } = {}) {
		const asDraft = copy || duplicate;
		setFormView('editor');
		setSelected(asDraft ? null : form);
		setTitle(
			duplicate
				? `${form.title} (New Version)`
				: copy
					? `${form.title} (Copy)`
					: form.title,
		);
		setDescription(form.description || '');
		setCollegeId(form.college_id || '');
		setShowCollegeLogo(Boolean(form.show_college_logo));
		setApplicationFee(String((Number(form.application_fee_paise) || 0) / 100));
		setEnabledForStudents(form.enabled_for_students !== false);
		setEnableBranchSelection(Boolean(form.enable_branch_selection));
		setAllowedAdmissionTypes(
			normalizeAdmissionTypes(form.allowed_admission_types),
		);
		setCourseId(form.course_id || '');
		setAcademicYear(form.academic_year || '');
		setFormTypeId(form.form_type_id || '');
		setFormLayout(form.form_layout || 'cards');
		const savedSections = Array.isArray(form.form_sections) && form.form_sections.length
			? form.form_sections
			: defaultSections();
		setSections(savedSections);
		setActiveSectionId(savedSections[0].id);
		setFields(
			Array.isArray(form.fields)
				? form.fields.map((field) => ({
						...emptyField(),
						...field,
						sectionId: field.sectionId || savedSections[0].id,
						visibility: field.visibility || { fieldKey: '', operator: 'equals', value: '' },
					}))
				: [],
		);
		setFieldDraft(null);
		setEditingFieldIndex(null);
		setFieldDraftMoveTo('');
		setSectionDraft(null);
		setPreview(false);
		setMessage(
			duplicate
				? 'Editing a new draft version of the published form. Save it to create the new version.'
				: copy
					? 'Editing a copy. Save it to create a new draft form.'
					: '',
		);
	}

	function updateField(index, key, value) {
		setFields((current) =>
			current.map((field, fieldIndex) =>
				fieldIndex === index
					? {
							...field,
							[key]: value,
							...(key === 'label' && !field.key
								? { key: makeKey(value) }
								: {}),
						}
					: field,
			),
		);
	}

	function openFieldEditor(index = null) {
		setEditingFieldIndex(index);
		setFieldDraft(
			index === null
				? { ...emptyField(), sectionId: activeSectionId }
				: {
						...emptyField(),
						...fields[index],
						visibility: fields[index].visibility || {
							fieldKey: '',
							operator: 'equals',
							value: '',
						},
					},
		);
		// The box starts on the place the field has now.
		setFieldDraftMoveTo(
			index === null ? '' : String(fieldPositionInSection(fields, index) + 1),
		);
	}

	// The number of fields of the section that the field editor works with.
	// A new field is added at the end, so it may use one number more.
	function draftSectionFieldCount(sectionId) {
		const count = fields.filter((field) => field.sectionId === sectionId).length;
		return editingFieldIndex === null ? count + 1 : count;
	}

	// The branches of the course that is selected for this form. They are the
	// options of a "Branch Selection" field.
	function courseBranches() {
		if (!courseId) return branches;
		return branches.filter(
			(branch) => branch.course_id === courseId && branch.active !== false,
		);
	}

	// Opens the panel that adds several fields in one go, either from the
	// field types or from the student profile fields.
	function openBulkAdd() {
		const types = {};
		for (const type of fieldTypes) {
			types[type] = { checked: false, label: defaultFieldLabels[type] };
		}
		setBulkDraft({ tab: 'types', types, profiles: {} });
	}

	function toggleBulkType(type, checked) {
		setBulkDraft((current) => ({
			...current,
			types: {
				...current.types,
				[type]: { ...current.types[type], checked },
			},
		}));
	}

	function setBulkTypeLabel(type, label) {
		setBulkDraft((current) => ({
			...current,
			types: {
				...current.types,
				[type]: { ...current.types[type], label },
			},
		}));
	}

	function toggleBulkProfile(profileId, checked) {
		setBulkDraft((current) => ({
			...current,
			profiles: { ...current.profiles, [profileId]: checked },
		}));
	}

	function toggleAllBulkTypes(checked) {
		setBulkDraft((current) => ({
			...current,
			types: Object.fromEntries(
				Object.entries(current.types).map(([type, config]) => [
					type,
					{ ...config, checked },
				]),
			),
		}));
	}

	function toggleAllBulkProfiles(checked) {
		setBulkDraft((current) => ({
			...current,
			profiles: Object.fromEntries(
				profileFields.map((profile) => [profile.id, checked]),
			),
		}));
	}

	// Adds every selected field in one step. Keys that are already used get a
	// numeric suffix so that the form stays valid.
	function bulkAddFields() {
		if (!bulkDraft) return;
		const usedKeys = new Set(fields.map((field) => field.key).filter(Boolean));
		const added = [];
		const addField = (field) => {
			const base = field.key || makeKey(field.label);
			added.push({ ...field, key: uniqueFieldKey(base, usedKeys) });
		};

		for (const type of fieldTypes) {
			const config = bulkDraft.types[type];
			if (!config?.checked) continue;
			const label = (config.label || '').trim() || fieldTypeLabels[type];
			addField({
				...emptyField(),
				label,
				key: '',
				type,
				sectionId: activeSectionId,
				options:
					type === 'select'
						? ['Option 1', 'Option 2']
						: type === 'branch'
							? courseBranches().map((branch) => branch.id)
							: [],
			});
		}

		for (const profile of profileFields) {
			if (!bulkDraft.profiles[profile.id]) continue;
			addField({
				...emptyField(),
				label: profile.label,
				key: profile.key,
				type: profileFieldType(profile),
				required: Boolean(profile.required),
				defaultValue: profile.default_value || '',
				forceUppercase: Boolean(profile.force_uppercase),
				textCase:
					profile.text_case ||
					(profile.force_uppercase ? 'uppercase' : 'none'),
				options: Array.isArray(profile.options) ? profile.options : [],
				profileFieldId: profile.id,
				sectionId: activeSectionId,
			});
		}

		if (!added.length) {
			setMessage('Select at least one field to add.');
			return;
		}
		setFields((current) => [...current, ...added]);
		setBulkDraft(null);
		setMessage(
			`${added.length} field${added.length === 1 ? '' : 's'} added to ${
				sections.find((section) => section.id === activeSectionId)?.title ??
				'the section'
			}.`,
		);
	}

	// Moves a field up or down inside its own section.
	function moveField(index, offset) {
		setFields((current) => moveFieldInList(current, index, offset));
	}

	// Moves a field directly to the given Sr. No. inside its own section.
	function moveFieldToSr(index, sr) {
		const target = Number(sr);
		if (!Number.isFinite(target) || target < 1) return;
		setFields((current) => moveFieldToPosition(current, index, target - 1));
		setInlineMoveInputs((current) => ({ ...current, [index]: '' }));
	}

	function saveFieldDraft(event) {
		event.preventDefault();
		const nextField = {
			...fieldDraft,
			label: fieldDraft.label.trim(),
			key: (fieldDraft.key || makeKey(fieldDraft.label)).trim(),
			options: (fieldDraft.options || []).map((option) => option.trim()).filter(Boolean),
			sectionId: fieldDraft.sectionId || activeSectionId,
		};
		if (!nextField.label || !nextField.key) {
			setMessage('Field label and key are required.');
			return;
		}
		if (
			fields.some(
				(field, index) => field.key === nextField.key && index !== editingFieldIndex,
			)
		) {
			setMessage(`Duplicate key: ${nextField.key}.`);
			return;
		}
		if (nextField.type === 'select' && !nextField.options.length) {
			setMessage(`${nextField.label}: add at least one option.`);
			return;
		}
		if (nextField.copyFromCheckbox && !nextField.copyFromFieldKey) {
			setMessage(`${nextField.label}: choose the field to copy from.`);
			return;
		}
		// The place the field gets in its section. An empty box keeps the
		// place the field has now.
		const moveTarget = fieldDraftMoveTo.trim()
			? Number(fieldDraftMoveTo) - 1
			: null;
		if (moveTarget !== null && (!Number.isFinite(moveTarget) || moveTarget < 0)) {
			setMessage('The Sr. No. must be a number of 1 or more.');
			return;
		}
		const nextFields =
			editingFieldIndex === null
				? [...fields, nextField]
				: fields.map((field, index) =>
						index === editingFieldIndex ? nextField : field,
					);
		const fieldIndex =
			editingFieldIndex === null ? nextFields.length - 1 : editingFieldIndex;
		const oldPosition = fieldPositionInSection(nextFields, fieldIndex);
		const reordered =
			moveTarget === null
				? nextFields
				: moveFieldToPosition(nextFields, fieldIndex, moveTarget);
		// The field can be on another place of the list after the move, so it
		// is looked up again.
		const movedIndex = reordered.findIndex((field) => field === nextField);
		const newPosition = fieldPositionInSection(reordered, movedIndex);
		setFields(reordered);
		setActiveSectionId(nextField.sectionId);
		setFieldDraft(null);
		setEditingFieldIndex(null);
		setFieldDraftMoveTo('');
		setMessage(
			moveTarget !== null && newPosition >= 0 && newPosition !== oldPosition
				? `${nextField.label} is now Sr. No. ${newPosition + 1}.`
				: '',
		);
	}

	function addSection(event) {
		event.preventDefault();
		const sectionTitle = newSectionTitle.trim();
		if (!sectionTitle) return;
		const section = {
			id: crypto.randomUUID(),
			title: sectionTitle,
			layout: 'columns',
			visibility: null,
		};
		setSections((current) => [...current, section]);
		setActiveSectionId(section.id);
		setNewSectionTitle('');
	}

	function saveSection(event) {
		event.preventDefault();
		if (!sectionDraft.title.trim()) {
			setMessage('Section title is required.');
			return;
		}
		setSections((current) =>
			current.map((section) =>
				section.id === sectionDraft.id
					? { ...sectionDraft, title: sectionDraft.title.trim() }
					: section,
			),
		);
		setSectionDraft(null);
		setMessage('');
	}

	function moveSection(index, offset) {
		setSections((current) => {
			const nextIndex = index + offset;
			if (nextIndex < 0 || nextIndex >= current.length) return current;
			const reordered = [...current];
			[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
			return reordered;
		});
	}

	function removeSection(section) {
		if (sections.length < 2) {
			setMessage('A form must have at least one section.');
			return;
		}
		const destination = sections.find((item) => item.id !== section.id);
		setFields((current) =>
			current.map((field) =>
				field.sectionId === section.id
					? { ...field, sectionId: destination.id }
					: field,
			),
		);
		setSections((current) => current.filter((item) => item.id !== section.id));
		if (activeSectionId === section.id) setActiveSectionId(destination.id);
	}

	function validate() {
		return validateFormDefinition(title, fields, sections);
	}

	async function save(status) {
		if (busy) return;
		if (!canManage) {
			setMessage('Only an administrator can change an admission form.');
			return;
		}
		// A form that was already published keeps its published status when the
		// changes are saved.
		const wasPublished = selected?.status === 'published';
		const validationError = validate();
		if (validationError) {
			setMessage(validationError);
			return;
		}
		if (status === 'published' && !fields.length) {
			setMessage('Add at least one field before publishing the form.');
			return;
		}
		const feeInPaise = Math.round(Number(applicationFee) * 100);
		if (!Number.isFinite(feeInPaise) || feeInPaise < 0) {
			setMessage('Application fee must be zero or more.');
			return;
		}
		const admissionTypes = normalizeAdmissionTypes(allowedAdmissionTypes);

		setBusy(true);
		setMessage('');
		try {
			const payload = {
				title: title.trim(),
				description: description.trim(),
				college_id: collegeId || null,
				show_college_logo: Boolean(showCollegeLogo),
				course_id: courseId || null,
				academic_year: academicYear || null,
				form_type_id: formTypeId || null,
				application_fee_paise: feeInPaise,
				enabled_for_students: Boolean(enabledForStudents),
				enable_branch_selection: Boolean(enableBranchSelection),
				allowed_admission_types: admissionTypes.length ? admissionTypes : ['Regular'],
				form_layout: formLayout,
				form_sections: sections,
				fields: fields.map((field) => ({
					...field,
					options: ['select', 'radio', 'branch'].includes(field.type)
						? field.options.map((option) => option.trim()).filter(Boolean)
						: [],
				})),
				status,
			};
			const result = selected
				? await supabase
						.from('admission_forms')
						.update(payload)
						.eq('id', selected.id)
				: await supabase.from('admission_forms').insert(payload);
			if (result.error) {
				setMessage(result.error.message);
				return;
			}
			const refreshError = await loadForms();
			resetForm();
			setFormView('list');
			setMessage(
				refreshError
					? `Form saved, but the screen could not be fully refreshed: ${refreshError}`
					: wasPublished
						? 'The changes were saved to the published form. The students see them straight away.'
						: status === 'published'
							? 'Form published.'
							: 'Draft saved.',
			);
		} catch (error) {
			setMessage(errorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function removeDraft() {
		if (!selected || locked || busy || !canManage) return;
		if (!window.confirm('Delete this draft form?')) return;
		setBusy(true);
		try {
			const { error } = await supabase
				.from('admission_forms')
				.delete()
				.eq('id', selected.id);
			if (error) {
				setMessage(error.message);
				return;
			}
			resetForm();
			const refreshError = await loadForms();
			setFormView('list');
			setMessage(
				refreshError
					? `Draft deleted, but the screen could not be fully refreshed: ${refreshError}`
					: 'Draft deleted.',
			);
		} catch (error) {
			setMessage(errorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function removeForm(form) {
		if (form.status === 'published' || busy || !canManage) return;
		if (!window.confirm(`Delete draft "${form.title}"?`)) return;
		setBusy(true);
		try {
			const { error } = await supabase
				.from('admission_forms')
				.delete()
				.eq('id', form.id);
			if (error) {
				setMessage(error.message);
				return;
			}
			const refreshError = await loadForms();
			setMessage(
				refreshError
					? `Draft deleted, but the screen could not be fully refreshed: ${refreshError}`
					: 'Draft deleted.',
			);
		} catch (error) {
			setMessage(errorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	function duplicatePublished() {
		setSelected(null);
		setTitle(`${title} (New Version)`);
		setPreview(false);
		setMessage('Editing a new draft copy. Save it to create the new version.');
	}

	const filteredForms = forms.filter(
		(form) =>
			(!listAcademicYear || form.academic_year === listAcademicYear) &&
			(!listCourseId || form.course_id === listCourseId) &&
			(!listFormTypeId || form.form_type_id === listFormTypeId),
	);
	// The fields of the section that is open in the schema builder. The
	// position is used to enable the move up and move down buttons.
	const sectionFieldRows = fields
		.map((field, index) => ({ field, index }))
		.filter(({ field }) => field.sectionId === activeSectionId);
	const activeSectionTitle =
		sections.find((section) => section.id === activeSectionId)?.title ?? '';

	return (
		<div className="dfb">
			<div className="dfb-top">
				<div>
					<h2>Manage Admission Forms</h2>
					<p>Create, configure, and manage admission forms.</p>
				</div>
				<div className="excel-tools">
					<button type="button" onClick={() => void exportForms()}>
						Export Excel
					</button>
					{canManage && (
						<>
							<button type="button" onClick={() => void downloadFormTemplate()}>
								Download template
							</button>
							<button
								type="button"
								disabled={busy}
								onClick={() => importRef.current?.click()}
							>
								Import drafts
							</button>
						</>
					)}
					<input
						ref={importRef}
						className="excel-file-input"
						type="file"
						accept=".xlsx"
						aria-label="Import admission form drafts from Excel"
						onChange={(event) => void importForms(event)}
					/>
					{canManage && (
						<button
							type="button"
							className="dfb-primary"
							onClick={() => {
								resetForm();
								setFormView('editor');
							}}
						>
							Add New Admission Form
						</button>
					)}
				</div>
			</div>
			{formView === 'list' ? (
				<section className="dfb-forms-list">
					<div className="dfb-list-filters">
						<label>
							Academic Year
							<select value={listAcademicYear} onChange={(event) => setListAcademicYear(event.target.value)}>
								<option value="">All Years</option>
								{[...new Set(forms.map((form) => form.academic_year).filter(Boolean))]
									.sort((a, b) => b.localeCompare(a))
									.map((year) => <option key={year} value={year}>{year}</option>)}
							</select>
						</label>
						<label>
							Course
							<select value={listCourseId} onChange={(event) => setListCourseId(event.target.value)}>
								<option value="">All Courses</option>
								{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
							</select>
						</label>
						<label>
							Form Type
							<select value={listFormTypeId} onChange={(event) => setListFormTypeId(event.target.value)}>
								<option value="">All Types</option>
								{formTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
							</select>
						</label>
						<strong className="dfb-result-count">
							{filteredForms.length} {filteredForms.length === 1 ? 'Form' : 'Forms'} Found
						</strong>
					</div>
					{message && <p className="dfb-message" role="status">{message}</p>}
					{loading ? (
						<p>Loading forms...</p>
					) : (
						<div className="dfb-forms-table-wrap">
							<table className="dfb-forms-table">
								<thead>
									<tr><th>Course</th><th>Admission Cycle</th><th>Type</th><th>Actions</th></tr>
								</thead>
								<tbody>
									{filteredForms.map((form) => {
										const course = courses.find((item) => item.id === form.course_id);
										const type = formTypes.find((item) => item.id === form.form_type_id);
										return (
											<tr key={form.id}>
												<td>
													<strong>{course?.name || form.title}</strong>
													{course?.code && <small>{course.code}</small>}
												</td>
												<td>{form.academic_year || '—'}</td>
												<td>
													{type && <span className="dfb-type-badge">{type.name}</span>}
													<span className={`dfb-status-badge ${form.enabled_for_students === false ? 'disabled' : 'enabled'}`}>
														{form.enabled_for_students === false ? 'Disabled' : 'Enabled'}
													</span>
													<span className={`dfb-draft-badge ${form.status === 'published' ? 'published' : 'draft'}`}>
														{form.status === 'published' ? 'Published' : 'Draft'}
													</span>
												</td>
												<td className="dfb-row-actions">
													{readOnly ? (
														<button
															type="button"
															className="dfb-edit-action"
															title="Open the form to read it"
															onClick={() => editForm(form)}
														>
															View
														</button>
													) : form.status === 'published' ? (
														<>
															<button
																type="button"
																className="dfb-edit-action"
																title="Edit the published form. The changes are applied to the live form as soon as they are saved."
																onClick={() => editForm(form)}
															>
																Edit
															</button>
															<button
																type="button"
																title="Create an editable copy of this published form as a new draft"
																onClick={() => editForm(form, { duplicate: true })}
															>
																Duplicate
															</button>
														</>
													) : (
														<>
															<button type="button" className="dfb-edit-action" onClick={() => editForm(form)}>Edit</button>
															<button type="button" onClick={() => editForm(form, { copy: true })}>Copy</button>
														</>
													)}
													{canManage && (
														<button
															type="button"
															className="dfb-delete-action"
															disabled={form.status === 'published' || busy}
															title={form.status === 'published' ? 'A published form cannot be deleted. Take it out of service with "Enabled for Students" instead.' : 'Delete draft'}
															onClick={() => void removeForm(form)}
														>
															Delete
														</button>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
							{!filteredForms.length && <p className="dfb-empty">No admission forms match these filters.</p>}
						</div>
					)}
				</section>
			) : (
				<section className="dfb-editor">
					<div className="dfb-bar">
						<div className="dfb-editor-heading">
							<h3>
								{readOnly
									? 'Admission Form'
									: published
										? 'Edit Published Admission Form'
										: selected
											? 'Edit Admission Form'
											: 'Create New Admission Form'}
							</h3>
							<button type="button" onClick={() => setFormView('list')}>← Back</button>
						</div>
						<button type="button" onClick={() => setPreview((current) => !current)}>
							{preview ? 'Edit fields' : 'Live preview'}
						</button>
					</div>
					{message && (
						<p className="dfb-message" role="status">
							{message}
						</p>
					)}
					{readOnly && (
						<div className="dfb-notice dfb-notice-readonly" role="status">
							<strong>You can read the admission forms, but not change them.</strong>
							<p>
								Only an administrator can create, edit, publish and delete an admission
								form. Ask an administrator if a form has to be changed.
							</p>
						</div>
					)}
					{published && !readOnly && (
						<div className="dfb-notice dfb-notice-published" role="status">
							<strong>This form is published and is live for students.</strong>
							<p>
								You can change it here. Saving applies the change to the live form
								straight away, so the students who have not applied yet see the new
								questions. The applications that are already submitted keep their own
								answers. Use <strong>Duplicate as new version</strong> when this form
								has to stay as it is.
							</p>
						</div>
					)}
					<label>
						Form title
						<input
							disabled={locked}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="e.g. Diploma Admission 2026"
						/>
					</label>
					<label>
						Description
						<textarea
							disabled={locked}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows="2"
						/>
					</label>
					<div className="dfb-form-grid">
						<label>
							Course
							<select
								disabled={locked}
								value={courseId}
								onChange={(event) => {
									const nextCourseId = event.target.value;
									setCourseId(nextCourseId);
									const selectedCourse = courses.find((course) => course.id === nextCourseId);
									if (selectedCourse?.college_id) setCollegeId(selectedCourse.college_id);
								}}
							>
								<option value="">Select Course</option>
								{courses
									.filter((course) => !collegeId || !course.college_id || course.college_id === collegeId)
									.map((course) => (
										<option key={course.id} value={course.id}>{course.name}</option>
									))}
							</select>
						</label>
						<label>
							Admission Cycle
							<select
								disabled={locked}
								value={academicYear}
								onChange={(event) => setAcademicYear(event.target.value)}
							>
								<option value="">Select Cycle</option>
								{academicYears.map((year) => (
									<option key={year.id} value={year.name}>{year.name}</option>
								))}
							</select>
						</label>
						<label>
							Form Type
							<select
								disabled={locked}
								value={formTypeId}
								onChange={(event) => setFormTypeId(event.target.value)}
							>
								<option value="">Select Form Type</option>
								{formTypes.map((type) => (
									<option key={type.id} value={type.id}>{type.name}</option>
								))}
							</select>
						</label>
						<label>
							Application Form Fee (₹)
							<input
								disabled={locked}
								type="number"
								min="0"
								step="0.01"
								value={applicationFee}
								onChange={(event) => setApplicationFee(event.target.value)}
							/>
						</label>
						<label>
							College
							<select
								disabled={locked}
								value={collegeId}
								onChange={(event) => setCollegeId(event.target.value)}
							>
								<option value="">Select college</option>
								{colleges.map((college) => (
									<option key={college.id} value={college.id}>{college.name}</option>
								))}
							</select>
						</label>
					</div>
					<div className="dfb-form-options">
						<label className="dfb-check">
							<input
								type="checkbox"
								disabled={locked}
								checked={enabledForStudents}
								onChange={(event) => setEnabledForStudents(event.target.checked)}
							/>
							Enabled for Students
						</label>
						<label className="dfb-check">
							<input
								type="checkbox"
								disabled={locked}
								checked={enableBranchSelection}
								onChange={(event) => setEnableBranchSelection(event.target.checked)}
							/>
							Enable Branch Selection
						</label>
						<label className="dfb-logo-toggle">
							<input
								type="checkbox"
								disabled={locked || !collegeId}
								checked={showCollegeLogo}
								onChange={(event) => setShowCollegeLogo(event.target.checked)}
							/>
							Show college logo on this admission form
						</label>
					</div>
					<div className="dfb-admission-types">
						<span className="dfb-field-label">Admission Types</span>
						<div className="dfb-admission-type-options">
							{admissionTypeOptions.map((option) => (
								<label className="dfb-check" key={option.value}>
									<input
										type="checkbox"
										disabled={locked}
										checked={allowedAdmissionTypes.includes(option.value)}
										onChange={(event) =>
											setAllowedAdmissionTypes((current) =>
												event.target.checked
													? [...current, option.value]
													: current.filter((item) => item !== option.value),
											)
										}
									/>
									{option.label}
								</label>
							))}
							{/* A type that an older form already uses is kept. */}
							{allowedAdmissionTypes
								.filter(
									(value) =>
										!admissionTypeOptions.some((option) => option.value === value),
								)
								.map((value) => (
									<label className="dfb-check" key={value}>
										<input
											type="checkbox"
											disabled={locked}
											checked
											onChange={() =>
												setAllowedAdmissionTypes((current) =>
													current.filter((item) => item !== value),
												)
											}
										/>
										{admissionTypeLabel(value)}
									</label>
								))}
						</div>
						<small>
							The student picks one of the allowed types on the admission form. When no
							type is ticked, only Regular admission is allowed.
						</small>
					</div>
					{preview ? (
						<div className={`dfb-preview dfb-preview-${formLayout}`}>
							{showCollegeLogo &&
								colleges.find((college) => college.id === collegeId)?.logo_url && (
									<img
										className="dfb-college-logo"
										src={colleges.find((college) => college.id === collegeId).logo_url}
										alt={`${colleges.find((college) => college.id === collegeId).name} logo`}
									/>
								)}
							<h3>{title || 'Untitled Form'}</h3>
							{description && <p>{description}</p>}
							<dl className="dfb-preview-meta">
								{[
									['Course', courses.find((course) => course.id === courseId)?.name],
									['Admission Cycle', academicYear],
									['Form Type', formTypes.find((type) => type.id === formTypeId)?.name],
									['Application Fee', `₹${Number(applicationFee || 0).toFixed(2)}`],
									['Admission Types', allowedAdmissionTypes.map(admissionTypeLabel).join(', ') || 'Regular'],
								].map(([label, value]) => value && (
									<div key={label}>
										<dt>{label}</dt>
										<dd>{value}</dd>
									</div>
								))}
							</dl>
							{enableBranchSelection && <p className="dfb-preview-branch-note">Students will choose a branch when they apply.</p>}
							{sections.map((section) => (
								<fieldset className="dfb-preview-section" key={section.id}>
									<legend>{section.title}</legend>
									<div className={`dfb-preview-fields dfb-section-${section.layout}`}>
										{fields
											.filter((field) => field.sectionId === section.id)
											.map((field) => (
												<label
													className={`dfb-width-${field.width || 'full'}`}
													key={field.key}
												>
													{field.label || 'Untitled field'}
													{field.required && ' *'}
													<PreviewField
														field={field}
														branches={courseBranches()}
													/>
												</label>
											))}
									</div>
								</fieldset>
							))}
							<p>Preview only. No application will be submitted.</p>
						</div>
					) : (
						<>
							<h3>Form Schema Builder</h3>
							<div className="dfb-schema">
								<aside className="dfb-schema-sidebar">
									<label>
										Form Layout
										<select
											disabled={locked}
											value={formLayout}
											onChange={(event) => setFormLayout(event.target.value)}
										>
											<option value="cards">Cards (Vertical Sections)</option>
											<option value="tabs">Tabs (Horizontal)</option>
											<option value="simple">Simple List (Legacy)</option>
										</select>
									</label>
									<h4>Sections</h4>
									<form className="dfb-add-section" onSubmit={addSection}>
										<input
											disabled={locked}
											value={newSectionTitle}
											onChange={(event) => setNewSectionTitle(event.target.value)}
											placeholder="New Section Title"
											aria-label="New section title"
										/>
										<button type="submit" disabled={locked || !newSectionTitle.trim()}>
											Add
										</button>
									</form>
									{sections.map((section, index) => (
										<div
											className={`dfb-section-item ${activeSectionId === section.id ? 'active' : ''}`}
											key={section.id}
										>
											<button
												type="button"
												className="dfb-section-select"
												onClick={() => setActiveSectionId(section.id)}
											>
												{section.title}
											</button>
											<div className="dfb-section-actions">
												<button
													type="button"
													disabled={locked}
													aria-label={`Configure ${section.title}`}
													onClick={() => setSectionDraft({ ...section, visibility: section.visibility || { fieldKey: '', operator: 'equals', value: '' } })}
												>
													⚙
												</button>
												<button type="button" disabled={locked || index === 0} onClick={() => moveSection(index, -1)}>↑</button>
												<button type="button" disabled={locked || index === sections.length - 1} onClick={() => moveSection(index, 1)}>↓</button>
												<button type="button" disabled={locked || sections.length < 2} onClick={() => removeSection(section)} aria-label={`Remove ${section.title}`}>×</button>
											</div>
										</div>
									))}
								</aside>
								<section className="dfb-schema-fields">
									<div className="dfb-bar">
										<div>
											<h4>Fields</h4>
											<strong>{activeSectionTitle}</strong>
											<small className="dfb-sr-hint">
												The Sr. No. shows the order of the field in this section.
											</small>
										</div>
										<div className="dfb-field-actions">
											<button type="button" disabled={locked} onClick={() => openBulkAdd()}>
												Add Fields in Bulk
											</button>
											<button type="button" className="dfb-primary" disabled={locked} onClick={() => openFieldEditor()}>
												Add Field
											</button>
										</div>
									</div>
									{sectionFieldRows.map(({ field, index }, position) => (
										<div className="dfb-schema-field" key={`${field.key}-${index}`}>
											<span
												className="dfb-sr-no"
												title={`Sr. No. ${position + 1} of ${sectionFieldRows.length} in ${activeSectionTitle}`}
											>
												{position + 1}
											</span>
											<div>
												<strong>{field.label}</strong>
												<small>{field.key} · {fieldTypeLabels[field.type] || field.type} · {field.width || 'full'} width</small>
												{field.required && <small>Required</small>}
												{field.profileFieldId && <small>Linked to a student profile field</small>}
											</div>
											<div className="dfb-field-actions">
												<button
													type="button"
													disabled={locked || position === 0}
													onClick={() => moveField(index, -1)}
													aria-label={`Move ${field.label} up`}
													title="Move up"
												>
													↑
												</button>
												<button
													type="button"
													disabled={locked || position === sectionFieldRows.length - 1}
													onClick={() => moveField(index, 1)}
													aria-label={`Move ${field.label} down`}
													title="Move down"
												>
													↓
												</button>
												<input
													type="number"
													min="1"
													max={sectionFieldRows.length}
													value={inlineMoveInputs[index] ?? ''}
													onChange={(event) =>
														setInlineMoveInputs((current) => ({
															...current,
															[index]: event.target.value,
														}))
													}
													onKeyDown={(event) => {
														if (event.key === 'Enter') {
															event.preventDefault();
															moveFieldToSr(index, inlineMoveInputs[index]);
														}
													}}
													disabled={locked}
													aria-label={`Move ${field.label} to Sr. No.`}
													title="Move to Sr. No."
													className="dfb-sr-move-input"
												/>
												<button
													type="button"
													disabled={locked}
													onClick={() => moveFieldToSr(index, inlineMoveInputs[index])}
													aria-label={`Move ${field.label} to Sr. No.`}
													title="Move to Sr. No."
												>
													Move
												</button>
												<button type="button" disabled={locked} onClick={() => openFieldEditor(index)}>Configure</button>
												<button type="button" disabled={locked} onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))}>Remove</button>
											</div>
										</div>
									))}
									{!sectionFieldRows.length && (
										<p className="dfb-empty">No fields in this section.</p>
									)}
								</section>
							</div>
						</>
					)}
					{sectionDraft && (
						<div className="dfb-modal-backdrop" role="presentation">
							<form className="dfb-modal" onSubmit={saveSection}>
								<div className="dfb-bar">
									<h3>Configure Section: {sectionDraft.title}</h3>
									<button type="button" onClick={() => setSectionDraft(null)} aria-label="Close">×</button>
								</div>
								<label>Section Title
									<input value={sectionDraft.title} onChange={(event) => setSectionDraft({ ...sectionDraft, title: event.target.value })} />
								</label>
								<label>Section Layout
									<select value={sectionDraft.layout} onChange={(event) => setSectionDraft({ ...sectionDraft, layout: event.target.value })}>
										<option value="columns">Column Layout (Fields flow in columns)</option>
										<option value="vertical">Vertical Fields</option>
									</select>
								</label>
								<fieldset>
									<legend>Conditional Visibility</legend>
									<div className="dfb-grid">
										<label>Field to Check
											<select value={sectionDraft.visibility.fieldKey} onChange={(event) => setSectionDraft({ ...sectionDraft, visibility: { ...sectionDraft.visibility, fieldKey: event.target.value } })}>
												<option value="">Always visible</option>
												{fields.filter((field) => field.key).map((field) => <option key={field.key} value={field.key}>{field.label || field.key}</option>)}
											</select>
										</label>
										<label>Operator
											<select value={sectionDraft.visibility.operator} onChange={(event) => setSectionDraft({ ...sectionDraft, visibility: { ...sectionDraft.visibility, operator: event.target.value } })}>
												<option value="equals">Equals</option>
												<option value="not_equals">Does not equal</option>
												<option value="contains">Contains</option>
											</select>
										</label>
										<label>Value
											<input value={sectionDraft.visibility.value} onChange={(event) => setSectionDraft({ ...sectionDraft, visibility: { ...sectionDraft.visibility, value: event.target.value } })} />
										</label>
									</div>
									<small>Leave Field to Check empty to show this section unconditionally.</small>
								</fieldset>
								<div className="dfb-footer">
									<button type="button" onClick={() => setSectionDraft(null)}>Cancel</button>
									<button className="dfb-primary">Save Section Settings</button>
								</div>
							</form>
						</div>
					)}
					{bulkDraft && (
						<div className="dfb-modal-backdrop" role="presentation">
							<form className="dfb-modal dfb-bulk-modal" onSubmit={(event) => { event.preventDefault(); bulkAddFields(); }}>
								<div className="dfb-bar">
									<h3>Add Fields in Bulk</h3>
									<button type="button" onClick={() => setBulkDraft(null)} aria-label="Close">×</button>
								</div>
								<p className="dfb-bulk-hint">
									Tick every field you need and add them all in one step. The
									fields are added to <strong>{activeSectionTitle}</strong> and
									can be renamed, moved up or down, or removed afterwards.
								</p>
								<div className="dfb-bulk-tabs">
									<button
										type="button"
										className={bulkDraft.tab === 'types' ? 'active' : ''}
										onClick={() => setBulkDraft({ ...bulkDraft, tab: 'types' })}
									>
										Custom field types
									</button>
									<button
										type="button"
										className={bulkDraft.tab === 'profile' ? 'active' : ''}
										onClick={() => setBulkDraft({ ...bulkDraft, tab: 'profile' })}
									>
										Student profile fields
									</button>
								</div>
								{bulkDraft.tab === 'types' ? (
									<fieldset>
										<legend>Custom field types</legend>
										<div className="dfb-bulk-toolbar">
											<button type="button" onClick={() => toggleAllBulkTypes(true)}>Select all</button>
											<button type="button" onClick={() => toggleAllBulkTypes(false)}>Clear</button>
										</div>
										<div className="dfb-bulk-list">
											{fieldTypes.map((type) => {
												const config = bulkDraft.types[type];
												return (
													<div className="dfb-bulk-row" key={type}>
														<label className="dfb-check">
															<input
																type="checkbox"
																checked={Boolean(config?.checked)}
																onChange={(event) => toggleBulkType(type, event.target.checked)}
															/>
															{fieldTypeLabels[type]}
														</label>
														<input
															aria-label={`${fieldTypeLabels[type]} label`}
															value={config?.label ?? ''}
															placeholder="Field label"
															onChange={(event) => setBulkTypeLabel(type, event.target.value)}
														/>
													</div>
												);
											})}
										</div>
										<small>
											The branch field lists the branches of the selected course. It
											is only available when a course is selected on this form.
										</small>
									</fieldset>
								) : (
									<fieldset>
										<legend>Student profile fields</legend>
										<div className="dfb-bulk-toolbar">
											<button type="button" onClick={() => toggleAllBulkProfiles(true)}>Select all</button>
											<button type="button" onClick={() => toggleAllBulkProfiles(false)}>Clear</button>
										</div>
										{profileFields.length ? (
											<div className="dfb-bulk-list">
												{profileFields.map((profile) => (
													<div className="dfb-bulk-row" key={profile.id}>
														<label className="dfb-check">
															<input
																type="checkbox"
																checked={Boolean(bulkDraft.profiles[profile.id])}
																onChange={(event) => toggleBulkProfile(profile.id, event.target.checked)}
															/>
															{profile.label}
														</label>
														<small>{profile.key} · {profile.input_type}</small>
													</div>
												))}
											</div>
										) : (
											<p className="dfb-empty">No student profile fields are defined yet.</p>
										)}
										<small>
											A ticked profile field is added with its own label, key,
											type and text case, and stays linked to the student profile.
										</small>
									</fieldset>
								)}
								<div className="dfb-footer">
									<button type="button" onClick={() => setBulkDraft(null)}>Cancel</button>
									<button className="dfb-primary">
										Add {bulkDraft.tab === 'types'
											? fieldTypes.filter((type) => bulkDraft.types[type]?.checked).length
											: profileFields.filter((profile) => bulkDraft.profiles[profile.id]).length}{' '}
										field(s)
									</button>
								</div>
							</form>
						</div>
					)}
					{fieldDraft && (
						<div className="dfb-modal-backdrop" role="presentation">
							<form className="dfb-modal dfb-field-modal" onSubmit={saveFieldDraft}>
								<div className="dfb-bar">
									<h3>{editingFieldIndex === null ? 'Add Field' : 'Configure Field'}</h3>
									<button type="button" onClick={() => setFieldDraft(null)} aria-label="Close">×</button>
								</div>
								<fieldset>
									<legend>Link to Student Profile Field</legend>
									<select
										value={fieldDraft.profileFieldId}
										onChange={(event) => {
											const profileField = profileFields.find((item) => item.id === event.target.value);
											setFieldDraft({
												...fieldDraft,
												profileFieldId: event.target.value,
												...(profileField
													? {
															label: profileField.label,
															key: profileField.key,
															type: profileFieldType(profileField),
															required: profileField.required,
															defaultValue: profileField.default_value || '',
															forceUppercase: profileField.force_uppercase,
															textCase: profileField.text_case || (profileField.force_uppercase ? 'uppercase' : 'none'),
															options: Array.isArray(profileField.options) ? profileField.options : [],
														}
													: {}),
											});
										}}
									>
										<option value="">Custom field</option>
										{profileFields.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
									</select>
								</fieldset>
								<label>Section
									<select value={fieldDraft.sectionId} onChange={(event) => setFieldDraft({ ...fieldDraft, sectionId: event.target.value })}>
										{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
									</select>
								</label>
								<label>Move to Sr. No.
									<input
										type="number"
										min="1"
										max={draftSectionFieldCount(fieldDraft.sectionId)}
										value={fieldDraftMoveTo}
										placeholder={editingFieldIndex === null ? 'At the end' : 'Current number'}
										onChange={(event) => setFieldDraftMoveTo(event.target.value)}
									/>
									<small>
										The field gets this number in the section "
										{sections.find((section) => section.id === fieldDraft.sectionId)?.title ?? 'the section'}"
										when the field is saved. Leave the box empty to keep the place it has now.
									</small>
								</label>
								<div className="dfb-grid">
									<label>Label
										<input required value={fieldDraft.label} onChange={(event) => setFieldDraft({ ...fieldDraft, label: event.target.value, ...(fieldDraft.key ? {} : { key: makeKey(event.target.value) }) })} />
									</label>
									<label>Key (unique name)
										<input required pattern="[a-z][a-z0-9_]*" value={fieldDraft.key} onChange={(event) => setFieldDraft({ ...fieldDraft, key: event.target.value })} />
									</label>
									<label>Type
										<select
											value={fieldDraft.type}
											onChange={(event) => {
												const type = event.target.value;
												setFieldDraft({
													...fieldDraft,
													type,
													options:
														type === 'branch'
															? fieldDraft.options.filter((option) =>
																	courseBranches().some((branch) => branch.id === option),
																)
															: type === 'select'
																? fieldDraft.options
																: [],
												});
											}}
										>
											{fieldTypes.map((type) => <option key={type} value={type}>{fieldTypeLabels[type]}</option>)}
										</select>
									</label>
									<label>Column Width
										<select value={fieldDraft.width} onChange={(event) => setFieldDraft({ ...fieldDraft, width: event.target.value })}>
											<option value="full">Full Width</option>
											<option value="half">Half Width</option>
											<option value="third">1/3 Width</option>
											<option value="quarter">1/4 Width</option>
										</select>
									</label>
								</div>
								{fieldDraft.type === 'select' && (
									<label>Options (one per line)
										<textarea rows="3" value={fieldDraft.options.join('\n')} onChange={(event) => setFieldDraft({ ...fieldDraft, options: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} />
									</label>
								)}
								{fieldDraft.type === 'table' && (
									<label>Number of rows
										<input
											type="number"
											min="1"
											value={fieldDraft.rows ?? 5}
											onChange={(event) =>
												setFieldDraft({
													...fieldDraft,
													rows: Number(event.target.value) || 5,
												})
											}
										/>
									</label>
								)}
								{fieldDraft.type === 'branch' && (
									<fieldset>
										<legend>Branch Selection</legend>
										{courseBranches().length ? (
											<div className="dfb-bulk-list">
												{courseBranches().map((branch) => (
													<label className="dfb-check" key={branch.id}>
														<input
															type="checkbox"
															checked={fieldDraft.options.includes(branch.id)}
															onChange={() => {
															const options = fieldDraft.options.includes(branch.id)
																? fieldDraft.options.filter((option) => option !== branch.id)
																: [...fieldDraft.options, branch.id];
															setFieldDraft({ ...fieldDraft, options });
														}}
														/>
														{branch.name}
													</label>
												))}
											</div>
										) : (
											<p className="dfb-empty">
												{courseId
													? 'This course has no branches yet.'
													: 'Select a course on this form to list its branches.'}
											</p>
										)}
										<small>
											Leave every branch unticked to offer all the branches of the
											course. The selected branch is stored with the application.
										</small>
									</fieldset>
								)}
								<label className="dfb-check"><input type="checkbox" checked={fieldDraft.required} onChange={(event) => setFieldDraft({ ...fieldDraft, required: event.target.checked })} />Required</label>
								<label className="dfb-check"><input type="checkbox" checked={fieldDraft.merit} onChange={(event) => setFieldDraft({ ...fieldDraft, merit: event.target.checked })} />Is Merit Field?</label>
								<label>Default Value
									<input value={fieldDraft.defaultValue} onChange={(event) => setFieldDraft({ ...fieldDraft, defaultValue: event.target.value })} />
								</label>
								<label>Text Case
									<select
										value={fieldDraft.textCase || (fieldDraft.forceUppercase ? 'uppercase' : 'none')}
										onChange={(event) => setFieldDraft({
											...fieldDraft,
											textCase: event.target.value,
											forceUppercase: event.target.value === 'uppercase',
										})}
									>
										<option value="none">As entered</option>
										<option value="uppercase">UPPERCASE</option>
										<option value="lowercase">lowercase</option>
									</select>
									<small>Applies to text entered in this field.</small>
								</label>
								<fieldset>
									<legend>Copy &amp; Transformation</legend>
									<label className="dfb-check"><input type="checkbox" disabled={['checkbox', 'file', 'photo', 'document'].includes(fieldDraft.type)} checked={fieldDraft.copyFromCheckbox} onChange={(event) => setFieldDraft({ ...fieldDraft, copyFromCheckbox: event.target.checked, copyFromFieldKey: event.target.checked ? fieldDraft.copyFromFieldKey : '' })} />Enable “Copy From” Checkbox</label>
									{fieldDraft.copyFromCheckbox && (
										<label>Copy from field
											<select value={fieldDraft.copyFromFieldKey} onChange={(event) => setFieldDraft({ ...fieldDraft, copyFromFieldKey: event.target.value })}>
												<option value="">Select source field</option>
												{fields.filter((field) => field.key && field.key !== fieldDraft.key).map((field) => <option key={field.key} value={field.key}>{field.label || field.key}</option>)}
											</select>
										</label>
									)}
								</fieldset>
								<fieldset>
									<legend>Conditional Visibility</legend>
									<div className="dfb-grid">
										<label>Field to Check
											<select value={fieldDraft.visibility.fieldKey} onChange={(event) => setFieldDraft({ ...fieldDraft, visibility: { ...fieldDraft.visibility, fieldKey: event.target.value } })}>
												<option value="">Always visible</option>
												{fields.filter((field) => field.key && field.key !== fieldDraft.key).map((field) => <option key={field.key} value={field.key}>{field.label || field.key}</option>)}
											</select>
										</label>
										<label>Operator
											<select value={fieldDraft.visibility.operator} onChange={(event) => setFieldDraft({ ...fieldDraft, visibility: { ...fieldDraft.visibility, operator: event.target.value } })}>
												<option value="equals">Equals</option>
												<option value="not_equals">Does not equal</option>
												<option value="contains">Contains</option>
											</select>
										</label>
										<label>Value
											<input value={fieldDraft.visibility.value} onChange={(event) => setFieldDraft({ ...fieldDraft, visibility: { ...fieldDraft.visibility, value: event.target.value } })} />
										</label>
									</div>
									<small>Leave Field to Check empty to always show this field.</small>
								</fieldset>
								<div className="dfb-footer">
									<button type="button" onClick={() => setFieldDraft(null)}>Cancel</button>
									<button className="dfb-primary">{editingFieldIndex === null ? 'Add Field' : 'Save Field'}</button>
								</div>
							</form>
						</div>
					)}
					{!readOnly && (
						<div className="dfb-footer">
							{published ? (
								<>
									<button
										type="button"
										className="dfb-primary"
										disabled={busy}
										onClick={() => save('published')}
									>
										Save Changes
									</button>
									<button type="button" disabled={busy} onClick={duplicatePublished}>
										Duplicate as new version
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										disabled={busy}
										onClick={() => save('draft')}
									>
										{selected ? 'Save Draft' : 'Create Form'}
									</button>
									<button
										type="button"
										className="dfb-primary"
										disabled={busy}
										onClick={() => {
											if (
												window.confirm(
													'Publish this form? The students see it as soon as it is published.',
												)
											)
												void save('published');
										}}
									>
										Publish Form
									</button>
									{selected && (
										<button
											type="button"
											disabled={busy}
											onClick={() => void removeDraft()}
										>
											Delete Draft
										</button>
									)}
								</>
							)}
						</div>
					)}
				</section>
			)}
		</div>
	);
}
