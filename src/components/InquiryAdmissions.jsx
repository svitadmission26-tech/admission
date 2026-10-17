import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel, downloadExcelTemplate, readExcelRows } from '../lib/excel';

const admissionFields = [
	['student_name', 'Student name'],
	['mobile', 'Mobile'],
	['email', 'Email'],
	['course_name', 'Course'],
	['branch_name', 'Branch'],
	['qualification', 'Qualification'],
	['city', 'City'],
	['enrollment_number', 'Enrollment number'],
];

const emptyIntake = {
	academic_year: '',
	course_name: '',
	branch_name: '',
	sanctioned_seats: '',
};
const intakeExcelColumns = [
	{ key: 'academic_year', label: 'Academic year' },
	{ key: 'course_name', label: 'Course' },
	{ key: 'branch_name', label: 'Branch' },
	{ key: 'sanctioned_seats', label: 'Sanctioned seats' },
];

function messageFor(error) {
	if (
		['PGRST205', '42P01'].includes(error?.code) ||
		error?.message?.includes('inquiry_admissions') ||
		error?.message?.includes('admission_intake')
	) {
		return 'Final Admissions tables are missing. Run migrations 005_inquiries.sql, 006_inquiry_admission.sql, and 007_intake_capacity.sql after migrations 001-004 in the Supabase SQL Editor.';
	}
	return error?.message || 'An unexpected error occurred.';
}

function csvValue(value) {
	const text = String(value ?? '');
	const safe = /^[=+@\-	\r]/.test(text) ? `'${text}` : text;
	return `"${safe.replaceAll('"', '""')}"`;
}

