import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import {
	convertRow,
	downloadImportErrors,
	downloadTableTemplate,
	excelColumns,
	exportTableRows,
	fieldLabel,
	findDuplicate,
} from '../lib/erpExcel';
import { printTable } from '../lib/pdf';
import { money } from '../lib/erpModules';

const PAGE_SIZE = 500;

function formatValue(field, value) {
	if (value === null || value === undefined || value === '') return '—';
	if (field.type === 'money') return money(value);
	if (field.type === 'boolean') return value ? 'Yes' : 'No';
	if (field.type === 'json') {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	if (field.type === 'date' || field.type === 'datetime') {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);
		return field.type === 'date'
			? date.toLocaleDateString()
			: date.toLocaleString();
	}
	return String(value);
}

function toFormValue(field, value) {
	if (value === null || value === undefined) return field.type === 'boolean' ? false : '';
	if (field.type === 'money') return Number(value) / 100;
	if (field.type === 'boolean') return Boolean(value);
	if (field.type === 'json') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return '';
		}
	}
	if (field.type === 'datetime') {
		// The date and time inputs expect "YYYY-MM-DDTHH:mm".
		return String(value).slice(0, 16);
	}
	return value;
}

function fromFormValue(field, value) {
	if (value === '' || value === null || value === undefined) return null;
	if (field.type === 'money') return Math.round(Number(value) * 100);
	if (field.type === 'number') {
		const number = Number(value);
		return Number.isFinite(number) ? number : null;
	}
	if (field.type === 'boolean') return Boolean(value);
	if (field.type === 'json') {
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value);
		} catch {
			throw new Error(`${fieldLabel(field)} must contain valid JSON.`);
		}
	}
	return value;
}

