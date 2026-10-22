// Shared Excel helpers for every ERP module.
//
// Every module gets the same behaviour:
//   - export the visible records to .xlsx
//   - download a template with the module's own columns
//   - import a workbook with per-column validation, reference resolution,
//     duplicate detection and a downloadable error report
//
// The import never writes a single row before the whole file has been
// validated, so a broken workbook can never leave half-imported data behind.

import {
	downloadExcel,
	downloadExcelTemplate,
	readExcelRows,
} from './excel.js';

const numericTypes = new Set(['number', 'money']);
const booleanTypes = new Set(['boolean', 'checkbox']);

export function fieldLabel(field) {
	if (typeof field === 'string') {
		return field.replaceAll('_', ' ').replace(/\b\w/g, (character) =>
			character.toUpperCase(),
		);
	}
	return field?.label ?? field?.key ?? '';
}

export function excelColumns(fields) {
	return fields.map((field) => ({
		key: field.key,
		label: fieldLabel(field),
	}));
}

function normaliseText(value) {
	return String(value ?? '').trim().toLowerCase();
}

function parseBoolean(value) {
	if (typeof value === 'boolean') return value;
	const normalised = normaliseText(value);
	if (['true', 'yes', '1'].includes(normalised)) return true;
	if (['false', 'no', '0', ''].includes(normalised)) return false;
	throw new Error('must be Yes or No');
}

function parseNumber(value, field) {
	const number = Number(String(value).replace(/[, ]/g, ''));
	if (!Number.isFinite(number)) {
		throw new Error(`must be a number${field.unit ? ` (${field.unit})` : ''}`);
	}
	return number;
}

// A reference column accepts the uuid of the record or its name / code.
function resolveReference(value, field, referenceOptions) {
	const options = referenceOptions?.[field.key] ?? [];
	const text = String(value ?? '').trim();
	if (!text) return null;
	const direct = options.find(
		(option) => String(option.id).toLowerCase() === text.toLowerCase(),
	);
	if (direct) return direct.id;
	const matchColumns = field.matchColumns ?? ['name'];
	const matches = options.filter((option) =>
		matchColumns.some(
			(column) =>
				option[column] != null &&
				normaliseText(option[column]) === normaliseText(text),
		),
	);
	if (matches.length === 1) return matches[0].id;
	if (matches.length > 1) {
		throw new Error(
			`"${text}" matches more than one ${field.refLabel ?? 'reference'} record`,
		);
	}
	throw new Error(
		`"${text}" does not match an existing ${field.refLabel ?? 'reference'} record`,
	);
}

// Validate and convert one workbook row against the module field list.
export function convertRow(row, fields, referenceOptions) {
	const converted = {};
	for (const field of fields) {
		const raw = row[field.key];
		const empty =
			raw === null ||
			raw === undefined ||
			(String(raw).trim() === '' && typeof raw !== 'boolean');
		if (empty) {
			if (field.required) {
				throw new Error(`${fieldLabel(field)} is required`);
			}
			converted[field.key] = field.defaultValue ?? null;
			continue;
		}
		if (numericTypes.has(field.type)) {
			const number = parseNumber(raw, field);
			// The ERP stores the amounts in paise, the workbook shows rupees.
			converted[field.key] =
				field.type === 'money' ? Math.round(number * 100) : number;
			continue;
		}
		if (booleanTypes.has(field.type)) {
			converted[field.key] = parseBoolean(raw);
			continue;
		}
		if (field.type === 'reference') {
			converted[field.key] = resolveReference(raw, field, referenceOptions);
			continue;
		}
		if (field.type === 'date') {
			const text = String(raw).trim();
			if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
				throw new Error(`${fieldLabel(field)} must be a date (YYYY-MM-DD)`);
			}
			converted[field.key] = text;
			continue;
		}
		if (field.type === 'email') {
			const text = String(raw).trim();
			if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
				throw new Error(`${fieldLabel(field)} must be a valid email address`);
			}
			converted[field.key] = text;
			continue;
		}
		if (field.type === 'phone') {
			const digits = String(raw).replace(/[^0-9]/g, '');
			if (digits.length < 10) {
				throw new Error(`${fieldLabel(field)} must be a valid phone number`);
			}
			converted[field.key] = String(raw).trim();
			continue;
		}
		if (field.type === 'select' || field.type === 'radio') {
			const options = (field.options ?? []).map((option) =>
				typeof option === 'string' ? option : option.value,
			);
			if (options.length && !options.includes(String(raw).trim())) {
				throw new Error(
					`${fieldLabel(field)} must be one of: ${options.join(', ')}`,
				);
			}
			converted[field.key] = String(raw).trim();
			continue;
		}
		if (field.type === 'json') {
			try {
				converted[field.key] =
					typeof raw === 'string' ? JSON.parse(raw) : raw;
			} catch {
				throw new Error(`${fieldLabel(field)} must contain valid JSON`);
			}
			continue;
		}
		converted[field.key] = String(raw).trim();
	}
	return converted;
}

// Detect a duplicate against the rows that already exist and inside the file.
export function findDuplicate(converted, fields, existingKeys) {
	for (const field of fields) {
		if (!field.unique) continue;
		const value = converted[field.key];
		if (value === null || value === undefined || value === '') continue;
		const key = `${field.key}::${normaliseText(value)}`;
		if (existingKeys.has(key)) {
			return { field, value, key };
		}
		existingKeys.add(key);
	}
	return null;
}

export async function exportTableRows({
	fileName,
	sheetName,
	fields,
	rows,
	extraRows = [],
}) {
	// The workbook shows the amounts in rupees, the database stores paise.
	const exportRows = rows.map((row) => {
		const copy = { ...row };
		for (const field of fields) {
			if (field.type !== 'money') continue;
			const value = copy[field.key];
			if (value === null || value === undefined || value === '') continue;
			copy[field.key] = Number(value) / 100;
		}
		return copy;
	});
	await downloadExcel({
		fileName,
		sheetName,
		columns: excelColumns(fields),
		rows: [...exportRows, ...extraRows],
	});
}

export async function downloadTableTemplate({
	fileName,
	sheetName,
	fields,
	instructions = [],
}) {
	await downloadExcelTemplate({
		fileName,
		sheetName,
		columns: excelColumns(fields),
		instructions: [
			`This template creates new ${String(sheetName).toLowerCase()} records. It never updates or deletes existing records.`,
			'Dates use the YYYY-MM-DD format. Boolean values use Yes or No.',
			'Reference columns accept the record name or code of an existing record.',
			...instructions,
		],
	});
}

// Download the rows that could not be imported, with the reason for each.
export async function downloadImportErrors(fileName, errors) {
	const ExcelJS = (await import('exceljs')).default;
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'SVIT Admission ERP';
	const worksheet = workbook.addWorksheet('Import errors');
	worksheet.columns = [
		{ header: 'Row', key: 'row', width: 10 },
		{ header: 'Column', key: 'column', width: 28 },
		{ header: 'Value', key: 'value', width: 34 },
		{ header: 'Reason', key: 'reason', width: 58 },
	];
	worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
	worksheet.getRow(1).fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFB52B3A' },
	};
	for (const error of errors) {
		worksheet.addRow({
			row: error.row,
			column: error.column,
			value: error.value ?? '',
			reason: error.reason,
		});
	}
	const buffer = await workbook.xlsx.writeBuffer();
	const url = URL.createObjectURL(
		new Blob([buffer], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		}),
	);
	const link = document.createElement('a');
	link.href = url;
	link.download = `${fileName}.xlsx`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