export default function InquiryAdmissions({
	canPrepare,
	canDecide,
	canManageIntakes,
}) {
	const intakeImportRef = useRef(null);
	const [intakes, setIntakes] = useState([]);
	const [intakeForm, setIntakeForm] = useState(emptyIntake);
	const [inquiryNumber, setInquiryNumber] = useState('');
	const [record, setRecord] = useState(null);
	const [rows, setRows] = useState([]);
	const [filter, setFilter] = useState('all');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

	async function loadAdmissions() {
		const { data, error } = await supabase
			.from('inquiry_admissions')
			.select('*,inquiries(inquiry_number)')
			.order('created_at', { ascending: false })
			.limit(500);
		if (error) {
			setMessage(messageFor(error));
			return error.message;
		}
		setRows(data ?? []);
		return null;
	}

	async function loadIntakes() {
		const { data, error } = await supabase
			.from('admission_intake_summary')
			.select('*')
			.order('academic_year', { ascending: false });
		if (error) {
			setMessage(messageFor(error));
			return error.message;
		}
		setIntakes(data ?? []);
		return null;
	}

	async function refresh() {
		setMessage('');
		setLoading(true);
		try {
			const results = await Promise.all([loadAdmissions(), loadIntakes()]);
			return results.find(Boolean) || null;
		} catch (error) {
			const nextMessage = messageFor(error);
			setMessage(nextMessage);
			return nextMessage;
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function createIntake(event) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setMessage('');
		try {
			const { error } = await supabase.from('admission_intakes').insert({
				...intakeForm,
				sanctioned_seats: Number(intakeForm.sanctioned_seats),
				branch_name: intakeForm.branch_name.trim(),
			});
			if (error) throw error;
			setIntakeForm(emptyIntake);
			setMessage('Intake created.');
			await loadIntakes();
		} catch (error) {
			setMessage(messageFor(error));
		} finally {
			setBusy(false);
		}
	}

	async function exportIntakes() {
		try {
			await downloadExcel({
				fileName: 'svit-intake-seat-summary',
				sheetName: 'Seat summary',
				columns: [
					{ key: 'academic_year', label: 'Academic year' },
					{ key: 'course_name', label: 'Course' },
					{ key: 'branch_name', label: 'Branch' },
					{ key: 'sanctioned_seats', label: 'Sanctioned seats' },
					{ key: 'admitted_count', label: 'Admitted' },
					{ key: 'available_seats', label: 'Available seats' },
				],
				rows: intakes,
			});
		} catch (error) {
			setMessage(messageFor(error));
		}
	}

	async function exportAdmissions() {
		try {
			await downloadExcel({
				fileName: `svit-final-admissions-${filter}`,
				sheetName: 'Admissions',
				columns: [
					{ key: 'admission_number', label: 'Admission number' },
					{ key: 'inquiry_number', label: 'Inquiry number' },
					{ key: 'student_name', label: 'Student name' },
					{ key: 'mobile', label: 'Mobile' },
					{ key: 'email', label: 'Email' },
					{ key: 'course_name', label: 'Course' },
					{ key: 'branch_name', label: 'Branch' },
					{ key: 'enrollment_number', label: 'Enrollment number' },
					{ key: 'decision', label: 'Decision' },
					{ key: 'decision_note', label: 'Decision note' },
					{ key: 'created_at', label: 'Created at' },
				],
				rows: shownRows.map((row) => ({
					...row,
					inquiry_number: row.inquiries?.inquiry_number || '',
				})),
			});
		} catch (error) {
			setMessage(messageFor(error));
		}
	}

	async function downloadIntakeTemplate() {
		try {
			await downloadExcelTemplate({
				fileName: 'svit-admission-intake-template',
				sheetName: 'Intakes',
				columns: intakeExcelColumns,
				instructions: [
					'Import creates new intake rows; it does not update existing seat counts.',
					'Use a whole number of zero or more for sanctioned seats.',
					'Academic year, course, and branch must be unique together.',
				],
			});
		} catch (error) {
			setMessage(messageFor(error));
		}
	}

	async function importIntakes(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		setBusy(true);
		setMessage('');
		try {
			const rows = await readExcelRows(file, intakeExcelColumns);
			const records = rows.map((row, index) => {
				const academicYear = String(row.academic_year ?? '').trim();
				const courseName = String(row.course_name ?? '').trim();
				const branchName = String(row.branch_name ?? '').trim();
				const seats = Number(row.sanctioned_seats);
				if (!academicYear || !courseName || !branchName || !Number.isInteger(seats) || seats < 0)
					throw new Error(
						`Row ${index + 2}: academic year, course, branch, and a whole sanctioned-seat count of zero or more are required.`,
					);
				return {
					academic_year: academicYear,
					course_name: courseName,
					branch_name: branchName,
					sanctioned_seats: seats,
				};
			});
			let imported = 0;
			for (let offset = 0; offset < records.length; offset += 100) {
				const batch = records.slice(offset, offset + 100);
				const { error } = await supabase.from('admission_intakes').insert(batch);
				if (error) {
					throw new Error(
						`${imported} rows imported before row ${offset + 2} failed: ${error.message}`,
					);
				}
				imported += batch.length;
			}
			setMessage(`Imported ${imported} intake rows from Excel.`);
			await loadIntakes();
		} catch (error) {
			setMessage(messageFor(error));
		} finally {
			setBusy(false);
		}
	}

	async function fetchInquiry(event) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setMessage('');
		setRecord(null);
		try {
			const { data, error } = await supabase.rpc(
				'prepare_admission_from_inquiry',
				{ p_inquiry_number: inquiryNumber.trim() },
			);
			if (error) throw error;
			setRecord(data);
			setMessage(`Inquiry data loaded. Admission reference: ${data.admission_number}`);
			await loadAdmissions();
		} catch (error) {
			setMessage(messageFor(error));
		} finally {
			setBusy(false);
		}
	}

	async function saveDecision(event) {
		event.preventDefault();
		if (!record || !canDecide || busy) return;
		setBusy(true);
		setMessage('');
		try {
			const args = Object.fromEntries(
				admissionFields.map(([key]) => [`p_${key}`, record[key] || null]),
			);
			const { data, error } = await supabase.rpc('save_admission_decision', {
				p_admission_id: record.id,
				...args,
				p_decision: record.decision,
				p_decision_note: record.decision_note || null,
				p_intake_id: record.intake_id || null,
			});
			if (error) throw error;
			setRecord(data);
			setMessage(`Admission decision saved: ${data.admission_number}`);
			await Promise.all([loadAdmissions(), loadIntakes()]);
		} catch (error) {
			setMessage(messageFor(error));
		} finally {
			setBusy(false);
		}
	}

	const shownRows = useMemo(
		() => rows.filter((row) => filter === 'all' || row.decision === filter),
		[rows, filter],
	);

	function exportCsv() {
		const columns = [
			'admission_number',
			'student_name',
			'mobile',
			'course_name',
			'branch_name',
			'enrollment_number',
			'decision',
			'decision_note',
		];
		const csv = [
			columns.join(','),
			...shownRows.map((row) =>
				columns.map((key) => csvValue(row[key])).join(','),
			),
		].join('\r\n');
		const url = URL.createObjectURL(
			new Blob([csv], { type: 'text/csv;charset=utf-8' }),
		);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `svit-admissions-${filter}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div>
			<section className="panel">
				<h2>Intake &amp; Seat Availability</h2>
				<div className="excel-tools">
					<button type="button" onClick={() => void exportIntakes()}>
						Export seat summary
					</button>
					{canManageIntakes && (
						<>
							<button type="button" onClick={() => void downloadIntakeTemplate()}>
								Download intake template
							</button>
							<button
								type="button"
								disabled={busy}
								onClick={() => intakeImportRef.current?.click()}
							>
								Import intakes
							</button>
							<input
								ref={intakeImportRef}
								className="excel-file-input"
								type="file"
								accept=".xlsx"
								aria-label="Import admission intakes from Excel"
								onChange={(event) => void importIntakes(event)}
							/>
						</>
					)}
				</div>
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Year</th>
								<th>Course</th>
								<th>Branch</th>
								<th>Intake</th>
								<th>Admitted</th>
								<th>Available</th>
							</tr>
						</thead>
						<tbody>
							{intakes.map((intake) => (
								<tr key={intake.id}>
									<td>{intake.academic_year}</td>
									<td>{intake.course_name}</td>
									<td>{intake.branch_name || '—'}</td>
									<td>{intake.sanctioned_seats}</td>
									<td>{intake.admitted_count}</td>
									<td>
										<b>{intake.available_seats}</b>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!loading && !intakes.length && (
						<div className="empty">No admission intakes created.</div>
					)}
				</div>
				{canManageIntakes && (
					<form className="editgrid" onSubmit={createIntake}>
						<h3>Create admission intake</h3>
						<label>
							Academic year
							<input
								required
								value={intakeForm.academic_year}
								onChange={(event) =>
									setIntakeForm({
										...intakeForm,
										academic_year: event.target.value,
									})
								}
								placeholder="2026-27"
							/>
						</label>
						<label>
							Course
							<input
								required
								value={intakeForm.course_name}
								onChange={(event) =>
									setIntakeForm({
										...intakeForm,
										course_name: event.target.value,
									})
								}
							/>
						</label>
						<label>
							Branch (optional)
							<input
								value={intakeForm.branch_name}
								onChange={(event) =>
									setIntakeForm({
										...intakeForm,
										branch_name: event.target.value,
									})
								}
							/>
						</label>
						<label>
							Sanctioned seats
							<input
								required
								type="number"
								min="0"
								step="1"
								value={intakeForm.sanctioned_seats}
								onChange={(event) =>
									setIntakeForm({
										...intakeForm,
										sanctioned_seats: event.target.value,
									})
								}
							/>
						</label>
						<div className="actions">
							<button className="primary" disabled={busy}>
								{busy ? 'Saving...' : 'Create intake'}
							</button>
							<button type="button" disabled={busy} onClick={() => void loadIntakes()}>
								Refresh seats
							</button>
						</div>
					</form>
				)}
			</section>

			<section className="panel">
				<h2>Inquiry → Final Admission</h2>
				<p>
					Enter the generated inquiry ID to prepare its linked admission
					record. Fetching an existing inquiry does not create a duplicate.
				</p>
				{canPrepare && (
					<form className="actions inquiry-lookup" onSubmit={fetchInquiry}>
						<input
							aria-label="Inquiry ID"
							placeholder="INQ-XXXXXXXXXX"
							required
							value={inquiryNumber}
							onChange={(event) => setInquiryNumber(event.target.value)}
						/>
						<button className="primary" disabled={busy}>
							{busy ? 'Loading...' : 'Fetch inquiry data'}
						</button>
					</form>
				)}
				{record && (
					<form className="editgrid" onSubmit={saveDecision}>
						<h3>Admission: {record.admission_number}</h3>
						{admissionFields.map(([key, label]) => (
							<label key={key}>
								{label}
								<input
									disabled={!canDecide}
									required={['student_name', 'mobile', 'course_name'].includes(
										key,
									)}
									type={key === 'email' ? 'email' : 'text'}
									value={record[key] || ''}
									onChange={(event) =>
										setRecord({ ...record, [key]: event.target.value })
									}
								/>
							</label>
						))}
						<label>
							Academic year / course / branch intake
							<select
								disabled={!canDecide || record.decision === 'admitted'}
								value={record.intake_id || ''}
								onChange={(event) => {
									const intake = intakes.find(
										(item) => item.id === event.target.value,
									);
									setRecord({
										...record,
										intake_id: event.target.value || null,
										...(intake
											? {
													course_name: intake.course_name,
													branch_name: intake.branch_name,
												}
											: {}),
									});
								}}
							>
								<option value="">Select intake</option>
								{intakes.map((intake) => (
									<option key={intake.id} value={intake.id}>
										{intake.academic_year} · {intake.course_name} ·{' '}
										{intake.branch_name || 'General'} · {intake.available_seats}{' '}
										seats available
									</option>
								))}
							</select>
						</label>
						<label>
							Final decision
							<select
								disabled={!canDecide}
								value={record.decision}
								onChange={(event) =>
									setRecord({ ...record, decision: event.target.value })
								}
							>
								<option value="pending">Pending</option>
								<option
									value="admitted"
									disabled={record.decision === 'cancelled'}
								>
									Admitted
								</option>
								<option value="not_admitted">Not admitted</option>
								<option value="cancelled">Cancelled</option>
							</select>
						</label>
						<label>
							Decision note / reason
							<textarea
								disabled={!canDecide}
								required={['not_admitted', 'cancelled'].includes(
									record.decision,
								)}
								value={record.decision_note || ''}
								onChange={(event) =>
									setRecord({ ...record, decision_note: event.target.value })
								}
							/>
						</label>
						{canDecide && (
							<button className="primary" disabled={busy}>
								{busy ? 'Saving...' : 'Save final admission'}
							</button>
						)}
					</form>
				)}
			</section>

			<section className="panel">
				<div className="panelhead">
					<div>
						<h2>Admission Status Lists</h2>
						<p>Inquiry-linked records with a separate admission reference.</p>
					</div>
					<div className="actions">
						<select
							aria-label="Filter admissions"
							value={filter}
							onChange={(event) => setFilter(event.target.value)}
						>
							<option value="all">All ({rows.length})</option>
							{['pending', 'admitted', 'not_admitted', 'cancelled'].map(
								(decision) => (
									<option key={decision} value={decision}>
										{decision.replaceAll('_', ' ')} (
										{rows.filter((row) => row.decision === decision).length})
									</option>
								),
							)}
						</select>
						<button type="button" onClick={() => void refresh()}>
							Refresh
						</button>
						<button type="button" onClick={exportCsv}>
							Export CSV
						</button>
						<button type="button" onClick={() => void exportAdmissions()}>
							Export Excel
						</button>
					</div>
				</div>
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Inquiry ID</th>
								<th>Admission ID</th>
								<th>Student</th>
								<th>Mobile</th>
								<th>Course</th>
								<th>Enrollment</th>
								<th>Decision</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{shownRows.map((row) => (
								<tr key={row.id}>
									<td>{row.inquiries?.inquiry_number || '—'}</td>
									<td>{row.admission_number}</td>
									<td>{row.student_name}</td>
									<td>{row.mobile}</td>
									<td>{row.course_name}</td>
									<td>{row.enrollment_number || '—'}</td>
									<td>
										<span className="pill">
											{row.decision.replaceAll('_', ' ')}
										</span>
									</td>
									<td>
										<button type="button" onClick={() => setRecord(row)}>
											Open
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{loading && <div className="empty">Loading admissions...</div>}
					{!loading && !shownRows.length && (
						<div className="empty">No records in this list.</div>
					)}
				</div>
			</section>
			{message && (
				<div className="success" role="status">
					{message}
					<button type="button" onClick={() => setMessage('')}>
						×
					</button>
				</div>
			)}
		</div>
	);
}
