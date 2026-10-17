import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import {
	createEmptyAdmissionWorkbook,
	downloadExcel,
	readAdmissionWorkbook,
	recalculateWorkbookCourseIntakes,
} from '../lib/excel';
import './WorkbookManager.css';

function normalizeSheet(sheet) {
	return {
		...sheet,
		rows: (sheet.rows ?? []).map((row, index) => ({
			...row,
			_rowId: row._rowId || `${sheet.sheet_name}-${index + 1}`,
		})),
	};
}

function displayValue(value) {
	if (value === null || value === undefined || value === '') return '—';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

function editableValue(value) {
	return typeof value === 'object' && value !== null
		? JSON.stringify(value, null, 2)
		: (value ?? '');
}

function parseRow(sheet, row) {
	const next = { ...row };
	for (const column of sheet.columns) {
		const value = next[column.key];
		if (typeof value === 'string' && value.trim() === '') {
			next[column.key] = null;
			continue;
		}
		if (column.type === 'number' && value !== null && value !== undefined) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed))
				throw new Error(`"${column.label}" must be a valid number.`);
			next[column.key] = parsed;
		}
		if (column.type === 'boolean' && value !== null && value !== undefined) {
			if (typeof value === 'boolean') continue;
			const normalized = String(value).trim().toLowerCase();
			if (['yes', 'true', '1'].includes(normalized)) next[column.key] = true;
			else if (['no', 'false', '0'].includes(normalized)) next[column.key] = false;
			else throw new Error(`"${column.label}" must be Yes or No.`);
		}
		if (column.type === 'json' && value !== null && value !== undefined) {
			try {
				next[column.key] = typeof value === 'string' ? JSON.parse(value) : value;
			} catch {
				throw new Error(`"${column.label}" must contain valid JSON.`);
			}
		}
	}
	if (!sheet.columns.some((column) => {
		const value = next[column.key];
		return value !== null && value !== undefined && String(value).trim() !== '';
	}))
		throw new Error('Enter at least one value before saving this row.');
	return next;
}

