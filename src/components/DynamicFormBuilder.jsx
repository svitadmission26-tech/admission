import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import {
	downloadExcel,
	downloadExcelTemplate,
	readExcelRows,
} from '../lib/excel';
import './DynamicFormBuilder.css';

const fieldTypes = [
	'text',
	'email',
	'tel',
	'number',
	'date',
	'textarea',
	'select',
	'radio',
	'checkbox',
];

const emptyField = () => ({
	key: '',
	label: '',
	type: 'text',
	required: false,
	placeholder: '',
	options: [],
});

const makeKey = (label) =>
	label
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');
const formExcelColumns = [
	{ key: 'title', label: 'Form title' },
	{ key: 'description', label: 'Description' },
	{ key: 'fields', label: 'Fields JSON' },
];

function errorMessage(error) {
	return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function validateFormDefinition(title, fields) {
	if (!title.trim()) return 'Form title is required.';
	if (!fields.length) return 'Add at least one field.';
	const keys = new Set();
	for (const field of fields) {
		if (!field.key || !/^[a-z][a-z0-9_]*$/.test(field.key))
			return `Invalid key for ${field.label || 'field'}; use lowercase letters, numbers, and underscores.`;
		if (keys.has(field.key)) return `Duplicate field key: ${field.key}.`;
		keys.add(field.key);
		if (!field.label.trim()) return 'Every field needs a label.';
		if (!fieldTypes.includes(field.type)) return 'Invalid field type.';
		if (['select', 'radio'].includes(field.type)) {
			if (!field.options.length) return `${field.label}: add at least one option.`;
			if (new Set(field.options).size !== field.options.length)
				return `${field.label}: options must be unique.`;
		}
	}
	return '';
}

function PreviewField({ field }) {
	const common = {
		name: field.key,
		required: Boolean(field.required),
		placeholder: field.placeholder || undefined,
	};

	if (field.type === 'textarea') return <textarea {...common} rows={3} />;
	if (field.type === 'checkbox') return <input {...common} type="checkbox" />;
	if (field.type === 'select')
		return (
			<select {...common} defaultValue="">
				<option value="">Select...</option>
				{field.options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		);
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
	return <input {...common} type={field.type} />;
}

export default function DynamicFormBuilder() {
	const importRef = useRef(null);
	const [forms, setForms] = useState([]);
	const [selected, setSelected] = useState(null);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [fields, setFields] = useState([emptyField()]);
	const [preview, setPreview] = useState(false);
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const locked = selected?.status === 'published';

	async function loadForms() {
		try {
			const { data, error } = await supabase
				.from('admission_forms')
				.select('*')
				.order('created_at', { ascending: false });
			if (error) {
				setMessage(error.message);
				return error.message;
			}

			setForms(data ?? []);
			return null;
		} catch (error) {
			const message = errorMessage(error);
			setMessage(message);
			return message;
		} finally {
			setLoading(false);
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
						'Supported types: text, email, tel, number, date, textarea, select, radio, checkbox.',
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
					const validationError = validateFormDefinition(title, fields);
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
	}

	useEffect(() => {
		void loadForms();
	}, []);

	function resetForm() {
		setSelected(null);
		setTitle('');
		setDescription('');
		setFields([emptyField()]);
		setPreview(false);
		setMessage('');
	}

	function editForm(form) {
		setSelected(form);
		setTitle(form.title);
		setDescription(form.description || '');
		setFields(
			Array.isArray(form.fields)
				? form.fields.map((field) => ({ ...emptyField(), ...field }))
				: [],
		);
		setPreview(false);
		setMessage('');
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

	function validate() {
		return validateFormDefinition(title, fields);
	}

	async function save(status) {
		if (busy) return;
		if (locked) {
			setMessage('Published forms are locked. Duplicate one to create a new version.');
			return;
		}
		const validationError = validate();
		if (validationError) {
			setMessage(validationError);
			return;
		}

		setBusy(true);
		setMessage('');
		try {
			const payload = {
				title: title.trim(),
				description: description.trim(),
				fields: fields.map((field) => ({
					...field,
					options: ['select', 'radio'].includes(field.type)
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
			setMessage(
				refreshError
					? `Form saved, but the list could not be refreshed: ${refreshError}`
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
		if (!selected || locked || busy) return;
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
			setMessage(
				refreshError
					? `Draft deleted, but the list could not be refreshed: ${refreshError}`
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

	return (
		<div className="dfb">
			<div className="dfb-top">
				<div>
					<h2>Dynamic Admission Form Builder</h2>
					<p>Create and publish admission forms without changing code.</p>
				</div>
				<div className="excel-tools">
					<button type="button" onClick={() => void exportForms()}>
						Export Excel
					</button>
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
					<input
						ref={importRef}
						className="excel-file-input"
						type="file"
						accept=".xlsx"
						aria-label="Import admission form drafts from Excel"
						onChange={(event) => void importForms(event)}
					/>
					<button type="button" onClick={resetForm}>
						+ New Form
					</button>
				</div>
			</div>
			<div className="dfb-layout">
				<section className="dfb-list">
					<h3>Saved Forms</h3>
					{loading ? (
						<p>Loading forms...</p>
					) : (
						<>
							{forms.map((form) => (
								<button
									type="button"
									key={form.id}
									className={selected?.id === form.id ? 'current' : ''}
									onClick={() => editForm(form)}
								>
									<strong>{form.title}</strong>
									<small>
										{form.status} ·{' '}
										{Array.isArray(form.fields) ? form.fields.length : 0} fields
									</small>
								</button>
							))}
							{!forms.length && <p>No forms created yet.</p>}
						</>
					)}
				</section>
				<section className="dfb-editor">
					<div className="dfb-bar">
						<h3>{selected ? 'Edit Form' : 'New Form'}</h3>
						<button
							type="button"
							onClick={() => setPreview((current) => !current)}
						>
							{preview ? 'Edit fields' : 'Live preview'}
						</button>
					</div>
					{message && (
						<p className="dfb-message" role="status">
							{message}
						</p>
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
					{preview ? (
						<div className="dfb-preview">
							<h3>{title || 'Untitled Form'}</h3>
							{description && <p>{description}</p>}
							{fields.map((field, index) => (
								<label key={`${field.key}-${index}`}>
									{field.label || 'Untitled field'}
									{field.required && ' *'}
									<PreviewField field={field} />
								</label>
							))}
							<p>Preview only. No application will be submitted.</p>
						</div>
					) : (
						<>
							<h3>Form Fields</h3>
							{fields.map((field, index) => (
								<div className="dfb-field" key={index}>
									<div className="dfb-bar">
										<b>Field {index + 1}</b>
										<div className="dfb-field-actions">
											<button
												type="button"
												disabled={locked || index === 0}
												aria-label={`Move field ${index + 1} up`}
												onClick={() =>
													setFields((current) => {
														const reordered = [...current];
														[reordered[index - 1], reordered[index]] = [
															reordered[index],
															reordered[index - 1],
														];
														return reordered;
													})
												}
											>
												↑
											</button>
											<button
												type="button"
												disabled={locked || index === fields.length - 1}
												aria-label={`Move field ${index + 1} down`}
												onClick={() =>
													setFields((current) => {
														const reordered = [...current];
														[reordered[index + 1], reordered[index]] = [
															reordered[index],
															reordered[index + 1],
														];
														return reordered;
													})
												}
											>
												↓
											</button>
											<button
												type="button"
												disabled={locked}
												onClick={() =>
													setFields((current) =>
														current.filter((_, fieldIndex) => fieldIndex !== index),
													)
												}
											>
												Remove
											</button>
										</div>
									</div>
									<div className="dfb-grid">
										<label>
											Label
											<input
												disabled={locked}
												value={field.label}
												onChange={(event) =>
													updateField(index, 'label', event.target.value)
												}
											/>
										</label>
										<label>
											Field key
											<input
												disabled={locked}
												value={field.key}
												onChange={(event) =>
													updateField(index, 'key', event.target.value)
												}
											/>
										</label>
										<label>
											Type
											<select
												disabled={locked}
												value={field.type}
												onChange={(event) =>
													updateField(index, 'type', event.target.value)
												}
											>
												{fieldTypes.map((type) => (
													<option key={type} value={type}>
														{type}
													</option>
												))}
											</select>
										</label>
										<label>
											Placeholder
											<input
												disabled={locked}
												value={field.placeholder}
												onChange={(event) =>
													updateField(index, 'placeholder', event.target.value)
												}
											/>
										</label>
									</div>
									{['select', 'radio'].includes(field.type) && (
										<label>
											Options (one per line)
											<textarea
												disabled={locked}
												rows="3"
												value={field.options.join('\n')}
												onChange={(event) =>
													updateField(
														index,
														'options',
														event.target.value
															.split('\n')
															.map((option) => option.trim())
															.filter(Boolean),
													)
												}
											/>
										</label>
									)}
									<label className="dfb-check">
										<input
											type="checkbox"
											disabled={locked}
											checked={field.required}
											onChange={(event) =>
												updateField(index, 'required', event.target.checked)
											}
										/>
										Required field
									</label>
								</div>
							))}
							<button
								type="button"
								disabled={locked}
								onClick={() => setFields((current) => [...current, emptyField()])}
							>
								+ Add Field
							</button>
						</>
					)}
					<div className="dfb-footer">
						{locked ? (
							<button type="button" onClick={duplicatePublished}>
								Duplicate published form
							</button>
						) : (
							<>
								<button
									type="button"
									disabled={busy}
									onClick={() => save('draft')}
								>
									Save Draft
								</button>
								<button
									type="button"
									className="dfb-primary"
									disabled={busy}
									onClick={() => {
										if (
											window.confirm(
												'Publish this form? Published forms are locked.',
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
				</section>
			</div>
		</div>
	);
}
