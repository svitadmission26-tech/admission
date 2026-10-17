import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import './StudentProfileSchema.css';

const inputTypes = ['text', 'email', 'number', 'date', 'textarea', 'select', 'checkbox', 'image'];

const emptyField = () => ({
	label: '',
	key: '',
	input_type: 'text',
	default_value: '',
	required: false,
	text_case: 'none',
	options: [],
});

function keyFromLabel(label) {
	return label
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');
}

export default function StudentProfileSchema() {
	const [fields, setFields] = useState([]);
	const [draft, setDraft] = useState(emptyField);
	const [editingId, setEditingId] = useState(null);
	const [optionsText, setOptionsText] = useState('');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

	async function loadFields() {
		setLoading(true);
		const { data, error } = await supabase
			.from('student_profile_fields')
			.select('id,label,key,input_type,default_value,required,force_uppercase,text_case,options,display_order')
			.order('display_order')
			.order('label');
		if (error) {
			setMessage(`Could not load profile fields: ${error.message}`);
			setLoading(false);
			return false;
		} else {
			setFields(data ?? []);
		}
		setLoading(false);
		return true;
	}

	useEffect(() => {
		void loadFields();
	}, []);

	function startEdit(field) {
		setEditingId(field.id);
		setDraft({
			...emptyField(),
			...field,
			text_case: field.text_case || (field.force_uppercase ? 'uppercase' : 'none'),
			options: Array.isArray(field.options) ? field.options : [],
		});
		setOptionsText((field.options ?? []).join('\n'));
		setMessage('');
	}

	function resetDraft() {
		setDraft(emptyField());
		setEditingId(null);
		setOptionsText('');
	}

	async function saveField(event) {
		event.preventDefault();
		setMessage('');
		const label = draft.label.trim();
		const key = (draft.key || keyFromLabel(label)).trim();
		const options = optionsText.split('\n').map((item) => item.trim()).filter(Boolean);
		if (!label || !/^[a-z][a-z0-9_]*$/.test(key)) {
			setMessage('Enter a field label and a lowercase key using letters, numbers, and underscores.');
			return;
		}
		if (new Set(options).size !== options.length) {
			setMessage('Select options must be unique.');
			return;
		}
		if (draft.input_type === 'select' && !options.length) {
			setMessage('Add at least one option for a select field.');
			return;
		}
		if (fields.some((field) => field.key === key && field.id !== editingId)) {
			setMessage(`The key "${key}" is already in use.`);
			return;
		}

		setBusy(true);
		const updating = Boolean(editingId);
		const payload = {
			label,
			key,
			input_type: draft.input_type,
			default_value: draft.default_value.trim() || null,
			required: Boolean(draft.required),
			force_uppercase: draft.text_case === 'uppercase',
			text_case: draft.text_case,
			options: draft.input_type === 'select' ? options : [],
			...(editingId ? {} : { display_order: fields.length ? Math.max(...fields.map((field) => field.display_order || 0)) + 1 : 0 }),
		};
		const result = editingId
			? await supabase.from('student_profile_fields').update(payload).eq('id', editingId)
			: await supabase.from('student_profile_fields').insert(payload);
		if (result.error) {
			setMessage(`Could not save profile field: ${result.error.message}`);
			setBusy(false);
			return;
		}
		resetDraft();
		const refreshed = await loadFields();
		if (refreshed)
			setMessage(updating ? 'Profile field updated.' : 'Profile field added.');
		setBusy(false);
	}

	async function deleteField(field) {
		if (!window.confirm(`Delete "${field.label}" from the student profile schema?`)) return;
		setMessage('');
		const { error } = await supabase.from('student_profile_fields').delete().eq('id', field.id);
		if (error) {
			setMessage(`Could not delete profile field: ${error.message}`);
			return;
		}
		setFields((current) => current.filter((item) => item.id !== field.id));
		if (editingId === field.id) resetDraft();
		setMessage('Profile field deleted.');
	}

	return (
		<section className="profile-schema">
			<header className="profile-schema-heading">
				<div>
					<h2>Student Profile Schema</h2>
					<p>Define the common fields used across student profiles and linked admission forms.</p>
				</div>
			</header>
			{message && <p className="profile-schema-message" role="status">{message}</p>}
			<div className="profile-schema-layout">
				<form className="profile-schema-form" onSubmit={saveField}>
					<h3>{editingId ? 'Edit Field' : 'Add New Field'}</h3>
					<label>
						Field Label
						<input
							required
							value={draft.label}
							placeholder="e.g. Date of Birth"
							onChange={(event) => setDraft((current) => ({
								...current,
								label: event.target.value,
								...(editingId || current.key ? {} : { key: keyFromLabel(event.target.value) }),
							}))}
						/>
					</label>
					<label>
						Key (Internal)
						<input
							required
							pattern="[a-z][a-z0-9_]*"
							readOnly={Boolean(editingId)}
							value={draft.key}
							placeholder="e.g. dob (lowercase)"
							onChange={(event) => setDraft({ ...draft, key: event.target.value })}
						/>
						<small>Unique identifier. Cannot be changed after creation.</small>
					</label>
					<label>
						Input Type
						<select
							value={draft.input_type}
							onChange={(event) => setDraft({ ...draft, input_type: event.target.value })}
						>
							{inputTypes.map((type) => (
								<option key={type} value={type}>{type === 'image' ? 'Photo' : type[0].toUpperCase() + type.slice(1)}</option>
							))}
						</select>
					</label>
					{draft.input_type === 'select' && (
						<label>
							Options (one per line)
							<textarea rows="4" value={optionsText} onChange={(event) => setOptionsText(event.target.value)} />
						</label>
					)}
					<label>
						Default Value
						<input
							value={draft.default_value ?? ''}
							placeholder="Pre-populate this field with a default value"
							onChange={(event) => setDraft({ ...draft, default_value: event.target.value })}
						/>
					</label>
					<label>
						Text Case
						<select
							value={draft.text_case}
							onChange={(event) => setDraft({ ...draft, text_case: event.target.value })}
						>
							<option value="none">As entered</option>
							<option value="uppercase">Force Uppercase</option>
							<option value="lowercase">Force lowercase</option>
						</select>
					</label>
					<label className="profile-schema-check">
						<input
							type="checkbox"
							checked={Boolean(draft.required)}
							onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
						/>
						Required Field
					</label>
					<div className="profile-schema-actions">
						<button className="primary" disabled={busy}>{editingId ? 'Save Changes' : 'Add Field'}</button>
						{editingId && <button type="button" onClick={resetDraft}>Cancel</button>}
					</div>
				</form>
				<section className="profile-schema-table">
					<h3>Current Schema Fields</h3>
					{loading ? <p>Loading profile fields...</p> : (
						<div className="profile-schema-table-scroll">
							<table>
								<thead>
									<tr>
										<th>Label</th>
										<th>Key</th>
										<th>Type</th>
										<th>Required</th>
										<th>Text Case</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{fields.map((field) => (
										<tr key={field.id}>
											<td>{field.label}</td>
											<td><code>{field.key}</code></td>
											<td><span className="profile-schema-type">{field.input_type}</span></td>
											<td>{field.required ? 'Yes' : 'No'}</td>
											<td>{field.text_case || (field.force_uppercase ? 'UPPERCASE' : 'No')}</td>
											<td className="profile-schema-row-actions">
												<button type="button" aria-label={`Edit ${field.label}`} onClick={() => startEdit(field)}>Edit</button>
												<button type="button" className="danger" aria-label={`Delete ${field.label}`} onClick={() => void deleteField(field)}>Delete</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{!fields.length && <p className="profile-schema-empty">No profile fields configured yet.</p>}
						</div>
					)}
				</section>
			</div>
		</section>
	);
}
