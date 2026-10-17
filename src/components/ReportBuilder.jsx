import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import './ReportBuilder.css';

export default function ReportBuilder({ tables, canManage = true }) {
	const tableOptions = useMemo(
		() => {
			const seenTables = new Set();
			return Object.entries(tables)
				.map(([label, [table, columns]]) => ({
					label,
					table,
					columns,
				}))
				.filter(({ table, columns }) => {
					if (!columns.length || seenTables.has(table)) return false;
					seenTables.add(table);
					return true;
				});
		},
		[tables],
	);
	const [templateType, setTemplateType] = useState('tabular');
	const [baseTable, setBaseTable] = useState('');
	const [title, setTitle] = useState('');
	const [allowedRoles, setAllowedRoles] = useState([]);
	const [selectedColumns, setSelectedColumns] = useState([]);
	const [editingId, setEditingId] = useState('');
	const [templates, setTemplates] = useState([]);
	const [roles, setRoles] = useState([]);
	const [previewRows, setPreviewRows] = useState([]);
	const [message, setMessage] = useState('');
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);

	const activeTable = tableOptions.find((option) => option.table === baseTable);
	const availableColumns = activeTable?.columns ?? [];

	async function loadTemplates() {
		setLoading(true);
		const { data, error } = await supabase
			.from('report_templates')
			.select('*')
			.order('created_at', { ascending: false });
		if (error) {
			setMessage(`Could not load report templates: ${error.message}`);
		} else {
			setTemplates(data ?? []);
		}
		if (canManage) {
			const roleResult = await supabase
				.from('staff_roles')
				.select('code,label')
				.neq('code', 'admin')
				.order('label');
			if (roleResult.error) {
				setMessage(`Could not load staff roles: ${roleResult.error.message}`);
			} else {
				setRoles((roleResult.data ?? []).map((role) => [role.code, role.label]));
				setAllowedRoles((current) =>
					current.length || !roleResult.data?.length
						? current
						: [roleResult.data[0].code],
				);
			}
		}
		setLoading(false);
	}

	useEffect(() => {
		if (!supabase) {
			setMessage('Connect Supabase to manage report templates.');
			setLoading(false);
			return;
		}
		void loadTemplates();
	}, [canManage]);

	function toggleColumn(column) {
		setSelectedColumns((current) => {
			const exists = current.some(
				(item) => (typeof item === 'string' ? item : item.key) === column,
			);
			return exists
				? current.filter(
						(item) => (typeof item === 'string' ? item : item.key) !== column,
					)
				: [...current, column];
		});
	}

	function setColumnLabel(column, label) {
		setSelectedColumns((current) =>
			current.map((item) =>
				item === column || (typeof item === 'object' && item.key === column)
					? { key: column, label }
					: item,
			),
		);
	}

	function normalizedColumns() {
		return selectedColumns.map((column) =>
			typeof column === 'string'
				? { key: column, label: column.replaceAll('_', ' ') }
				: column,
		);
	}

	function editTemplate(template) {
		setEditingId(template.id);
		setTemplateType(template.template_type || 'tabular');
		setBaseTable(template.base_table);
		setTitle(template.title);
		setAllowedRoles(template.allowed_roles ?? []);
		setSelectedColumns(template.selected_columns ?? []);
		setPreviewRows([]);
		setMessage('');
	}

	function clearTemplate() {
		setEditingId('');
		setTemplateType('tabular');
		setBaseTable('');
		setTitle('');
		setAllowedRoles(roles.length ? [roles[0][0]] : []);
		setSelectedColumns([]);
		setPreviewRows([]);
		setMessage('');
	}

	async function saveTemplate(event) {
		event.preventDefault();
		if (!supabase || busy) return;
		if (!title.trim()) {
			setMessage('Enter a template name.');
			return;
		}
		if (!baseTable || !selectedColumns.length) {
			setMessage('Choose a base table and at least one column.');
			return;
		}
		if (!allowedRoles.length) {
			setMessage('Select at least one allowed role.');
			return;
		}
		setBusy(true);
		setMessage('');
		const payload = {
			title: title.trim(),
			base_table: baseTable,
			template_type: templateType,
			allowed_roles: allowedRoles,
			selected_columns: normalizedColumns(),
			updated_at: new Date().toISOString(),
		};
		const result = editingId
			? await supabase
					.from('report_templates')
					.update(payload)
					.eq('id', editingId)
			: await supabase.from('report_templates').insert(payload);
		if (result.error) setMessage(`Could not save template: ${result.error.message}`);
		else {
			setMessage('Report template saved.');
			await loadTemplates();
		}
		setBusy(false);
	}

	async function previewReport() {
		if (!supabase || !baseTable || !selectedColumns.length) {
			setMessage('Choose a base table and at least one column to preview.');
			return;
		}

		setBusy(true);
		setMessage('');
		const keys = normalizedColumns()
			.map((column) => column.key)
			.filter((key) => availableColumns.includes(key));
		if (!keys.length) {
			setMessage('The selected template has no columns available for this table.');
			setBusy(false);
			return;
		}
		const { data, error } = await supabase
			.from(baseTable)
			.select(keys.join(','))
			.limit(100);
		if (error) {
			setMessage(`Could not preview report: ${error.message}`);
			setPreviewRows([]);
		} else {
			setPreviewRows(data ?? []);
			if (!data?.length) setMessage('No records are available for this report.');
		}
		setBusy(false);
	}

	async function runTemplate(template) {
		const option = tableOptions.find((item) => item.table === template.base_table);
		if (!option) {
			setMessage('This report uses a table that is no longer available.');
			return;
		}
		const columns = (template.selected_columns ?? [])
			.map((column) =>
				typeof column === 'string'
					? { key: column, label: column.replaceAll('_', ' ') }
					: column,
			)
			.filter((column) => option.columns.includes(column.key));
		if (!columns.length) {
			setMessage('This report has no valid columns available to display.');
			return;
		}
		setBusy(true);
		setMessage('');
		const { data, error } = await supabase
			.from(template.base_table)
			.select(columns.map((column) => column.key).join(','))
			.limit(100);
		if (error) {
			setMessage(`Could not run report: ${error.message}`);
			setPreviewRows([]);
		} else {
			setBaseTable(template.base_table);
			setTitle(template.title);
			setSelectedColumns(columns);
			setPreviewRows(data ?? []);
			if (!data?.length) setMessage('No records are available for this report.');
		}
		setBusy(false);
	}

	function exportCsv() {
		if (!previewRows.length) {
			setMessage('Preview the report before exporting it.');
			return;
		}
		const columns = normalizedColumns();
		const escapeCsv = (value) =>
			`"${String(value ?? '').replaceAll('"', '""')}"`;
		const csv = [
			columns.map((column) => escapeCsv(column.label)).join(','),
			...previewRows.map((row) =>
				columns.map((column) => escapeCsv(row[column.key])).join(','),
			),
		].join('\r\n');
		const url = URL.createObjectURL(
			new Blob([csv], { type: 'text/csv;charset=utf-8' }),
		);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${title.trim() || 'svit-report'}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function deleteTemplate(template) {
		if (!window.confirm(`Delete report template "${template.title}"?`)) return;
		const { error } = await supabase
			.from('report_templates')
			.delete()
			.eq('id', template.id);
		if (error) setMessage(`Could not delete template: ${error.message}`);
		else {
			if (title === template.title) clearTemplate();
			setMessage('Report template deleted.');
			await loadTemplates();
		}
	}

	return (
		<div className="report-builder">
			{canManage && <section className="report-type-panel">
				<h2>Template Type Selection</h2>
				<label>
					<span>Select what kind of template you want to build:</span>
					<select
						value={templateType}
						onChange={(event) => setTemplateType(event.target.value)}
					>
						<option value="tabular">Standard Tabular (CSV Export / Table View)</option>
					</select>
				</label>
			</section>}

			{message && (
				<div className="report-message" role="status">
					{message}
					<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">
						×
					</button>
				</div>
			)}

			{canManage && <div className="report-builder-grid">
				<aside className="report-schema">
					<h2>⚙ &nbsp;1. Setup &amp; Guide</h2>
					<label>
						Base Table
						<select
							value={baseTable}
							onChange={(event) => {
								setBaseTable(event.target.value);
								setSelectedColumns([]);
								setPreviewRows([]);
							}}
						>
							<option value="">Select Table</option>
							{tableOptions.map((option) => (
								<option key={option.table} value={option.table}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					{activeTable && (
						<div className="report-schema-columns">
							<strong>Schema Explorer · {activeTable.label}</strong>
							{availableColumns.map((column) => (
								<label key={column}>
									<input
										type="checkbox"
										checked={selectedColumns.some(
											(item) => (typeof item === 'string' ? item : item.key) === column,
										)}
										onChange={() => toggleColumn(column)}
									/>
									{column}
								</label>
							))}
						</div>
					)}
				</aside>

				<form className="report-definition" onSubmit={saveTemplate}>
					<h2>2. Define Template</h2>
					<div className="report-definition-fields">
						<label>
							Template Name
							<input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="e.g. APC Admission Form"
								maxLength={120}
								required
							/>
						</label>
						<fieldset>
							<legend>Allowed Roles</legend>
							<div className="report-role-options">
								{roles.map(([value, label]) => (
									<label key={value}>
										<input
											type="checkbox"
											checked={allowedRoles.includes(value)}
											onChange={() =>
												setAllowedRoles((current) =>
													current.includes(value)
														? current.filter((role) => role !== value)
														: [...current, value],
												)
											}
										/>
										{label}
									</label>
								))}
							</div>
						</fieldset>
					</div>

					<section className="report-selected">
						<h3>☷ &nbsp;Selected Columns &amp; Custom Labels</h3>
						{selectedColumns.length ? (
							<div className="report-selected-list">
								{normalizedColumns().map((column, index) => (
									<div className="report-column-row" key={column.key}>
										<span>{index + 1}.</span>
										<b>{column.key}</b>
										<input
											aria-label={`Custom label for ${column.key}`}
											value={column.label}
											onChange={(event) =>
												setColumnLabel(column.key, event.target.value)
											}
										/>
										<button
											type="button"
											aria-label={`Remove ${column.key}`}
											onClick={() => toggleColumn(column.key)}
										>
											Remove
										</button>
									</div>
								))}
							</div>
						) : (
							<p>No columns selected yet. Toggle columns in the Schema Explorer on the left.</p>
						)}
					</section>
					<div className="report-builder-actions">
						<span>{selectedColumns.length} columns selected</span>
						<button type="submit" className="report-save" disabled={busy}>
							{busy ? 'Saving…' : 'Save Template'}
						</button>
						<button type="button" className="report-preview-button" disabled={busy} onClick={() => void previewReport()}>
							Preview
						</button>
					</div>
				</form>
			</div>}

			{previewRows.length > 0 && (
				<section className="report-preview panel">
					<div className="panelhead">
						<div>
							<h2>Report Preview</h2>
							<p>Showing up to 100 records allowed by your account policies.</p>
						</div>
						<button type="button" onClick={exportCsv}>Export CSV</button>
					</div>
					<div className="tablewrap">
						<table>
							<thead>
								<tr>{normalizedColumns().map((column) => <th key={column.key}>{column.label}</th>)}</tr>
							</thead>
							<tbody>
								{previewRows.map((row, index) => (
									<tr key={row.id ?? index}>
										{normalizedColumns().map((column) => (
											<td key={column.key}>{String(row[column.key] ?? '')}</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}

			<section className="report-existing panel">
				<div className="panelhead">
					<div>
						<h2>Existing Templates</h2>
						<p>{canManage ? 'Open a saved template to make changes.' : 'Run a report assigned to your role.'}</p>
					</div>
					{canManage && <button type="button" onClick={clearTemplate}>New Template</button>}
				</div>
				{loading ? <p>Loading templates…</p> : templates.length ? (
					<div className="report-template-list">
						{templates.map((template) => (
							<article key={template.id}>
								<div>
									<strong>{template.title}</strong>
									<small>{template.base_table} · {template.selected_columns?.length ?? 0} columns</small>
								</div>
								<div className="report-template-actions">
									{canManage ? (
										<>
											<button type="button" onClick={() => editTemplate(template)}>Edit</button>
											<button type="button" className="danger" onClick={() => void deleteTemplate(template)}>Delete</button>
										</>
									) : (
										<button type="button" disabled={busy} onClick={() => void runTemplate(template)}>Run report</button>
									)}
								</div>
							</article>
						))}
					</div>
				) : <p className="empty">No report templates saved yet.</p>}
			</section>
		</div>
	);
}
