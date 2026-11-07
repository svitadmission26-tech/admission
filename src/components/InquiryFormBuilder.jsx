import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { moveFieldInList, moveFieldToPosition } from '../lib/formFields';
import './InquiryFormBuilder.css';

const freshSection = () => ({
	id: `section_${crypto.randomUUID()}`,
	title: 'General',
	layout: 'columns',
});
const freshField = (sectionId) => ({
	key: '',
	label: '',
	type: 'text',
	sectionId,
	width: 'full',
	required: false,
	profileFieldId: '',
	defaultValue: '',
	forceUppercase: false,
	textCase: 'none',
	copyFromFieldKey: '',
	visibility: { fieldKey: '', operator: 'equals', value: '' },
	options: [],
});
const defaultBranding = {
	universityName: '',
	logoUrl: '',
	address: '',
	contactNumber: '',
	chatbotCollegeId: '',
	heroTitle: 'Your future starts with a conversation.',
	heroDescription:
		'Ask us about courses, eligibility, or admissions. Submit your inquiry and our team will contact you.',
	footerText: 'Admission guidance · Course information · Follow-up support',
};

const slugify = (value) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

export const fieldTypes = [
	'text',
	'email',
	'number',
	'date',
	'time',
	'tel',
	'url',
	'textarea',
	'select',
	'checkbox',
	'radio',
	'college',
	'course',
	'branch',
	'department',
	'faculty',
	'timing',
	'gender',
	'source',
	'qualification',
	'consent',
];

export const fieldTypeLabels = {
	text: 'Text',
	email: 'Email',
	number: 'Number',
	date: 'Date',
	time: 'Time',
	tel: 'Phone',
	url: 'URL',
	textarea: 'Textarea',
	select: 'Select',
	checkbox: 'Checkbox',
	radio: 'Radio',
	college: 'College Selection',
	course: 'Course Selection',
	branch: 'Branch Selection',
	department: 'Department Selection',
	faculty: 'Faculty / Branch Selection',
	timing: 'Time (manual entry)',
	gender: 'Gender',
	source: 'Source',
	qualification: 'Qualification',
	consent: 'Consent',
};

