import React, { useRef, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel, downloadExcelTemplate, readExcelRows } from '../lib/excel';
import { isUuid, isUuidField } from '../lib/validation';

const numericColumns = new Set([
	'amount_paise',
	'intake',
	'intake_capacity',
	'duration_years',
	'display_order',
	'score',
	'rank',
	'sanctioned_seats',
]);
const booleanColumns = new Set([
	'active',
	'published',
	'required',
	'force_uppercase',
]);
const jsonColumns = new Set(['fields', 'formula', 'components']);

function referenceMatches(value, references, matchColumns) {
	const normalizedValue = String(value).trim().toLowerCase();
	const matches = references.filter((reference) =>
		matchColumns.some(
			(column) =>
				reference[column] != null &&
				String(reference[column]).trim().toLowerCase() === normalizedValue,
		),
	);
	if (matches.length === 1) return matches[0].id;
	if (matches.length > 1)
		throw new Error(`"${value}" matches more than one reference record.`);
	throw new Error(`"${value}" does not match an existing record.`);
}

function convertImportRows(rows, columns, referenceColumns, referenceOptions) {
	return rows.map((row, rowIndex) => {
		const converted = {};
		for (const { key } of columns) {
			const value = row[key];
			if (value === '' || value === null || value === undefined) {
				converted[key] = null;
				continue;
			}
			if (numericColumns.has(key)) {
				const number = Number(value);
				if (!Number.isFinite(number))
					throw new Error(`Row ${rowIndex + 2}: "${key}" must be a number.`);
				converted[key] = number;
				continue;
			}
			if (booleanColumns.has(key)) {
				if (typeof value === 'boolean') {
					converted[key] = value;
					continue;
				}
				const normalized = String(value).trim().toLowerCase();
				if (['true', 'yes', '1'].includes(normalized)) converted[key] = true;
				else if (['false', 'no', '0'].includes(normalized))
					converted[key] = false;
				else throw new Error(`Row ${rowIndex + 2}: "${key}" must be Yes or No.`);
				continue;
			}
			if (jsonColumns.has(key)) {
				try {
					converted[key] =
						typeof value === 'string' ? JSON.parse(value) : value;
				} catch {
					throw new Error(`Row ${rowIndex + 2}: "${key}" must contain valid JSON.`);
				}
				continue;
			}
			if (isUuidField(key)) {
				if (isUuid(value)) {
					converted[key] = String(value).trim();
					continue;
				}
				const reference = referenceColumns[key];
				if (!reference)
					throw new Error(
						`Row ${rowIndex + 2}: "${key}" must be a valid UUID.`,
					);
				try {
					converted[key] = referenceMatches(
						value,
						referenceOptions[key] ?? [],
						reference.matchColumns,
					);
				} catch (error) {
					throw new Error(
						`Row ${rowIndex + 2}: "${key}" ${error instanceof Error ? error.message : 'could not be matched.'}`,
					);
				}
				continue;
			}
			converted[key] = value;
		}
		return converted;
	});
}

export default function ExcelTableTools({
	table,
	page,
	fields,
	allowImport = false,
	referenceColumns = {},
}) {
	const fileInput = useRef(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const columns = fields.map((key) => ({
		key,
		label: key.replaceAll('_', ' '),
	}));

	async function loadAllRows() {
		const result = [];
		const pageSize = 1000;
		for (let offset = 0; offset < 50000; offset += pageSize) {
			const { data, error } = await supabase
				.from(table)
				.select('*')
				.range(offset, offset + pageSize - 1);
			if (error) throw error;
			result.push(...(data ?? []));
			if (!data || data.length < pageSize) return result;
		}
		throw new Error('Export stopped at 50,000 rows. Narrow the dataset first.');
	}

	async function exportRows() {
		setBusy(true);
		setMessage('');
		try {
			const rows = await loadAllRows();
			await downloadExcel({
				fileName: `svit-${table}`,
				sheetName: page,
				columns,
				rows,
			});
			setMessage(`Downloaded ${rows.length} ${page.toLowerCase()} records.`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Excel export failed.');
		} finally {
			setBusy(false);
		}
	}

	async function downloadTemplate() {
		setBusy(true);
		setMessage('');
		try {
			await downloadExcelTemplate({
				fileName: `svit-${table}-template`,
				sheetName: page,
				columns,
				instructions: [
					`This template creates new ${page.toLowerCase()} records; it does not update or delete existing records.`,
					'Boolean values: Yes/No. JSON columns must contain valid JSON.',
					'Reference fields accept an existing UUID, or an exact existing record name/code when supported.',
				],
			});
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Template download failed.');
		} finally {
			setBusy(false);
		}
	}

	async function importFile(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		setBusy(true);
		setMessage('');
		try {
			const rows = await readExcelRows(file, columns);
			const referenceOptions = {};
			for (const [key, reference] of Object.entries(referenceColumns)) {
				if (!columns.some((column) => column.key === key)) continue;
				const selectColumns = [
					'id',
					...new Set(reference.matchColumns),
				].join(',');
				const { data, error } = await supabase
					.from(reference.table)
					.select(selectColumns);
				if (error)
					throw new Error(
						`Could not load ${reference.table} reference records: ${error.message}`,
					);
				referenceOptions[key] = data ?? [];
			}
			const records = convertImportRows(
				rows,
				columns,
				referenceColumns,
				referenceOptions,
			);
			let imported = 0;
			for (let offset = 0; offset < records.length; offset += 100) {
				const batch = records.slice(offset, offset + 100);
				const { error } = await supabase.from(table).insert(batch);
				if (error) {
					throw new Error(
						`${imported} rows imported before row ${offset + 2} failed: ${error.message}`,
					);
				}
				imported += batch.length;
			}
			setMessage(`Imported ${imported} ${page.toLowerCase()} records.`);
			window.dispatchEvent(new CustomEvent('erp-data-imported', { detail: table }));
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Excel import failed.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="excel-tools">
			<button type="button" disabled={busy} onClick={() => void exportRows()}>
				{busy ? 'Working...' : 'Export Excel'}
			</button>
			{allowImport && (
				<button
					type="button"
					disabled={busy}
					onClick={() => void downloadTemplate()}
				>
					Download template
				</button>
			)}
			{allowImport && (
				<>
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
						onChange={(event) => void importFile(event)}
						aria-label={`Import ${page} from Excel`}
					/>
				</>
			)}
			{message && (
				<span className="excel-message" role="status">
					{message}
				</span>
			)}
		</div>
	);
}
