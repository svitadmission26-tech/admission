import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { erpModules } from '../lib/erpModules';
import { downloadExcel, downloadExcelTemplate } from '../lib/excel';

// The Super Admin console of the ERP.
//
// It holds the configuration that the 25 modules share: the module registry,
// the permission matrix, the login modules, the dynamic form builder, the
// approval workflows, the receipt templates, the custom reports, the module
// timings, the feature flags and the system settings.

const TABS = [
	{ id: 'modules', label: 'Module Registry' },
	{ id: 'permissions', label: 'Roles & Permissions' },
	{ id: 'login', label: 'Login Modules' },
	{ id: 'forms', label: 'Dynamic Forms' },
	{ id: 'workflows', label: 'Approval Workflows' },
	{ id: 'templates', label: 'Receipt Templates' },
	{ id: 'reports', label: 'Custom Reports' },
	{ id: 'timings', label: 'Module Timings' },
	{ id: 'flags', label: 'Feature Flags' },
	{ id: 'settings', label: 'System Settings' },
	{ id: 'audit', label: 'Audit Trail' },
];

const FIELD_TYPES = [
	'text',
	'textarea',
	'number',
	'money',
	'date',
	'datetime',
	'time',
	'select',
	'multiselect',
	'radio',
	'checkbox',
	'email',
	'phone',
	'url',
	'file',
	'reference',
];

const emptyField = () => ({
	key: '',
	label: '',
	type: 'text',
	required: false,
	options: [],
	placeholder: '',
	help: '',
	visibility: null,
	validation: {},
});