export default function InquiryFormBuilder() {
	const [forms, setForms] = useState([]);
	const [colleges, setColleges] = useState([]);
	const [academicYears, setAcademicYears] = useState([]);
	const [profileFields, setProfileFields] = useState([]);
	const [selectedId, setSelectedId] = useState('');
	const [name, setName] = useState('');
	const [academicYear, setAcademicYear] = useState('');
	const [slug, setSlug] = useState('');
	const [slugEdited, setSlugEdited] = useState(false);
	const [active, setActive] = useState(true);
	const [description, setDescription] = useState('');
	const [branding, setBranding] = useState(defaultBranding);
	const [layout, setLayout] = useState('cards');
	const [sections, setSections] = useState([freshSection()]);
	const [fields, setFields] = useState([]);
	const [activeSectionId, setActiveSectionId] = useState('');
	const [fieldDraft, setFieldDraft] = useState(null);
	const [editingFieldIndex, setEditingFieldIndex] = useState(null);
	const [fieldOrderInputs, setFieldOrderInputs] = useState({});
	const [showPreview, setShowPreview] = useState(false);
	const [message, setMessage] = useState('');
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [logoUploading, setLogoUploading] = useState(false);

	const currentSection = sections.find((section) => section.id === activeSectionId);
	const activeFields = useMemo(
		() => fields.filter((field) => (field.sectionId || sections[0]?.id) === activeSectionId),
		[fields, sections, activeSectionId],
	);

	async function loadData() {
		setLoading(true);
		const [formsResult, yearsResult, profileResult, collegesResult] = await Promise.all([
			supabase.from('inquiry_forms').select('*').order('created_at', { ascending: false }),
			supabase.from('academic_years').select('name').order('name', { ascending: false }),
			supabase
				.from('student_profile_fields')
				.select('id,label,key,input_type,required,default_value,text_case,options,display_order')
				.order('display_order'),
			supabase.from('colleges').select('id,name').order('name'),
		]);
		const firstError = [
			formsResult.error,
			yearsResult.error,
			profileResult.error,
			collegesResult.error,
		].find(Boolean);
		if (firstError) setMessage(`Could not load inquiry form setup: ${firstError.message}`);
		else {
			setForms(formsResult.data ?? []);
			setAcademicYears(yearsResult.data ?? []);
			setProfileFields(profileResult.data ?? []);
			setColleges(collegesResult.data ?? []);
		}
		setLoading(false);
	}

	useEffect(() => {
		if (!supabase) {
			setMessage('Connect Supabase to manage inquiry forms.');
			setLoading(false);
			return;
		}
		void loadData();
	}, []);

	function resetForm() {
		const section = freshSection();
		setSelectedId('');
		setName('');
		setAcademicYear('');
		setSlug('');
		setSlugEdited(false);
		setActive(true);
		setDescription('');
		setBranding(defaultBranding);
		setLayout('cards');
		setSections([section]);
		setFields([]);
		setActiveSectionId(section.id);
		setFieldDraft(null);
		setEditingFieldIndex(null);
		setFieldOrderInputs({});
		setShowPreview(false);
		setMessage('');
	}

	function editForm(form) {
		const nextSections =
			Array.isArray(form.sections) && form.sections.length
				? form.sections
				: [{ id: 'general', title: 'General', layout: 'columns' }];
		setSelectedId(form.id);
		setName(form.name);
		setAcademicYear(form.academic_year || '');
		setSlug(form.slug || '');
		setSlugEdited(true);
		setActive(form.is_active !== false);
		setDescription(form.description || '');
		setBranding({ ...defaultBranding, ...(form.branding || {}) });
		setLayout(form.layout || 'cards');
		setSections(nextSections);
		setFields(
			Array.isArray(form.fields)
				? form.fields.map((field) => ({
						...field,
						sectionId: field.sectionId || nextSections[0].id,
					}))
				: [],
		);
		setActiveSectionId(nextSections[0].id);
		setFieldDraft(null);
		setEditingFieldIndex(null);
		setFieldOrderInputs({});
		setShowPreview(false);
		setMessage('');
	}

	function addSection() {
		const section = {
			...freshSection(),
			title: `Section ${sections.length + 1}`,
		};
		setSections((current) => [...current, section]);
		setActiveSectionId(section.id);
	}

	function updateSection(id, key, value) {
		setSections((current) =>
			current.map((section) => (section.id === id ? { ...section, [key]: value } : section)),
		);
	}

	function removeSection(section) {
		if (sections.length < 2) {
			setMessage('An inquiry form must keep at least one section.');
			return;
		}
		if (!window.confirm(`Delete section "${section.title}" and its fields?`)) return;
		const remaining = sections.filter((item) => item.id !== section.id);
		setSections(remaining);
		setFields((current) => current.filter((field) => field.sectionId !== section.id));
		setActiveSectionId(remaining[0].id);
	}

	function openFieldEditor(index = null) {
		setEditingFieldIndex(index);
		setFieldDraft(
			index === null
				? freshField(activeSectionId)
				: {
						...freshField(activeSectionId),
						...fields[index],
						visibility: fields[index].visibility || {
							fieldKey: '',
							operator: 'equals',
							value: '',
						},
					},
		);
		setMessage('');
	}

	function updateDraft(key, value) {
		setFieldDraft((current) => ({ ...current, [key]: value }));
	}

	function linkProfileField(profileFieldId) {
		const profileField = profileFields.find((field) => field.id === profileFieldId);
		setFieldDraft((current) => ({
			...current,
			profileFieldId,
			...(profileField
				? {
						key: profileField.key,
						label: profileField.label,
						type: fieldTypes.includes(profileField.input_type)
							? profileField.input_type
							: 'text',
						required: Boolean(profileField.required),
						defaultValue: profileField.default_value || '',
						forceUppercase: profileField.text_case === 'uppercase',
						textCase: profileField.text_case || 'none',
						options: Array.isArray(profileField.options) ? profileField.options : [],
					}
				: { profileFieldId: '' }),
		}));
	}

	function saveField(event) {
		event.preventDefault();
		const textCase =
			fieldDraft.textCase || (fieldDraft.forceUppercase ? 'uppercase' : 'none');
		const field = {
			...fieldDraft,
			key: fieldDraft.key.trim(),
			label: fieldDraft.label.trim(),
			textCase,
			forceUppercase: textCase === 'uppercase',
			options:
				fieldDraft.type === 'select' || fieldDraft.type === 'radio'
					? (fieldDraft.options || []).map((option) => option.trim()).filter(Boolean)
					: [],
		};
		if (!field.label || !/^[a-z][a-z0-9_]*$/.test(field.key)) {
			setMessage('Enter a field label and a unique lowercase key using letters, numbers, and underscores.');
			return;
		}
		if (
			fields.some(
				(item, index) => item.key === field.key && index !== editingFieldIndex,
			)
		) {
			setMessage(`The field key "${field.key}" is already in use.`);
			return;
		}
		if (
			(field.type === 'select' || field.type === 'radio') &&
			!field.options.length
		) {
			setMessage('Add at least one option for a select/radio field.');
			return;
		}
		setFields((current) =>
			editingFieldIndex === null
				? [...current, field]
				: current.map((item, index) => (index === editingFieldIndex ? field : item)),
		);
		setFieldDraft(null);
		setEditingFieldIndex(null);
		setMessage('');
	}

	function removeField(index) {
		setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
	}

	function moveField(index, offset) {
		setFields((current) => moveFieldInList(current, index, offset));
	}

	function moveFieldToSr(index, serialNumber, fieldKey) {
		const target = Number(serialNumber);
		if (!Number.isInteger(target) || target < 1 || target > activeFields.length) {
			setMessage(`Enter a serial number from 1 to ${activeFields.length}.`);
			return;
		}
		setFields((current) => moveFieldToPosition(current, index, target - 1));
		setFieldOrderInputs((current) => ({ ...current, [fieldKey]: '' }));
		setMessage('');
	}

	async function uploadBrandLogo(file) {
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
			setMessage('Choose a JPG, PNG, or WebP logo no larger than 2 MB.');
			return;
		}
		setLogoUploading(true);
		setMessage('');
		try {
			const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const path = `inquiry-forms/${crypto.randomUUID()}-${safeName}`;
			const { error } = await supabase.storage.from('college-logos').upload(path, file, {
				contentType: file.type,
				upsert: false,
			});
			if (error) throw error;
			const { data } = supabase.storage.from('college-logos').getPublicUrl(path);
			setBranding((current) => ({ ...current, logoUrl: data.publicUrl }));
			setMessage('University logo uploaded. Save the inquiry form to publish it.');
		} catch (error) {
			setMessage(`Could not upload university logo: ${error.message}`);
		} finally {
			setLogoUploading(false);
		}
	}

	async function saveForm(event) {
		event.preventDefault();
		if (!supabase || busy) return;
		const resolvedSlug = slugify(slug);
		if (!name.trim() || !resolvedSlug) {
			setMessage('Form name and URL slug are required.');
			return;
		}
		if (sections.some((section) => !section.title.trim())) {
			setMessage('Every section needs a title.');
			return;
		}
		const payload = {
			name: name.trim(),
			academic_year: academicYear || null,
			slug: resolvedSlug,
			is_active: active,
			description: description.trim(),
			layout,
			branding: {
				...branding,
				universityName: branding.universityName.trim(),
				logoUrl: branding.logoUrl.trim(),
				address: branding.address.trim(),
				contactNumber: branding.contactNumber.trim(),
				chatbotCollegeId: branding.chatbotCollegeId,
				heroTitle: branding.heroTitle.trim(),
				heroDescription: branding.heroDescription.trim(),
				footerText: branding.footerText.trim(),
			},
			sections,
			fields,
			updated_at: new Date().toISOString(),
		};
		setBusy(true);
		setMessage('');
		const result = selectedId
			? await supabase.from('inquiry_forms').update(payload).eq('id', selectedId)
			: await supabase.from('inquiry_forms').insert(payload);
		if (result.error) setMessage(`Could not save inquiry form: ${result.error.message}`);
		else {
			setMessage('Inquiry form saved.');
			await loadData();
			if (!selectedId) {
				const { data, error } = await supabase
					.from('inquiry_forms')
					.select('*')
					.eq('slug', resolvedSlug)
					.single();
				if (error) setMessage(`Form saved, but it could not be reopened: ${error.message}`);
				else editForm(data);
			}
		}
		setBusy(false);
	}

	async function deleteForm(form) {
		if (!window.confirm(`Delete inquiry form "${form.name}"?`)) return;
		const { error } = await supabase.from('inquiry_forms').delete().eq('id', form.id);
		if (error) setMessage(`Could not delete inquiry form: ${error.message}`);
		else {
			if (selectedId === form.id) resetForm();
			setMessage('Inquiry form deleted.');
			await loadData();
		}
	}

	return (
		<div className="inquiry-form-builder">
			{message && (
				<div className="inquiry-builder-message" role="status">
					{message}
					<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button>
				</div>
			)}
			<div className="inquiry-builder-grid">
				<form className="inquiry-create-form" onSubmit={saveForm}>
					<h2>{selectedId ? 'Edit Inquiry Form' : 'Create New Inquiry Form'}</h2>
					<div className="inquiry-form-meta">
						<label>
							Form Name
							<input
								value={name}
								onChange={(event) => {
									setName(event.target.value);
									if (!slugEdited) setSlug(slugify(event.target.value));
								}}
								placeholder="e.g. Engineering Inquiry 2026"
								maxLength={120}
								required
							/>
						</label>
						<label>
							Academic Year
							<select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
								<option value="">No Specific Year</option>
								{academicYears.map((year) => <option key={year.name} value={year.name}>{year.name}</option>)}
							</select>
						</label>
						<label>
							URL Slug
							<span className="inquiry-slug-input">
								<span>/inquiry/</span>
								<input
									value={slug}
									onChange={(event) => {
										setSlug(slugify(event.target.value));
										setSlugEdited(true);
									}}
									placeholder="slug"
									maxLength={80}
									required
								/>
							</span>
						</label>
					</div>
					<label className="inquiry-active-toggle">
						<input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
						Is Active
					</label>
					<label className="inquiry-description">
						Description (Optional)
						<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
					</label>

					<section className="inquiry-branding">
						<h3>Public Page Branding</h3>
						<p>These details appear on the blue panel of the public inquiry page.</p>
						<div className="inquiry-branding-grid">
							<label>
								University / Institute Name
								<input
									maxLength={160}
									value={branding.universityName}
									onChange={(event) => setBranding((current) => ({ ...current, universityName: event.target.value }))}
									placeholder="e.g. SVIT"
								/>
							</label>
							<label>
								Contact Number
								<input
									type="tel"
									maxLength={30}
									value={branding.contactNumber}
									onChange={(event) => setBranding((current) => ({ ...current, contactNumber: event.target.value }))}
									placeholder="Admission office phone"
								/>
							</label>
							<label className="inquiry-branding-wide">
								Admission Chatbot College
								<select
									value={branding.chatbotCollegeId}
									onChange={(event) => setBranding((current) => ({ ...current, chatbotCollegeId: event.target.value }))}
								>
									<option value="">Select a college for chatbot FAQs</option>
									{colleges.map((college) => (
										<option key={college.id} value={college.id}>{college.name}</option>
									))}
								</select>
								<small>Select the college whose published FAQs should appear on this inquiry page.</small>
							</label>
							<label className="inquiry-branding-wide">
								Address
								<textarea
									rows={2}
									maxLength={500}
									value={branding.address}
									onChange={(event) => setBranding((current) => ({ ...current, address: event.target.value }))}
									placeholder="University / institute address"
								/>
							</label>
							<label className="inquiry-branding-wide">
								University Logo
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									disabled={logoUploading}
									onChange={(event) => {
										void uploadBrandLogo(event.target.files?.[0]);
										event.target.value = '';
									}}
								/>
								<small>Upload JPG, PNG, or WebP up to 2 MB.</small>
								{branding.logoUrl && (
									<span className="inquiry-branding-logo">
										<img src={branding.logoUrl} alt="University logo preview" />
										<button type="button" onClick={() => setBranding((current) => ({ ...current, logoUrl: '' }))}>Remove logo</button>
									</span>
								)}
							</label>
							<label className="inquiry-branding-wide">
								Page Headline
								<input
									maxLength={180}
									value={branding.heroTitle}
									onChange={(event) => setBranding((current) => ({ ...current, heroTitle: event.target.value }))}
								/>
							</label>
							<label className="inquiry-branding-wide">
								Page Introduction
								<textarea
									rows={3}
									maxLength={600}
									value={branding.heroDescription}
									onChange={(event) => setBranding((current) => ({ ...current, heroDescription: event.target.value }))}
								/>
							</label>
							<label className="inquiry-branding-wide">
								Footer Text
								<input
									maxLength={180}
									value={branding.footerText}
									onChange={(event) => setBranding((current) => ({ ...current, footerText: event.target.value }))}
								/>
							</label>
						</div>
					</section>

					<div className="inquiry-form-structure">
						<h3>Form Structure</h3>
						<div className="inquiry-form-layout">
							<aside>
								<label>
									Form Layout
									<select value={layout} onChange={(event) => setLayout(event.target.value)}>
										<option value="cards">Cards (Vertical)</option>
										<option value="simple">Simple</option>
										<option value="tabs">Tabs</option>
									</select>
								</label>
								<div className="inquiry-sections-head">
									<strong>Sections</strong>
									<button type="button" onClick={addSection}>Add</button>
								</div>
								{sections.map((section) => (
									<div className="inquiry-section-nav" key={section.id}>
										<button
											type="button"
											className={section.id === activeSectionId ? 'active' : ''}
											onClick={() => setActiveSectionId(section.id)}
										>
											{section.title}
										</button>
										<button type="button" aria-label={`Delete ${section.title}`} onClick={() => removeSection(section)}>×</button>
									</div>
								))}
							</aside>
							<div className="inquiry-section-fields">
								<div className="inquiry-fields-head">
									<div>
										<input
											aria-label="Section title"
											value={currentSection?.title ?? ''}
											onChange={(event) => currentSection && updateSection(currentSection.id, 'title', event.target.value)}
										/>
										<small>{activeFields.length} fields</small>
									</div>
									<button type="button" className="primary" onClick={() => openFieldEditor()}>Add Field</button>
								</div>
								{activeFields.length ? (
									<div className="inquiry-field-list">
										{activeFields.map((field, position) => {
											const index = fields.indexOf(field);
											return (
												<article key={`${field.key}-${index}`}>
													<span
														className="inquiry-field-sr"
														title={`Sr. No. ${position + 1} of ${activeFields.length}`}
													>
														{position + 1}
													</span>
													<div><strong>{field.label}</strong><small>{field.key} · {field.type}{field.required ? ' · Required' : ''}</small></div>
													<div>
														<button
															type="button"
															disabled={position === 0}
															onClick={() => moveField(index, -1)}
															aria-label={`Move ${field.label} up`}
															title="Move up"
														>
															↑
														</button>
														<button
															type="button"
															disabled={position === activeFields.length - 1}
															onClick={() => moveField(index, 1)}
															aria-label={`Move ${field.label} down`}
															title="Move down"
														>
															↓
														</button>
														<input
															className="inquiry-field-sr-input"
															type="number"
															min="1"
															max={activeFields.length}
															value={fieldOrderInputs[field.key] ?? ''}
															onChange={(event) =>
																setFieldOrderInputs((current) => ({
																	...current,
																	[field.key]: event.target.value,
																}))
															}
															onKeyDown={(event) => {
																if (event.key === 'Enter') {
																	event.preventDefault();
																	moveFieldToSr(index, fieldOrderInputs[field.key], field.key);
																}
															}}
															aria-label={`Move ${field.label} to Sr. No.`}
															title="Enter the target Sr. No."
														/>
														<button
															type="button"
															onClick={() => moveFieldToSr(index, fieldOrderInputs[field.key], field.key)}
														>
															Move
														</button>
														<button type="button" onClick={() => openFieldEditor(index)}>Edit</button>
														<button type="button" className="danger" onClick={() => removeField(index)}>Delete</button>
													</div>
												</article>
											);
										})}
									</div>
								) : <p className="inquiry-empty-fields">No fields in this section. Add a field to begin.</p>}
							</div>
						</div>
					</div>
					<div className="inquiry-builder-actions">
						<button type="button" onClick={() => setShowPreview((value) => !value)}>{showPreview ? 'Hide Preview' : 'Preview Form'}</button>
						<button className="primary" type="submit" disabled={busy || logoUploading}>{busy ? 'Saving…' : 'Save Inquiry Form'}</button>
					</div>
				</form>

				<section className="inquiry-existing-forms">
					<h2>Existing Forms</h2>
					{loading ? <p>Loading forms…</p> : forms.length ? forms.map((form) => (
						<article key={form.id}>
							<div className="inquiry-existing-actions">
								<button type="button" aria-label={`Edit ${form.name}`} onClick={() => editForm(form)}>✎</button>
								<button type="button" aria-label={`Preview ${form.name}`} onClick={() => { editForm(form); setShowPreview(true); }}>◉</button>
								<button type="button" className="danger" aria-label={`Delete ${form.name}`} onClick={() => void deleteForm(form)}>▤</button>
							</div>
							<strong>{form.name}</strong>
							<small>Slug: <code>{form.slug}</code></small>
							<span className={form.is_active ? 'inquiry-active-pill' : 'inquiry-inactive-pill'}>{form.is_active ? 'Active' : 'Inactive'}</span>
							<small>▧ &nbsp;{form.fields?.length ?? 0} Fields</small>
						</article>
					)) : <p className="inquiry-empty-forms">No inquiry forms created yet.</p>}
					<button type="button" className="inquiry-new-form" onClick={resetForm}>+ New Form</button>
				</section>
			</div>

			{fieldDraft && (
				<div className="inquiry-modal-backdrop" role="presentation">
					<form className="inquiry-field-modal" onSubmit={saveField}>
						<div className="inquiry-modal-head">
							<h2>{editingFieldIndex === null ? 'Add Field' : 'Edit Field'}</h2>
							<button type="button" aria-label="Close" onClick={() => setFieldDraft(null)}>×</button>
						</div>
						<label className="inquiry-link-profile">
							<input
								type="checkbox"
								checked={Boolean(fieldDraft.profileFieldId)}
								onChange={(event) => linkProfileField(event.target.checked ? profileFields[0]?.id || '' : '')}
								disabled={!profileFields.length}
							/>
							Link to Student Profile Field
						</label>
						{fieldDraft.profileFieldId && (
							<label>
								Student Profile Field
								<select value={fieldDraft.profileFieldId} onChange={(event) => linkProfileField(event.target.value)}>
									<option value="">Select Field</option>
									{profileFields.map((field) => <option key={field.id} value={field.id}>{field.label} ({field.input_type})</option>)}
								</select>
							</label>
						)}
						<div className="inquiry-field-modal-grid">
							<label>Field Label<input value={fieldDraft.label} onChange={(event) => updateDraft('label', event.target.value)} required /></label>
							<label>Field Key<input value={fieldDraft.key} onChange={(event) => updateDraft('key', event.target.value)} placeholder="first_name" required /></label>
							<label>Field Type<select value={fieldDraft.type} onChange={(event) => updateDraft('type', event.target.value)}>{fieldTypes.map((type) => <option key={type} value={type}>{fieldTypeLabels[type] || type}</option>)}</select></label>
							<label>Section<select value={fieldDraft.sectionId} onChange={(event) => updateDraft('sectionId', event.target.value)}>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
							<label>Column Width<select value={fieldDraft.width} onChange={(event) => updateDraft('width', event.target.value)}><option value="full">Full Width</option><option value="half">Half Width</option><option value="third">One Third</option></select></label>
							<label>Default Value<input value={fieldDraft.defaultValue ?? ''} onChange={(event) => updateDraft('defaultValue', event.target.value)} /></label>
						</div>
						<label className="inquiry-field-checkbox"><input type="checkbox" checked={fieldDraft.required} onChange={(event) => updateDraft('required', event.target.checked)} />Required</label>
						{(fieldDraft.type === 'select' || fieldDraft.type === 'radio') && (
							<label>Options (one per line)<textarea rows={3} value={(fieldDraft.options || []).join('\n')} onChange={(event) => updateDraft('options', event.target.value.split('\n'))} /></label>
						)}
						{['text', 'textarea'].includes(fieldDraft.type) && (
							<label>Text Case
								<select
									value={fieldDraft.textCase || (fieldDraft.forceUppercase ? 'uppercase' : 'none')}
									onChange={(event) => {
										updateDraft('textCase', event.target.value);
										updateDraft('forceUppercase', event.target.value === 'uppercase');
									}}
								>
									<option value="none">As entered</option>
									<option value="uppercase">UPPERCASE</option>
									<option value="lowercase">lowercase</option>
								</select>
								<small>Entered text is converted automatically.</small>
							</label>
						)}
						<div className="inquiry-field-options">
							<strong>Copy &amp; Transformation</strong>
							<label>Copy from field<select value={fieldDraft.copyFromFieldKey} onChange={(event) => updateDraft('copyFromFieldKey', event.target.value)}><option value="">Disabled</option>{fields.filter((field) => field.key !== fieldDraft.key).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
						</div>
						<div className="inquiry-field-options">
							<strong>Conditional Visibility</strong>
							<div className="inquiry-condition-row">
								<label>Field to Check<select value={fieldDraft.visibility.fieldKey} onChange={(event) => updateDraft('visibility', { ...fieldDraft.visibility, fieldKey: event.target.value })}><option value="">Always visible</option>{fields.filter((field) => field.key !== fieldDraft.key).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
								<label>Operator<select value={fieldDraft.visibility.operator} onChange={(event) => updateDraft('visibility', { ...fieldDraft.visibility, operator: event.target.value })}><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="contains">Contains</option></select></label>
								<label>Value<input value={fieldDraft.visibility.value} onChange={(event) => updateDraft('visibility', { ...fieldDraft.visibility, value: event.target.value })} /></label>
							</div>
						</div>
						<div className="inquiry-modal-actions">
							<button type="button" onClick={() => setFieldDraft(null)}>Cancel</button>
							<button className="primary" type="submit">Save Field</button>
						</div>
					</form>
				</div>
			)}

			{showPreview && (
				<section className="inquiry-preview panel">
					<div className="panelhead"><div><h2>{name || 'Inquiry Form Preview'}</h2><p>{description || 'Preview of configured form fields.'}</p></div><button type="button" onClick={() => setShowPreview(false)}>Close Preview</button></div>
					<div className="inquiry-preview-branding">
						{branding.logoUrl && <img src={branding.logoUrl} alt={`${branding.universityName || 'University'} logo`} />}
						<div>
							<strong>{branding.universityName || 'SVIT'}</strong>
							{branding.address && <span>{branding.address}</span>}
							{branding.contactNumber && <a href={`tel:${branding.contactNumber.replace(/[^\d+]/g, '')}`}>{branding.contactNumber}</a>}
						</div>
						<h2>{branding.heroTitle || 'Your future starts with a conversation.'}</h2>
						{branding.heroDescription && <p>{branding.heroDescription}</p>}
					</div>
					{sections.map((section) => (
						<div className="inquiry-preview-section" key={section.id}>
							<h3>{section.title}</h3>
							<div className={`inquiry-preview-fields ${layout === 'simple' || section.layout === 'vertical' ? 'vertical' : ''}`}>
								{fields.filter((field) => field.sectionId === section.id).map((field) => (
									<label className={`width-${field.width || 'full'}`} key={field.key}>
										{field.label}{field.required && ' *'}
										{field.type === 'textarea' ? <textarea rows={2} placeholder={field.placeholder} /> : ['select', 'college', 'course', 'branch', 'department', 'faculty', 'timing', 'gender', 'source', 'qualification', 'radio'].includes(field.type) ? <select defaultValue=""><option value="">Select…</option>{(field.type === 'timing' ? ['9:00 AM - 10:00 AM', '10:00 AM - 11:00 AM'] : field.options || []).map((option) => <option key={option}>{option}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" /> : field.type === 'consent' ? <input type="checkbox" /> : <input type={['text', 'email', 'number', 'date', 'tel', 'url'].includes(field.type) ? field.type : 'text'} placeholder={field.placeholder} />}
									</label>
								))}
							</div>
						</div>
					))}
				</section>
			)}
		</div>
	);
}