export default function ErpModuleScreen({
	module,
	tableKey,
	permissions = {},
	canManage = false,
	canExport = true,
	onNavigate,
}) {
	const config = useMemo(
		() => (module.tables ?? []).find((table) => table.key === tableKey) ?? null,
		[module, tableKey],
	);
	const [rows, setRows] = useState([]);
	const [kpis, setKpis] = useState([]);
	const [referenceOptions, setReferenceOptions] = useState({});
	const [search, setSearch] = useState('');
	const [filters, setFilters] = useState({});
	const [editing, setEditing] = useState(null);
	const [form, setForm] = useState({});
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);
	const fileInput = useRef(null);

	const can = {
		view: canManage || permissions.view,
		create: canManage || permissions.create,
		edit: canManage || permissions.edit,
		delete: canManage || permissions.delete,
		export: canExport && (canManage || permissions.export),
	};

	const loadRows = useCallback(async () => {
		if (!config) return;
		setBusy(true);
		try {
			const { data, error: failure } = await supabase
				.from(config.table)
				.select('*')
				.limit(PAGE_SIZE);
			if (failure) throw failure;
			const list = (data ?? []).slice().sort((a, b) => {
				const left = a.created_at ?? a.at ?? a.updated_at ?? '';
				const right = b.created_at ?? b.at ?? b.updated_at ?? '';
				return String(right).localeCompare(String(left));
			});
			setRows(list);
			setError('');
		} catch (failure) {
			setError(failure.message ?? 'Could not load the records.');
			setRows([]);
		} finally {
			setBusy(false);
		}
	}, [config]);

	const loadKpis = useCallback(async () => {
		if (!config?.kpis?.length) {
			setKpis([]);
			return;
		}
		const results = await Promise.all(
			config.kpis.map(async (kpi) => {
				let query = supabase
					.from(config.table)
					.select('id', { count: 'exact', head: true });
				for (const [column, value] of Object.entries(kpi.where ?? {})) {
					query = query.eq(column, value);
				}
				const { count, error: failure } = await query;
				if (failure) {
					console.error(`KPI count failed for ${config.table}`, failure);
					return { ...kpi, value: null };
				}
				return { ...kpi, value: count ?? 0 };
			}),
		);
		setKpis(results);
	}, [config]);

	const loadReferences = useCallback(async () => {
		if (!config) return;
		const refs = new Map();
		for (const field of config.fields ?? []) {
			if (field.type !== 'reference' || !field.ref) continue;
			const columns = new Set(['id', ...(field.matchColumns ?? ['name'])]);
			refs.set(field.ref, Array.from(columns).join(','));
		}
		const entries = await Promise.all(
			Array.from(refs.entries()).map(async ([table, columns]) => {
				const { data, error: failure } = await supabase
					.from(table)
					.select(columns)
					.limit(500);
				if (failure) {
					console.error(`Reference ${table} failed`, failure);
					return [table, []];
				}
				return [table, data ?? []];
			}),
		);
		const options = {};
		for (const [table, list] of entries) {
			options[table] = list;
		}
		setReferenceOptions(options);
	}, [config]);

	useEffect(() => {
		loadRows();
		loadKpis();
		loadReferences();
	}, [loadRows, loadKpis, loadReferences]);

	// The values that the filter dropdowns offer are the ones that exist in the
	// loaded records, so a filter never shows an empty list.
	const filterChoices = useMemo(() => {
		const choices = {};
		for (const filter of config?.filters ?? []) {
			if (filter.type === 'reference' && filter.ref) {
				choices[filter.key] = (referenceOptions[filter.ref] ?? []).map(
					(option) => ({
						value: String(option.id),
						label: option.name ?? option.id,
					}),
				);
				continue;
			}
			const values = new Set();
			for (const row of rows) {
				const value = row[filter.key];
				if (value === null || value === undefined || value === '') continue;
				values.add(String(value));
			}
			choices[filter.key] = Array.from(values)
				.sort()
				.map((value) => ({ value, label: value }));
		}
		return choices;
	}, [config, rows, referenceOptions]);

	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();
		const referenceFilters = new Set(
			(config?.filters ?? [])
				.filter((filter) => filter.type === 'reference')
				.map((filter) => filter.key),
		);
		return rows.filter((row) => {
			for (const [key, value] of Object.entries(filters)) {
				if (value === '' || value === undefined || value === null) continue;
				const actual = String(row[key] ?? '');
				if (referenceFilters.has(key)) {
					if (actual !== String(value)) return false;
					continue;
				}
				if (actual.toLowerCase() !== String(value).toLowerCase()) return false;
			}
			if (!needle) return true;
			const haystack = (config?.searchFields ?? [])
				.map((field) => row[field])
				.concat(Object.values(row))
				.map((value) =>
					typeof value === 'object' && value !== null
						? JSON.stringify(value)
						: String(value ?? ''),
				)
				.join(' ')
				.toLowerCase();
			return haystack.includes(needle);
		});
	}, [rows, search, filters, config]);

	function referenceName(field, value) {
		if (!value) return '—';
		const options = referenceOptions[field.ref] ?? [];
		const match = options.find(
			(option) => String(option.id) === String(value),
		);
		return match?.name ?? String(value);
	}

	function startCreate() {
		const initial = {};
		for (const field of config.fields ?? []) {
			initial[field.key] =
				field.type === 'boolean'
					? false
					: field.type === 'json'
						? ''
						: '';
		}
		setForm(initial);
		setEditing('new');
		setError('');
		setNotice('');
	}

	function startEdit(row) {
		const initial = {};
		for (const field of config.fields ?? []) {
			initial[field.key] = toFormValue(field, row[field.key]);
		}
		setForm(initial);
		setEditing(row.id);
		setError('');
		setNotice('');
	}

	async function save(event) {
		event.preventDefault();
		setError('');
		setNotice('');
		const payload = {};
		try {
			for (const field of config.fields ?? []) {
				const value = fromFormValue(field, form[field.key]);
				if (field.required && (value === null || value === '')) {
					throw new Error(`${fieldLabel(field)} is required.`);
				}
				if (field.unique && value !== null && value !== '') {
					const duplicate = rows.some(
						(row) =>
							row.id !== editing &&
							String(row[field.key] ?? '').trim().toLowerCase() ===
								String(value).trim().toLowerCase(),
					);
					if (duplicate) {
						throw new Error(`${fieldLabel(field)} "${value}" already exists.`);
					}
				}
				payload[field.key] = value;
			}
		} catch (failure) {
			setError(failure.message);
			return;
		}

		setBusy(true);
		try {
			const result =
				editing === 'new'
					? await supabase.from(config.table).insert(payload)
					: await supabase.from(config.table).update(payload).eq('id', editing);
			if (result.error) throw result.error;
			setNotice('Record saved.');
			setEditing(null);
			await loadRows();
			await loadKpis();
		} catch (failure) {
			setError(failure.message ?? 'Could not save the record.');
		} finally {
			setBusy(false);
		}
	}

	async function remove(row) {
		if (!confirm(`Delete the ${config.title.toLowerCase().replace(/s$/, '')} record?`))
			return;
		setError('');
		const { error: failure } = await supabase
			.from(config.table)
			.delete()
			.eq('id', row.id);
		if (failure) {
			setError(failure.message);
			return;
		}
		setNotice('Record deleted.');
		await loadRows();
		await loadKpis();
	}

	async function handleExport() {
		setBusy(true);
		setError('');
		try {
			await exportTableRows({
				fileName: `svit-${config.table}`,
				sheetName: config.title,
				fields: config.fields,
				rows: visible,
			});
			setNotice(`Downloaded ${visible.length} records.`);
		} catch (failure) {
			setError(failure.message ?? 'The Excel export failed.');
		} finally {
			setBusy(false);
		}
	}

	async function handleTemplate() {
		setBusy(true);
		setError('');
		try {
			await downloadTableTemplate({
				fileName: `svit-${config.table}-template`,
				sheetName: config.title,
				fields: config.fields,
			});
			setNotice('Template downloaded.');
		} catch (failure) {
			setError(failure.message ?? 'The template download failed.');
		} finally {
			setBusy(false);
		}
	}

	async function handleImport(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		setBusy(true);
		setError('');
		setNotice('');
		try {
			const { readExcelRows } = await import('../lib/excel');
			const columns = excelColumns(config.fields);
			const rawRows = await readExcelRows(file, columns);
			const optionsByKey = {};
			for (const field of config.fields ?? []) {
				if (field.type === 'reference' && field.ref) {
					optionsByKey[field.key] = referenceOptions[field.ref] ?? [];
				}
			}
			const existingKeys = new Set();
			for (const row of rows) {
				for (const field of config.fields ?? []) {
					if (!field.unique) continue;
					const value = row[field.key];
					if (value === null || value === undefined || value === '') continue;
					existingKeys.add(
						`${field.key}::${String(value).trim().toLowerCase()}`,
					);
				}
			}
			const errors = [];
			const accepted = [];
			rawRows.forEach((rawRow, index) => {
				try {
					const converted = convertRow(rawRow, config.fields, optionsByKey);
					const duplicate = findDuplicate(converted, config.fields, existingKeys);
					if (duplicate) {
						errors.push({
							row: index + 2,
							column: fieldLabel(duplicate.field),
							value: duplicate.value,
							reason: `${fieldLabel(duplicate.field)} already exists`,
						});
						return;
					}
					accepted.push(converted);
				} catch (failure) {
					errors.push({
						row: index + 2,
						column: 'row',
						value: Object.values(rawRow).join(' | ').slice(0, 120),
						reason: failure.message,
					});
				}
			});
			if (errors.length) {
				await downloadImportErrors(`svit-${config.table}-import-errors`, errors);
				throw new Error(
					`${errors.length} of ${rawRows.length} rows could not be imported. The error report was downloaded. Nothing was written.`,
				);
			}
			let inserted = 0;
			for (let offset = 0; offset < accepted.length; offset += 100) {
				const batch = accepted.slice(offset, offset + 100);
				const { error: failure } = await supabase
					.from(config.table)
					.insert(batch);
				if (failure) {
					throw new Error(
						`${inserted} rows were imported before a row failed: ${failure.message}`,
					);
				}
				inserted += batch.length;
			}
			setNotice(`Imported ${inserted} records.`);
			await loadRows();
			await loadKpis();
		} catch (failure) {
			setError(failure.message ?? 'The Excel import failed.');
		} finally {
			setBusy(false);
		}
	}

	function handlePdf() {
		try {
			printTable({
				title: config.pdf?.title ?? config.title,
				subtitle: module.title,
				columns: (config.fields ?? []).map((field) => ({
					key: field.key,
					label: fieldLabel(field),
					align: field.type === 'money' || field.type === 'number' ? 'right' : 'left',
					value: (row) =>
						field.type === 'reference'
							? referenceName(field, row[field.key])
							: formatValue(field, row[field.key]),
				})),
				rows: visible,
			});
		} catch (failure) {
			setError(failure.message ?? 'The PDF could not be prepared.');
		}
	}

	if (!config) {
		return (
			<section className="panel">
				<h2>{module.title}</h2>
				<p className="hint">Choose a record list from the navigation.</p>
			</section>
		);
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>{config.title}</h2>
					<p>{config.description}</p>
				</div>
				<div className="actions">
					<input
						placeholder={`Search ${config.title.toLowerCase()}...`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
					{can.export && (
						<>
							<button type="button" disabled={busy} onClick={() => void handleExport()}>
								Export Excel
							</button>
							{config.excel?.template !== false && (
								<button type="button" disabled={busy} onClick={() => void handleTemplate()}>
									Template
								</button>
							)}
						</>
					)}
					{can.export && (
						<button type="button" disabled={busy} onClick={handlePdf}>
							PDF
						</button>
					)}
					{can.create && (
						<button className="primary" type="button" onClick={startCreate}>
							+ Add New
						</button>
					)}
				</div>
			</div>

			{kpis.length > 0 && (
				<div className="stats erp-stats">
					{kpis.map((kpi) => (
						<div className="stat" key={kpi.key}>
							<strong>{kpi.value ?? '—'}</strong>
							<small>{kpi.label}</small>
						</div>
					))}
				</div>
			)}

			{(config.filters ?? []).length > 0 && (
				<div className="erp-filters">
					{(config.filters ?? []).map((filter) => (
						<label key={filter.key}>
							<span>{filter.label}</span>
							{filter.type === 'boolean' ? (
								<select
									value={filters[filter.key] ?? ''}
									onChange={(event) =>
										setFilters((current) => ({
											...current,
											[filter.key]: event.target.value,
										}))
									}
								>
									<option value="">All</option>
									<option value="true">Yes</option>
									<option value="false">No</option>
								</select>
							) : (
								<select
									value={filters[filter.key] ?? ''}
									onChange={(event) =>
										setFilters((current) => ({
											...current,
											[filter.key]: event.target.value,
										}))
									}
								>
									<option value="">All</option>
									{(filterChoices[filter.key] ?? []).map((choice) => (
										<option key={choice.value} value={choice.value}>
											{choice.label}
										</option>
									))}
								</select>
							)}
						</label>
					))}
					{Object.values(filters).some(Boolean) && (
						<button type="button" onClick={() => setFilters({})}>
							Clear filters
						</button>
					)}
				</div>
			)}

			{error && <div className="error">{error}</div>}
			{notice && <div className="success">{notice}</div>}

			{editing && (can.create || can.edit) && (
				<form className="editgrid" onSubmit={save}>
					<h3>{editing === 'new' ? `New ${config.title.replace(/s$/, '')}` : 'Edit record'}</h3>
					{(config.fields ?? []).map((field) => (
						<label key={field.key}>
							<span>
								{fieldLabel(field)}
								{field.required ? ' *' : ''}
							</span>
							{field.type === 'reference' ? (
								<select
									value={form[field.key] ?? ''}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											[field.key]: event.target.value,
										}))
									}
								>
									<option value="">Select</option>
									{(referenceOptions[field.ref] ?? []).map((option) => (
										<option key={option.id} value={option.id}>
											{option.name ?? option.id}
										</option>
									))}
								</select>
							) : field.type === 'boolean' ? (
								<input
									type="checkbox"
									checked={Boolean(form[field.key])}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											[field.key]: event.target.checked,
										}))
									}
								/>
							) : field.type === 'textarea' || field.type === 'json' ? (
								<textarea
									rows="4"
									value={form[field.key] ?? ''}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											[field.key]: event.target.value,
										}))
									}
								/>
							) : field.type === 'select' || field.type === 'radio' ? (
								<select
									value={form[field.key] ?? ''}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											[field.key]: event.target.value,
										}))
									}
								>
									<option value="">Select</option>
									{(field.options ?? []).map((option) => (
										<option key={option} value={option}>
											{option}
										</option>
									))}
								</select>
							) : (
								<input
									type={
										field.type === 'date'
											? 'date'
											: field.type === 'time'
												? 'time'
												: field.type === 'datetime'
													? 'datetime-local'
													: field.type === 'number' || field.type === 'money'
														? 'number'
														: field.type === 'email'
															? 'email'
															: field.type === 'url'
																? 'url'
																: 'text'
									}
									step={field.type === 'money' ? '0.01' : undefined}
									readOnly={field.readonly}
									value={form[field.key] ?? ''}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											[field.key]: event.target.value,
										}))
									}
								/>
							)}
							{field.help && <small className="hint">{field.help}</small>}
						</label>
					))}
					<div className="actions">
						<button className="primary" disabled={busy}>
							Save Record
						</button>
						<button type="button" onClick={() => setEditing(null)}>
							Cancel
						</button>
					</div>				</form>
			)}

			{can.export && config.excel?.import !== false && (
				<div className="excel-tools">
					<button
						type="button"
						disabled={busy}
						onClick={() => fileInput.current?.click()}
					>
						Import Excel
					</button>
					<input
						ref={fileInput}
						className="excel-file-input"
						type="file"
						accept=".xlsx"
						onChange={(event) => void handleImport(event)}
						aria-label={`Import ${config.title} from Excel`}
					/>
				</div>
			)}

			<div className="tablewrap">
				<table>
					<thead>
						<tr>
							{(config.fields ?? []).map((field) => (
								<th key={field.key}>{fieldLabel(field)}</th>
							))}
							{(can.edit || can.delete) && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{visible.map((row) => (
							<tr key={row.id}>
								{(config.fields ?? []).map((field) => (
									<td key={field.key} title={String(row[field.key] ?? '')}>
										{field.type === 'reference'
											? referenceName(field, row[field.key])
											: formatValue(field, row[field.key])}
									</td>
								))}
								{(can.edit || can.delete) && (
									<td>
										{can.edit && (
											<button type="button" onClick={() => startEdit(row)}>
												Edit
											</button>
										)}{' '}
										{can.delete && (
											<button
												type="button"
												className="danger"
												onClick={() => void remove(row)}
											>
												Delete
											</button>
										)}
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
				{!visible.length && (
					<div className="empty">
						{busy ? 'Loading...' : 'No records found.'}
					</div>
				)}
			</div>
			{onNavigate && module.tables?.length > 1 && (
				<div className="erp-table-links">
					{module.tables.map((entry) => (
						<button
							type="button"
							key={entry.key}
							className={entry.key === config.key ? 'selected' : ''}
							onClick={() => onNavigate(entry.key)}
						>
							{entry.title}
						</button>
					))}
				</div>
			)}
		</section>
	);
}
