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
	branch_id: '',
	intake_head: '',
	sanctioned_seats: '',
};
const intakeExcelColumns = [
	{ key: 'academic_year', label: 'Academic year' },
	{ key: 'course_name', label: 'Course' },
	{ key: 'branch_name', label: 'Branch' },
	{ key: 'intake_head', label: 'Intake heading' },
	{ key: 'sanctioned_seats', label: 'Sanctioned seats' },
];

function messageFor(error) {
	if (
		['PGRST204', 'PGRST205', '42P01', '42703'].includes(error?.code) ||
		error?.message?.includes('inquiry_admissions') ||
		error?.message?.includes('admission_intake') ||
		error?.message?.includes('admission_quota_transfers')
	) {
		return 'Final Admissions schema is missing or outdated. Run migrations 005_inquiries.sql, 006_inquiry_admission.sql, 007_intake_capacity.sql, 017_branch_dynamic_intakes.sql, and 018_intake_quota_report.sql in order in the Supabase SQL Editor.';
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
	const [branches, setBranches] = useState([]);
	const [transfers, setTransfers] = useState([]);
	const [intakeForm, setIntakeForm] = useState(emptyIntake);
	const [inquiryNumber, setInquiryNumber] = useState('');
	const [record, setRecord] = useState(null);
	const [rows, setRows] = useState([]);
	const [filter, setFilter] = useState('all');
	const [intakeYearFilter, setIntakeYearFilter] = useState('all');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const selectedBranch = branches.find(
		(branch) => branch.id === intakeForm.branch_id,
	);
	const selectedIntakeHead = selectedBranch?.intake_heads?.find(
		(head) => head.name === intakeForm.intake_head,
	);
	const intakeYears = [...new Set(intakes.map((intake) => intake.academic_year))]
		.filter(Boolean)
		.sort((a, b) => b.localeCompare(a));
	const visibleIntakes = intakes.filter(
		(intake) =>
			intakeYearFilter === 'all' || intake.academic_year === intakeYearFilter,
	);
	const visibleTransfers = transfers.filter(
		(transfer) =>
			intakeYearFilter === 'all' || transfer.academic_year === intakeYearFilter,
	);
	const branchTotals = new Map();
	for (const intake of visibleIntakes) {
		const key = `${intake.academic_year}:${intake.branch_id ?? intake.course_name + ':' + intake.branch_name}`;
		branchTotals.set(key, {
			intake: Number(intake.branch_total_intake ?? intake.sanctioned_seats),
			filled: Number(intake.branch_filled_count ?? intake.admitted_count),
		});
	}
	const intakeSummary = {
		quotaSeats: visibleIntakes.reduce(
			(total, intake) => total + Number(intake.sanctioned_seats),
			0,
		),
		filledSeats: visibleIntakes.reduce(
			(total, intake) => total + Number(intake.admitted_count),
			0,
		),
		cancelledSeats: visibleIntakes.reduce(
			(total, intake) => total + Number(intake.cancelled_count ?? 0),
			0,
		),
		vacantQuota: visibleIntakes.reduce(
			(total, intake) => total + Number(intake.available_seats),
			0,
		),
		branchSeats: [...branchTotals.values()].reduce((total, branch) => total + branch.intake, 0),
		branchFilled: [...branchTotals.values()].reduce((total, branch) => total + branch.filled, 0),
	};

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

	async function loadBranches() {
		if (!canManageIntakes) return null;
		const [branchesResult, coursesResult] = await Promise.all([
			supabase
				.from('branches')
				.select('id,name,course_id,intake,intake_heads')
				.eq('active', true)
				.order('name'),
			supabase.from('courses').select('id,name').eq('active', true).order('name'),
		]);
		const error = branchesResult.error || coursesResult.error;
		if (error) {
			setMessage(messageFor(error));
			return error.message;
		}
		const courses = new Map((coursesResult.data ?? []).map((course) => [course.id, course.name]));
		setBranches(
			(branchesResult.data ?? []).map((branch) => ({
				...branch,
				course_name: courses.get(branch.course_id) ?? '',
				intake_heads: Array.isArray(branch.intake_heads) ? branch.intake_heads : [],
			})),
		);
		return null;
	}

	async function loadTransfers() {
		const { data, error } = await supabase
			.from('admission_quota_transfers')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(500);
		if (error) {
			setMessage(messageFor(error));
			return error.message;
		}
		setTransfers(data ?? []);
		return null;
	}

	async function refresh() {
		setMessage('');
		setLoading(true);
		try {
			const results = await Promise.all([
				loadAdmissions(),
				loadIntakes(),
				loadBranches(),
				loadTransfers(),
			]);
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
			if (!selectedBranch || !selectedIntakeHead) {
				throw new Error('Select a branch and one of its configured intake headings.');
			}
			const seats = Number(intakeForm.sanctioned_seats);
			if (
				!Number.isInteger(seats) ||
				seats < 0 ||
				seats > Number(selectedIntakeHead.seats)
			) {
				throw new Error(
					`Enter a whole seat count from zero to ${selectedIntakeHead.seats} for ${selectedIntakeHead.name}.`,
				);
			}
			const otherHeadAllocations = intakes
				.filter(
					(intake) =>
						intake.academic_year === intakeForm.academic_year.trim() &&
						intake.branch_id === selectedBranch.id,
				)
				.reduce((total, intake) => total + Number(intake.sanctioned_seats), 0);
			if (otherHeadAllocations + seats > Number(selectedBranch.intake)) {
				throw new Error(
					`This academic year's intake allocations would exceed the branch total of ${selectedBranch.intake} seats.`,
				);
			}
			const { error } = await supabase.from('admission_intakes').insert({
				academic_year: intakeForm.academic_year.trim(),
				course_name: selectedBranch.course_name,
				branch_name: selectedBranch.name,
				branch_id: selectedBranch.id,
				intake_head: selectedIntakeHead.name,
				sanctioned_seats: seats,
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
					{ key: 'intake_head', label: 'Intake heading' },
					{ key: 'sanctioned_seats', label: 'Sanctioned seats' },
					{ key: 'admitted_count', label: 'Admitted' },
					{ key: 'cancelled_count', label: 'Cancelled' },
					{ key: 'transfer_in_count', label: 'Transfer in' },
					{ key: 'transfer_out_count', label: 'Transfer out' },
					{ key: 'available_seats', label: 'Available seats' },
					{ key: 'branch_total_intake', label: 'Branch total intake' },
					{ key: 'branch_filled_count', label: 'Branch filled' },
				],
				rows: visibleIntakes,
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
					'Every intake heading for a branch and academic year must be unique.',
					'Configure government intake headings and maximum seats on the Branches screen first.',
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
				const intakeHead = String(row.intake_head ?? 'General').trim();
				const seats = Number(row.sanctioned_seats);
				if (!academicYear || !courseName || !branchName || !intakeHead || !Number.isInteger(seats) || seats < 0)
					throw new Error(
						`Row ${index + 2}: academic year, course, branch, intake heading, and a whole sanctioned-seat count of zero or more are required.`,
					);
				const branch = branches.find(
					(item) =>
						item.name.toLowerCase() === branchName.toLowerCase() &&
						item.course_name.toLowerCase() === courseName.toLowerCase(),
				);
				if (!branch)
					throw new Error(
						`Row ${index + 2}: branch "${branchName}" for course "${courseName}" was not found in Branches.`,
					);
				return {
					academic_year: academicYear,
					course_name: courseName,
					branch_name: branchName,
					branch_id: branch.id,
					intake_head: intakeHead,
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
			await Promise.all([loadAdmissions(), loadIntakes(), loadTransfers()]);
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
				<div className="panelhead intake-report-head">
					<div>
						<h2>Quota Intake &amp; Seat Report</h2>
						<p>Quota allocations, filled/cancelled seats, transfer history, and vacancies.</p>
					</div>
					<select
						aria-label="Filter quota report by academic year"
						value={intakeYearFilter}
						onChange={(event) => setIntakeYearFilter(event.target.value)}
					>
						<option value="all">All academic years</option>
						{intakeYears.map((year) => <option key={year} value={year}>{year}</option>)}
					</select>
				</div>
				<div className="inquiry-kpis intake-report-kpis">
					{[
						['Branch total intake', intakeSummary.branchSeats],
						['Quota seats', intakeSummary.quotaSeats],
						['Filled seats', intakeSummary.filledSeats],
						['Cancelled', intakeSummary.cancelledSeats],
						['Vacant quota seats', intakeSummary.vacantQuota],
						['Branch filled / total', `${intakeSummary.branchFilled} / ${intakeSummary.branchSeats}`],
					].map(([label, value]) => (
						<div className="inquiry-kpi" key={label}>
							<small>{label}</small>
							<strong>{value}</strong>
						</div>
					))}
				</div>
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
								<th>Intake heading</th>
								<th>Quota intake</th>
								<th>Filled</th>
								<th>Cancelled</th>
								<th>Transfer in</th>
								<th>Transfer out</th>
								<th>Vacant quota</th>
								<th>Branch filled / total</th>
								<th>Branch vacant</th>
							</tr>
						</thead>
						<tbody>
							{visibleIntakes.map((intake) => (
								<tr key={intake.id}>
									<td>{intake.academic_year}</td>
									<td>{intake.course_name}</td>
									<td>{intake.branch_name || '—'}</td>
									<td>{intake.intake_head || 'General'}</td>
									<td>{intake.sanctioned_seats}</td>
									<td>{intake.admitted_count}</td>
									<td>{intake.cancelled_count ?? 0}</td>
									<td>{intake.transfer_in_count ?? 0}</td>
									<td>{intake.transfer_out_count ?? 0}</td>
									<td><b>{intake.available_seats}</b></td>
									<td>{intake.branch_filled_count ?? intake.admitted_count} / {intake.branch_total_intake ?? intake.sanctioned_seats}</td>
									<td>{Math.max(0, Number(intake.branch_total_intake ?? intake.sanctioned_seats) - Number(intake.branch_filled_count ?? intake.admitted_count))}</td>
								</tr>
							))}
						</tbody>
					</table>
					{!loading && !visibleIntakes.length && (
						<div className="empty">No intake quota rows for this academic year.</div>
					)}
				</div>
				<h3>Quota transfer history</h3>
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Date</th>
								<th>Admission</th>
								<th>Student</th>
								<th>Academic year</th>
								<th>From</th>
								<th>To</th>
								<th>Reason</th>
							</tr>
						</thead>
						<tbody>
							{visibleTransfers.map((transfer) => (
								<tr key={transfer.id}>
									<td>{new Date(transfer.created_at).toLocaleString()}</td>
									<td>{transfer.admission_number}</td>
									<td>{transfer.student_name}</td>
									<td>{transfer.academic_year}</td>
									<td>
										{transfer.source_course} · {transfer.source_branch || '—'} ·{' '}
										{transfer.source_quota || 'General'}
									</td>
									<td>
										{transfer.destination_course} · {transfer.destination_branch || '—'} ·{' '}
										{transfer.destination_quota || 'General'}
									</td>
									<td>{transfer.note || '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
					{!loading && !visibleTransfers.length && (
						<div className="empty">No quota transfers for this academic year.</div>
					)}
				</div>
				{canManageIntakes && (
					<form className="editgrid" onSubmit={createIntake}>
						<h3>Create academic-year quota allocation</h3>
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
							Course / Branch
							<select
								required
								value={intakeForm.branch_id}
								onChange={(event) => {
									const branch = branches.find((item) => item.id === event.target.value);
									const firstHead = branch?.intake_heads?.[0];
									setIntakeForm({
										...intakeForm,
										branch_id: branch?.id || '',
										course_name: branch?.course_name || '',
										branch_name: branch?.name || '',
										intake_head: firstHead?.name || '',
										sanctioned_seats: firstHead?.seats ?? '',
									});
								}}
							>
								<option value="">Select course and branch</option>
								{branches.map((branch) => (
									<option key={branch.id} value={branch.id}>
										{branch.course_name} · {branch.name} · {branch.intake} total seats
									</option>
								))}
							</select>
						</label>
						<label>
							Government intake heading
							<select
								required
								disabled={!selectedBranch}
								value={intakeForm.intake_head}
								onChange={(event) => {
									const head = selectedBranch?.intake_heads.find(
										(item) => item.name === event.target.value,
									);
									setIntakeForm({
										...intakeForm,
										intake_head: event.target.value,
										sanctioned_seats: head?.seats ?? '',
									});
								}}
							>
								<option value="">Select intake heading</option>
								{(selectedBranch?.intake_heads ?? []).map((head) => (
									<option key={head.name} value={head.name}>
										{head.name} · up to {head.seats} seats
									</option>
								))}
							</select>
						</label>
						<label>
							Seats for this academic year
							<input
								required
								type="number"
								min="0"
								max={selectedIntakeHead?.seats}
								step="1"
								value={intakeForm.sanctioned_seats}
								onChange={(event) =>
									setIntakeForm({
										...intakeForm,
										sanctioned_seats: event.target.value,
									})
								}
							/>
							<small>
								Branch total: {selectedBranch?.intake ?? '—'} seats
								{selectedIntakeHead
									? ` · ${selectedIntakeHead.name} limit: ${selectedIntakeHead.seats}`
									: ''}
							</small>
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
							Academic year / course / branch / quota transfer
							<select
								disabled={!canDecide || record.decision === 'cancelled'}
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
									<option
										key={intake.id}
										value={intake.id}
										disabled={
											Number(intake.available_seats) <= 0 &&
											intake.id !== record.intake_id
										}
									>
										{intake.academic_year} · {intake.course_name} ·{' '}
										{intake.branch_name || 'General'} · {intake.intake_head || 'General'} · {intake.available_seats}{' '}
										seats available
									</option>
								))}
							</select>
							{record.decision === 'admitted' && (
								<small>
									Changing the quota transfers this admitted seat. The report
									records both the source and destination.
								</small>
							)}
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