function FieldEditor({ field, onChange, onRemove }) {
	const [advanced, setAdvanced] = useState(false);
	const update = (patch) => onChange({ ...field, ...patch });
	const optionText = Array.isArray(field.options)
		? field.options.join('\n')
		: field.options ?? '';
	return (
		<div className="erp-field-editor">
			<div className="erp-field-row">
				<label>
					<span>Label</span>
					<input
						value={field.label ?? ''}
						onChange={(event) => update({ label: event.target.value })}
					/>
				</label>
				<label>
					<span>Key</span>
					<input
						value={field.key ?? ''}
						onChange={(event) =>
							update({
								key: event.target.value.replace(/[^a-zA-Z0-9_]/g, '_'),
							})
						}
					/>
				</label>
				<label>
					<span>Type</span>
					<select
						value={field.type ?? 'text'}
						onChange={(event) => update({ type: event.target.value })}
					>
						{FIELD_TYPES.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</select>
				</label>
				<label className="erp-inline-check">
					<input
						type="checkbox"
						checked={Boolean(field.required)}
						onChange={(event) => update({ required: event.target.checked })}
					/>
					<span>Required</span>
				</label>
			</div>
			<div className="erp-field-row">
				<label>
					<span>Placeholder</span>
					<input
						value={field.placeholder ?? ''}
						onChange={(event) => update({ placeholder: event.target.value })}
					/>
				</label>
				<label>
					<span>Help text</span>
					<input
						value={field.help ?? ''}
						onChange={(event) => update({ help: event.target.value })}
					/>
				</label>
				{['select', 'multiselect', 'radio'].includes(field.type) && (
					<label>
						<span>Options (one per line)</span>
						<textarea
							rows="3"
							value={optionText}
							onChange={(event) =>
								update({
									options: event.target.value
										.split('\n')
										.map((line) => line.trim())
										.filter(Boolean),
								})
							}
						/>
					</label>
				)}
			</div>
			<div className="erp-field-row">
				<button type="button" onClick={() => setAdvanced((current) => !current)}>
					{advanced ? 'Hide validation' : 'Validation and conditions'}
				</button>
				<button type="button" className="danger" onClick={onRemove}>
					Remove field
				</button>
			</div>
			{advanced && (
				<div className="erp-field-row">
					<label>
						<span>Minimum length</span>
						<input
							type="number"
							value={field.validation?.minLength ?? ''}
							onChange={(event) =>
								update({
									validation: {
										...(field.validation ?? {}),
										minLength: event.target.value
											? Number(event.target.value)
											: undefined,
									},
								})
							}
						/>
					</label>
					<label>
						<span>Maximum length</span>
						<input
							type="number"
							value={field.validation?.maxLength ?? ''}
							onChange={(event) =>
								update({
									validation: {
										...(field.validation ?? {}),
										maxLength: event.target.value
											? Number(event.target.value)
											: undefined,
									},
								})
							}
						/>
					</label>
					<label>
						<span>Pattern (regular expression)</span>
						<input
							value={field.validation?.pattern ?? ''}
							onChange={(event) =>
								update({
									validation: {
										...(field.validation ?? {}),
										pattern: event.target.value || undefined,
									},
								})
							}
						/>
					</label>
					<label>
						<span>Visible when field</span>
						<input
							value={field.visibility?.fieldKey ?? ''}
							onChange={(event) =>
								update({
									visibility: event.target.value
										? {
												...(field.visibility ?? {}),
												fieldKey: event.target.value,
											}
										: null,
								})
							}
						/>
					</label>
					<label>
						<span>Condition</span>
						<select
							value={field.visibility?.operator ?? 'equals'}
							onChange={(event) =>
								update({
									visibility: {
										...(field.visibility ?? { fieldKey: '' }),
										operator: event.target.value,
									},
								})
							}
						>
							{['equals', 'not_equals', 'contains'].map((operator) => (
								<option key={operator} value={operator}>
									{operator}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>Condition value</span>
						<input
							value={field.visibility?.value ?? ''}
							onChange={(event) =>
								update({
									visibility: {
										...(field.visibility ?? { fieldKey: '' }),
										value: event.target.value,
									},
								})
							}
						/>
					</label>
				</div>
			)}
		</div>
	);
}

function DynamicFormBuilder() {
	const [definitions, setDefinitions] = useState([]);
	const [selected, setSelected] = useState(null);
	const [fields, setFields] = useState([]);
	const [sections, setSections] = useState([]);
	const [versions, setVersions] = useState([]);
	const [roles, setRoles] = useState([]);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);

	const loadDefinitions = useCallback(async () => {
		const { data, error: failure } = await supabase
			.from('erp_form_definitions')
			.select('*')
			.order('created_at', { ascending: false });
		if (failure) {
			setError(failure.message);
			return;
		}
		setDefinitions(data ?? []);
	}, []);

	useEffect(() => {
		loadDefinitions();
		supabase
			.from('staff_roles')
			.select('code,label')
			.then(({ data }) => setRoles(data ?? []));
	}, [loadDefinitions]);

	const loadForm = useCallback(async (definition) => {
		setSelected(definition);
		setError('');
		setNotice('');
		const { data: versionRows } = await supabase
			.from('erp_form_versions')
			.select('*')
			.eq('definition_id', definition.id)
			.order('version', { ascending: false });
		setVersions(versionRows ?? []);
		const latest = (versionRows ?? []).find(
			(row) => row.version === definition.current_version,
		);
		setFields(Array.isArray(latest?.fields) ? latest.fields : []);
		setSections(Array.isArray(latest?.sections) ? latest.sections : []);
	}, []);

	async function saveForm() {
		if (!selected) return;
		setBusy(true);
		setError('');
		setNotice('');
		try {
			const keys = fields.map((field) => field.key).filter(Boolean);
			if (new Set(keys).size !== keys.length) {
				throw new Error('Every field needs a unique key.');
			}
			if (fields.some((field) => !field.key || !field.label)) {
				throw new Error('Every field needs a key and a label.');
			}
			const { error: failure } = await supabase.rpc('erp_save_form', {
				p_definition_id: selected.id,
				p_module_id: selected.module_id,
				p_name: selected.name,
				p_description: selected.description,
				p_key: selected.key,
				p_table_name: selected.table_name,
				p_layout: selected.layout,
				p_fields: fields,
				p_sections: sections,
				p_settings: selected.settings,
				p_allowed_roles: selected.allowed_roles ?? [],
				p_record_permissions: selected.record_permissions ?? {},
				p_change_note: 'Saved from the dynamic form builder',
			});
			if (failure) throw failure;
			setNotice('The form was saved as a new version.');
			await loadDefinitions();
			await loadForm(selected);
		} catch (failure) {
			setError(failure.message ?? 'The form could not be saved.');
		} finally {
			setBusy(false);
		}
	}

	async function publish() {
		if (!selected) return;
		setBusy(true);
		setError('');
		setNotice('');
		try {
			const { error: failure } = await supabase.rpc('erp_publish_form', {
				p_definition_id: selected.id,
				p_version: null,
			});
			if (failure) throw failure;
			setNotice('The form is published.');
			await loadDefinitions();
			await loadForm(selected);
		} catch (failure) {
			setError(failure.message ?? 'The form could not be published.');
		} finally {
			setBusy(false);
		}
	}

	async function createForm() {
		const moduleId = erpModules[0]?.id ?? 'super_admin';
		const key = `custom_${Date.now().toString(36)}`;
		const { error: failure } = await supabase.rpc('erp_save_form', {
			p_definition_id: null,
			p_module_id: moduleId,
			p_name: 'New custom form',
			p_description: '',
			p_key: key,
			p_table_name: 'erp_form_records',
			p_layout: { type: 'cards' },
			p_fields: [],
			p_sections: [],
			p_settings: {},
			p_allowed_roles: [],
			p_record_permissions: {},
			p_change_note: 'Created',
		});
		if (failure) {
			setError(failure.message);
			return;
		}
		await loadDefinitions();
	}

	return (
		<div className="erp-formbuilder">
			<div className="panelhead">
				<div>
					<h2>Dynamic forms</h2>
					<p>
						Build a form for any module. Every save writes a new version, so the
						data that was already collected is never changed.
					</p>
				</div>
				<button className="primary" type="button" onClick={() => void createForm()}>
					+ New custom form
				</button>
			</div>
			{error && <div className="error">{error}</div>}
			{notice && <div className="success">{notice}</div>}
			<div className="erp-formbuilder-layout">
				<aside className="erp-form-list">
					{definitions.length === 0 && (
						<p className="hint">No custom form yet.</p>
					)}
					{definitions.map((definition) => (
						<button
							type="button"
							key={definition.id}
							className={selected?.id === definition.id ? 'selected' : ''}
							onClick={() => void loadForm(definition)}
						>
							<b>{definition.name}</b>
							<small>
								{definition.module_id} · v{definition.current_version} ·{' '}
								{definition.status}
							</small>
						</button>
					))}
				</aside>
				<div className="erp-form-editor">
					{!selected && (
						<p className="hint">Select a form, or create a new one.</p>
					)}
					{selected && (
						<>
							<div className="panelhead">
								<div>
									<h3>{selected.name}</h3>
									<p>
										Module {selected.module_id} · published version{' '}
										{selected.published_version || '—'}
									</p>
								</div>
								<div className="actions">
									<button type="button" disabled={busy} onClick={() => void saveForm()}>
										Save new version
									</button>
									<button
										type="button"
										className="primary"
										disabled={busy}
										onClick={() => void publish()}
									>
										Publish
									</button>
								</div>
							</div>
							<div className="erp-form-meta">
								<label>
									<span>Name</span>
									<input
										value={selected.name ?? ''}
										onChange={(event) =>
											setSelected({ ...selected, name: event.target.value })
										}
									/>
								</label>
								<label>
									<span>Module</span>
									<select
										value={selected.module_id ?? ''}
										onChange={(event) =>
											setSelected({ ...selected, module_id: event.target.value })
										}
									>
										{erpModules.map((module) => (
											<option key={module.id} value={module.id}>
												{module.title}
											</option>
										))}
									</select>
								</label>
								<label>
									<span>Allowed roles</span>
									<select
										multiple
										value={selected.allowed_roles ?? []}
										onChange={(event) =>
											setSelected({
												...selected,
												allowed_roles: Array.from(
													event.target.selectedOptions,
												).map((option) => option.value),
											})
										}
									>
										{roles.map((role) => (
											<option key={role.code} value={role.code}>
												{role.label}
											</option>
										))}
									</select>
								</label>
							</div>
							<h4>Fields</h4>
							{fields.map((field, index) => (
								<FieldEditor
									key={index}
									field={field}
									onChange={(next) =>
										setFields((current) =>
											current.map((item, itemIndex) =>
												itemIndex === index ? next : item,
											),
										)
									}
									onRemove={() =>
										setFields((current) =>
											current.filter((_, itemIndex) => itemIndex !== index),
										)
									}
								/>
							))}
							<button
								type="button"
								onClick={() => setFields((current) => [...current, emptyField()])}
							>
								+ Add field
							</button>
							<h4>Version history</h4>
							<div className="tablewrap">
								<table>
									<thead>
										<tr>
											<th>Version</th>
											<th>Fields</th>
											<th>Published</th>
											<th>Change note</th>
											<th>Created</th>
										</tr>
									</thead>
									<tbody>
										{versions.map((version) => (
											<tr key={version.id}>
												<td>v{version.version}</td>
												<td>{(version.fields ?? []).length}</td>
												<td>{version.published ? 'Yes' : 'No'}</td>
												<td>{version.change_note}</td>
												<td>
													{version.created_at
														? new Date(version.created_at).toLocaleString()
														: ''}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

export default function ErpAdminSettings({ canManage = false }) {
	const [tab, setTab] = useState('modules');
	const [rows, setRows] = useState([]);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);

	const tableForTab = {
		modules: 'erp_modules',
		permissions: 'erp_module_permissions',
		login: 'login_modules',
		workflows: 'erp_approval_workflows',
		templates: 'erp_receipt_templates',
		reports: 'erp_report_definitions',
		timings: 'erp_module_timings',
		flags: 'erp_feature_flags',
		settings: 'erp_settings',
		audit: 'erp_audit_log',
	};

	const load = useCallback(async () => {
		const table = tableForTab[tab];
		if (!table) return;
		setError('');
		try {
			const { data, error: failure } = await supabase
				.from(table)
				.select('*')
				.limit(500);
			if (failure) throw failure;
			setRows(data ?? []);
		} catch (failure) {
			setError(failure.message ?? 'The records could not be loaded.');
		}
	}, [tab]);

	useEffect(() => {
		load();
	}, [load]);

	async function toggleModule(row) {
		setBusy(true);
		setError('');
		try {
			const { error: failure } = await supabase
				.from('erp_modules')
				.update({ enabled: !row.enabled, updated_at: new Date().toISOString() })
				.eq('id', row.id);
			if (failure) throw failure;
			setNotice(
				`${row.title} ${row.enabled ? 'disabled' : 'enabled'}. The records and the users are untouched.`,
			);
			await load();
		} catch (failure) {
			setError(failure.message ?? 'The module could not be updated.');
		} finally {
			setBusy(false);
		}
	}

	async function toggleLoginModule(row) {
		setBusy(true);
		setError('');
		try {
			const { error: failure } = await supabase
				.from('login_modules')
				.update({ enabled: !row.enabled, updated_at: new Date().toISOString() })
				.eq('id', row.id);
			if (failure) throw failure;
			setNotice(`The login module "${row.name}" was updated.`);
			await load();
		} catch (failure) {
			setError(failure.message ?? 'The login module could not be updated.');
		} finally {
			setBusy(false);
		}
	}

	async function togglePermission(row, column) {
		setBusy(true);
		setError('');
		try {
			const { error: failure } = await supabase
				.from('erp_module_permissions')
				.update({ [column]: !row[column], updated_at: new Date().toISOString() })
				.eq('module_id', row.module_id)
				.eq('role_code', row.role_code);
			if (failure) throw failure;
			await load();
		} catch (failure) {
			setError(failure.message ?? 'The permission could not be updated.');
		} finally {
			setBusy(false);
		}
	}

	async function exportRows() {
		if (!rows.length) return;
		const columns = Object.keys(rows[0])
			.filter((key) => key !== 'created_at' && key !== 'updated_at')
			.map((key) => ({ key, label: key.replaceAll('_', ' ') }));
		await downloadExcel({
			fileName: `svit-${tableForTab[tab]}`,
			sheetName: tab,
			columns,
			rows,
		});
	}

	async function exportTemplate() {
		if (!rows.length) return;
		const columns = Object.keys(rows[0])
			.filter((key) => key !== 'id' && key !== 'created_at' && key !== 'updated_at')
			.map((key) => ({ key, label: key.replaceAll('_', ' ') }));
		await downloadExcelTemplate({
			fileName: `svit-${tableForTab[tab]}-template`,
			sheetName: tab,
			columns,
		});
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Super Admin console</h2>
					<p>
						Modules, roles, permissions, dynamic forms, workflows, templates and
						the system configuration.
					</p>
				</div>
				{canManage && rows.length > 0 && (
					<div className="actions">
						<button type="button" onClick={() => void exportRows()}>
							Export Excel
						</button>
						<button type="button" onClick={() => void exportTemplate()}>
							Template
						</button>
					</div>
				)}
			</div>

			<nav className="erp-tabs" aria-label="Super admin sections">
				{TABS.map((entry) => (
					<button
						type="button"
						key={entry.id}
						className={tab === entry.id ? 'selected' : ''}
						onClick={() => setTab(entry.id)}
					>
						{entry.label}
					</button>
				))}
			</nav>

			{error && <div className="error">{error}</div>}
			{notice && <div className="success">{notice}</div>}

			{tab === 'forms' && <DynamicFormBuilder />}

			{tab !== 'forms' && (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								{rows.length > 0 &&
									Object.keys(rows[0])
										.filter((key) => key !== 'created_at' && key !== 'updated_at')
										.map((key) => (
											<th key={key}>{key.replaceAll('_', ' ')}</th>
										))}
								{tab === 'modules' && <th>Action</th>}
								{tab === 'login' && <th>Action</th>}
								{tab === 'permissions' && <th>Rights</th>}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, index) => (
								<tr key={row.id ?? index}>
									{Object.keys(rows[0])
										.filter((key) => key !== 'created_at' && key !== 'updated_at')
										.map((key) => (
											<td key={key} title={String(row[key] ?? '')}>
												{typeof row[key] === 'object' && row[key] !== null
													? JSON.stringify(row[key]).slice(0, 80)
													: String(row[key] ?? '—')}
											</td>
										))}
									{tab === 'modules' && (
										<td>
											<button
												type="button"
												disabled={busy || !canManage}
												onClick={() => void toggleModule(row)}
											>
												{row.enabled ? 'Disable' : 'Enable'}
											</button>
										</td>
									)}
									{tab === 'login' && (
										<td>
											<button
												type="button"
												disabled={busy || !canManage}
												onClick={() => void toggleLoginModule(row)}
											>
												{row.enabled ? 'Disable' : 'Enable'}
											</button>
										</td>
									)}
									{tab === 'permissions' && (
										<td className="erp-permission-buttons">
											{['can_view', 'can_create', 'can_edit', 'can_delete', 'can_export', 'can_approve'].map(
												(column) => (
													<button
														type="button"
														key={column}
														disabled={busy || !canManage}
														className={row[column] ? 'on' : 'off'}
														onClick={() => void togglePermission(row, column)}
													>
														{column.replace('can_', '')}
													</button>
												),
											)}
										</td>
									)}
								</tr>
							))}
							{!rows.length && (
								<tr>
									<td colSpan={8}>No records found.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