export default function WorkbookManager() {
	const [sheets, setSheets] = useState(createEmptyAdmissionWorkbook);
	const [selectedName, setSelectedName] = useState('Courses');
	const [search, setSearch] = useState('');
	const [editing, setEditing] = useState(null);
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);

	const selected = sheets.find((sheet) => sheet.sheet_name === selectedName);
	const visibleRows = useMemo(
		() =>
			(selected?.rows ?? []).filter((row) =>
				JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
			),
		[selected, search],
	);

	useEffect(() => {
		let mounted = true;
		async function loadSheets() {
			const { data, error } = await supabase
				.from('workbook_sheets')
				.select('sheet_name,columns,rows');
			if (!mounted) return;
			if (error) {
				setMessage(error.message);
				return;
			}
			if (!data?.length) return;
			const persisted = new Map(
				data.map((sheet) => [sheet.sheet_name, normalizeSheet(sheet)]),
			);
			setSheets(
				createEmptyAdmissionWorkbook().map(
					(sheet) => persisted.get(sheet.sheet_name) ?? sheet,
				),
			);
		}
		void loadSheets();
		return () => {
			mounted = false;
		};
	}, []);

	async function persistWorkbook(nextSheets, successMessage) {
		setBusy(true);
		setMessage('');
		try {
			nextSheets = recalculateWorkbookCourseIntakes(nextSheets);
			const { data, error } = await supabase.rpc('import_svit_workbook', {
				p_sheets: nextSheets,
			});
			if (error) throw error;
			setSheets(nextSheets.map(normalizeSheet));
			setEditing(null);
			setMessage(`${successMessage} ${Number(data || 0).toLocaleString()} workbook rows are now synced.`);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: 'Could not save workbook data.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function importWorkbook(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		if (
			sheets.some((sheet) => sheet.rows.length) &&
			!window.confirm(
				'Importing replaces the saved workbook sheets with the selected workbook. Continue?',
			)
		)
			return;
		setBusy(true);
		setMessage('');
		try {
			const imported = (await readAdmissionWorkbook(file)).map(normalizeSheet);
			const { data, error } = await supabase.rpc('import_svit_workbook', {
				p_sheets: imported,
			});
			if (error) throw error;
			setSheets(imported);
			setSelectedName(imported[0]?.sheet_name ?? 'Courses');
			setEditing(null);
			setMessage(
				`Imported ${Number(data || 0).toLocaleString()} workbook rows and synced matching ERP records.`,
			);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: 'Workbook import failed. No data was saved.',
			);
		} finally {
			setBusy(false);
		}
	}

	function beginAdd() {
		const row = Object.fromEntries(
			selected.columns.map((column) => [
				column.key,
				column.type === 'boolean' ? false : '',
			]),
		);
		setEditing({ index: null, row });
	}

	function beginEdit(row, index) {
		setEditing({
			index,
			row: Object.fromEntries(
				selected.columns.map((column) => [
					column.key,
					editableValue(row[column.key]),
				]).concat([
					['_rowId', row._rowId],
					...(row._row_number ? [['_row_number', row._row_number]] : []),
					...(row['Course Code'] ? [['Course Code', row['Course Code']]] : []),
				]),
			),
		});
	}

	async function saveRow(event) {
		event.preventDefault();
		try {
			const row = parseRow(selected, editing.row);
			if (!row._rowId) row._rowId = `${Date.now()}-${crypto.randomUUID()}`;
			const nextRows = [...selected.rows];
			if (editing.index === null) nextRows.push(row);
			else nextRows[editing.index] = row;
			const nextSheets = sheets.map((sheet) =>
				sheet.sheet_name === selected.sheet_name
					? { ...sheet, rows: nextRows }
					: sheet,
			);
			await persistWorkbook(
				nextSheets,
				editing.index === null ? 'Row added.' : 'Row updated.',
			);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Could not save row.');
		}
	}

	async function deleteRow(row) {
		if (
			!window.confirm(
				'Remove this row from the saved workbook sheet? Previously synced ERP records are not deleted.',
			)
		)
			return;
		const nextSheets = sheets.map((sheet) =>
			sheet.sheet_name === selected.sheet_name
				? {
						...sheet,
						rows: sheet.rows.filter((item) => item._rowId !== row._rowId),
					}
				: sheet,
		);
		await persistWorkbook(nextSheets, 'Row removed from the workbook sheet.');
	}

	async function exportSheet() {
		setBusy(true);
		setMessage('');
		try {
			await downloadExcel({
				fileName: `svit-${selected.sheet_name.toLowerCase().replaceAll(' ', '-')}`,
				sheetName: selected.sheet_name,
				columns: selected.columns,
				rows: visibleRows,
			});
			setMessage(`Downloaded ${visibleRows.length} ${selected.sheet_name} rows.`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Excel export failed.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="panel workbook-manager">
			<div className="panelhead workbook-heading">
				<div>
					<h2>Workbook data and ERP setup</h2>
					<p>
						Import all nine Excel sheets, manage rows by their headings, and sync
						matching colleges, courses, branches, forms, fees, and merit setup.
					</p>
				</div>
				<div className="actions">
					<label className="primary workbook-upload">
						{busy ? 'Working…' : 'Import complete workbook'}
						<input
							type="file"
							accept=".xlsx"
							disabled={busy}
							onChange={(event) => void importWorkbook(event)}
						/>
					</label>
					<button type="button" disabled={busy || !selected} onClick={() => void exportSheet()}>
						Export sheet
					</button>
				</div>
			</div>
			{message && (
				<div className="workbook-message" role="status">
					{message}
				</div>
			)}
			<div className="workbook-layout">
				<nav className="workbook-sheets" aria-label="Workbook sheets">
					{ sheets.map((sheet) => (
						<button
							type="button"
							key={sheet.sheet_name}
							className={selectedName === sheet.sheet_name ? 'selected' : ''}
							onClick={() => {
								setSelectedName(sheet.sheet_name);
								setEditing(null);
								setSearch('');
							}}
						>
							<span>{sheet.sheet_name}</span>
							<small>{sheet.rows.length}</small>
						</button>
					))}
				</nav>
				<div className="workbook-content">
					<div className="panelhead">
						<div>
							<h3>{selected?.sheet_name}</h3>
							<p>{selected?.rows.length ?? 0} saved records</p>
						</div>
						<div className="actions">
							<input
								placeholder={`Search ${selected?.sheet_name ?? 'sheet'}...`}
								value={search}
								onChange={(event) => setSearch(event.target.value)}
							/>
							<button type="button" className="primary" onClick={beginAdd}>
								+ Add row
							</button>
						</div>
					</div>
					{editing && (
						<form className="workbook-editgrid" onSubmit={(event) => void saveRow(event)}>
							<h3>{editing.index === null ? 'Add row' : 'Edit row'}</h3>
							{selected.columns.map((column) => (
								<label key={column.key}>
									{column.label}
									{column.type === 'json' ? (
										<textarea
											rows={7}
											value={editing.row[column.key] ?? ''}
											onChange={(event) =>
												setEditing({
													...editing,
													row: { ...editing.row, [column.key]: event.target.value },
												})
											}
										/>
									) : column.type === 'boolean' ? (
										<select
											value={String(editing.row[column.key] ?? false)}
											onChange={(event) =>
												setEditing({
													...editing,
													row: {
														...editing.row,
														[column.key]: event.target.value,
													},
												})
											}
										>
											<option value="true">Yes</option>
											<option value="false">No</option>
										</select>
									) : (
										<input
											type={column.type === 'number' ? 'number' : 'text'}
											value={editing.row[column.key] ?? ''}
											onChange={(event) =>
												setEditing({
													...editing,
													row: { ...editing.row, [column.key]: event.target.value },
												})
											}
										/>
									)}
								</label>
							))}
							<div className="actions workbook-form-actions">
								<button type="submit" className="primary" disabled={busy}>
									{busy ? 'Saving…' : 'Save and sync'}
								</button>
								<button type="button" onClick={() => setEditing(null)}>
									Cancel
								</button>
							</div>
						</form>
					)}
					<div className="tablewrap">
						<table>
							<thead>
								<tr>
									{selected?.columns.map((column) => (
										<th key={column.key}>{column.label}</th>
									))}
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{visibleRows.map((row, index) => (
									<tr key={row._rowId}>
										{selected.columns.map((column) => (
											<td key={column.key} title={displayValue(row[column.key])}>
												{displayValue(row[column.key])}
											</td>
										))}
										<td className="workbook-row-actions">
											<button type="button" onClick={() => beginEdit(row, selected.rows.indexOf(row))}>
												Edit
											</button>
											<button
												type="button"
												className="danger"
												disabled={busy}
												onClick={() => void deleteRow(row)}
											>
												Delete
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{!visibleRows.length && (
							<div className="empty">
								{selected?.rows.length
									? 'No matching records.'
									: 'Import the workbook to load its sheet data, or add rows here.'}
							</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
