import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel, downloadExcelTemplate, readExcelRows } from '../lib/excel';
import './InquiryModule.css';

const initialInquiry = {
	student_name: '',
	mobile: '',
	email: '',
	course_interest: '',
	branch_interest: '',
	qualification: '',
	city: '',
	source: 'website',
	message: '',
	consent: false,
	website: '',
};

const inquiryStatuses = [
	'all',
	'new',
	'contacted',
	'interested',
	'follow_up',
	'converted',
	'closed',
];
const inquiryExcelColumns = [
	{ key: 'student_name', label: 'Student name' },
	{ key: 'mobile', label: 'Mobile' },
	{ key: 'email', label: 'Email' },
	{ key: 'course_interest', label: 'Course interest' },
	{ key: 'branch_interest', label: 'Branch interest' },
	{ key: 'qualification', label: 'Qualification' },
	{ key: 'city', label: 'City' },
	{ key: 'source', label: 'Source' },
	{ key: 'message', label: 'Message' },
	{ key: 'consent', label: 'Consent' },
];

function errorText(error) {
	if (error?.code === 'PGRST202' || error?.code === '42883') {
		return 'Inquiry database functions are missing. Run migrations 005_inquiries.sql through 007_intake_capacity.sql in Supabase in order.';
	}
	if (error?.code === 'PGRST205' || error?.code === '42P01') {
		return 'Inquiry tables are missing. Run migrations 005_inquiries.sql through 007_intake_capacity.sql in Supabase in order.';
	}
	return error?.message || 'An unexpected error occurred.';
}

export function PublicInquiry() {
	const [form, setForm] = useState(initialInquiry);
	const [busy, setBusy] = useState(false);
	const [reference, setReference] = useState('');
	const [error, setError] = useState('');

	async function submit(event) {
		event.preventDefault();
		if (busy) return;
		setError('');
		setBusy(true);
		try {
			const args = Object.fromEntries(
				Object.entries(form).map(([key, value]) => [`p_${key}`, value]),
			);
			const { data, error: submitError } = await supabase.rpc(
				'submit_public_inquiry',
				args,
			);
			if (submitError) throw submitError;
			setReference(data);
			setForm(initialInquiry);
		} catch (submitError) {
			setError(errorText(submitError));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="inquiry-public">
			<section className="inquiry-hero">
				<a className="inquiry-mark" href="/" aria-label="SVIT home">
					S
				</a>
				<span>SVIT ADMISSION CELL</span>
				<h1>Your future starts with a conversation.</h1>
				<p>
					Ask us about courses, eligibility, or admissions. Submit your inquiry
					and our team will contact you.
				</p>
				<div className="hero-note">
					Admission guidance · Course information · Follow-up support
				</div>
			</section>
			<section className="inquiry-form-wrap">
				<div className="inquiry-form-head">
					<small>ADMISSION ENQUIRY</small>
					<h2>Get in touch</h2>
					<p>Fields marked * are required.</p>
				</div>
				{reference ? (
					<div className="inquiry-confirm" role="status">
						<h2>Thank you!</h2>
						<p>Your inquiry has been received. Save this reference number:</p>
						<strong>{reference}</strong>
						<p>Our admission team will contact you.</p>
						<button type="button" onClick={() => setReference('')}>
							Submit another inquiry
						</button>
					</div>
				) : (
					<form className="inquiry-form" onSubmit={submit}>
						<label>
							Student full name *
							<input
								required
								maxLength={120}
								value={form.student_name}
								onChange={(event) =>
									setForm({ ...form, student_name: event.target.value })
								}
								placeholder="Enter your full name"
							/>
						</label>
						<div className="inquiry-pair">
							<label>
								Mobile number *
								<input
									required
									inputMode="numeric"
									pattern="[6-9][0-9]{9}"
									maxLength={10}
									value={form.mobile}
									onChange={(event) =>
										setForm({ ...form, mobile: event.target.value })
									}
									placeholder="10-digit mobile"
								/>
							</label>
							<label>
								Email address
								<input
									type="email"
									maxLength={254}
									value={form.email}
									onChange={(event) =>
										setForm({ ...form, email: event.target.value })
									}
									placeholder="name@example.com"
								/>
							</label>
						</div>
						<div className="inquiry-pair">
							<label>
								Interested course *
								<select
									required
									value={form.course_interest}
									onChange={(event) =>
										setForm({ ...form, course_interest: event.target.value })
									}
								>
									<option value="">Select course</option>
									{[
										'Diploma Engineering',
										'Degree Engineering',
										'D2D Engineering',
										'Other',
									].map((course) => (
										<option key={course} value={course}>
											{course}
										</option>
									))}
								</select>
							</label>
							<label>
								Preferred branch
								<input
									maxLength={120}
									value={form.branch_interest}
									onChange={(event) =>
										setForm({ ...form, branch_interest: event.target.value })
									}
									placeholder="e.g. Computer Engineering"
								/>
							</label>
						</div>
						<div className="inquiry-pair">
							<label>
								Current qualification
								<select
									value={form.qualification}
									onChange={(event) =>
										setForm({ ...form, qualification: event.target.value })
									}
								>
									<option value="">Select qualification</option>
									{['10th', '12th Science', '12th Commerce', 'Diploma', 'Other'].map(
										(qualification) => (
											<option key={qualification} value={qualification}>
												{qualification}
											</option>
										),
									)}
								</select>
							</label>
							<label>
								City
								<input
									maxLength={120}
									value={form.city}
									onChange={(event) =>
										setForm({ ...form, city: event.target.value })
									}
									placeholder="Your city"
								/>
							</label>
						</div>
						<label>
							How did you hear about us?
							<select
								value={form.source}
								onChange={(event) =>
									setForm({ ...form, source: event.target.value })
								}
							>
								{['website', 'social_media', 'friend', 'school_visit', 'other'].map(
									(source) => (
										<option key={source} value={source}>
											{source.replaceAll('_', ' ')}
										</option>
									),
								)}
							</select>
						</label>
						<label>
							Message / questions
							<textarea
								maxLength={1500}
								rows={3}
								value={form.message}
								onChange={(event) =>
									setForm({ ...form, message: event.target.value })
								}
								placeholder="Tell us what you would like to know..."
							/>
						</label>
						<label className="inquiry-consent">
							<input
								type="checkbox"
								required
								checked={form.consent}
								onChange={(event) =>
									setForm({ ...form, consent: event.target.checked })
								}
							/>
							<span>
								I agree to be contacted by the SVIT admission team regarding my
								inquiry. *
							</span>
						</label>
						<div className="inquiry-hp" aria-hidden="true">
							<label>
								Website
								<input
									tabIndex={-1}
									autoComplete="off"
									value={form.website}
									onChange={(event) =>
										setForm({ ...form, website: event.target.value })
									}
								/>
							</label>
						</div>
						{error && (
							<div className="error" role="alert">
								{error}
							</div>
						)}
						<button className="inquiry-submit" disabled={busy}>
							{busy ? 'Submitting...' : 'Submit inquiry'}
						</button>
						<small className="inquiry-privacy">
							Your information will only be used for admission-related
							follow-up.
						</small>
					</form>
				)}
				<a className="inquiry-back" href="/">
					Return to the portal
				</a>
			</section>
		</div>
	);
}

export function InquiryDashboard({ canManage = true }) {
	const importInput = useRef(null);
	const [rows, setRows] = useState([]);
	const [selected, setSelected] = useState(null);
	const [history, setHistory] = useState([]);
	const [filter, setFilter] = useState('all');
	const [search, setSearch] = useState('');
	const [note, setNote] = useState({
		contact_mode: 'call',
		outcome: '',
		next_follow_up_at: '',
		status: 'follow_up',
	});
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [loading, setLoading] = useState(true);

	async function load() {
		try {
			const { data, error } = await supabase
				.from('inquiries')
				.select('*')
				.order('created_at', { ascending: false })
				.limit(500);
			if (error) {
				setMessage(errorText(error));
				return;
			}
			setRows(data ?? []);
		} catch (error) {
			setMessage(errorText(error));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
	}, []);

	useEffect(() => {
		let cancelled = false;
		async function loadHistory() {
			if (!selected) {
				setHistory([]);
				return;
			}
			const { data, error } = await supabase
				.from('inquiry_followups')
				.select('*')
				.eq('inquiry_id', selected.id)
				.order('created_at', { ascending: false });
			if (cancelled) return;
			if (error) setMessage(errorText(error));
			else setHistory(data ?? []);
		}
		void loadHistory();
		return () => {
			cancelled = true;
		};
	}, [selected]);

	async function saveFollowUp(event) {
		event.preventDefault();
		if (!selected || !canManage || busy) return;
		setBusy(true);
		setMessage('');
		try {
			const { error } = await supabase.rpc('add_inquiry_followup', {
				p_inquiry_id: selected.id,
				p_contact_mode: note.contact_mode,
				p_outcome: note.outcome,
				p_next_follow_up_at: note.next_follow_up_at
					? new Date(note.next_follow_up_at).toISOString()
					: null,
				p_status: note.status,
			});
			if (error) throw error;
			setMessage('Follow-up saved.');
			setNote({
				contact_mode: 'call',
				outcome: '',
				next_follow_up_at: '',
				status: 'follow_up',
			});
			await load();
			const { data, error: historyError } = await supabase
				.from('inquiry_followups')
				.select('*')
				.eq('inquiry_id', selected.id)
				.order('created_at', { ascending: false });
			if (historyError) throw historyError;
			setHistory(data ?? []);
		} catch (error) {
			setMessage(errorText(error));
		} finally {
			setBusy(false);
		}
	}

	const shownRows = useMemo(
		() =>
			rows.filter(
				(row) =>
					(filter === 'all' || row.status === filter) &&
					JSON.stringify([
						row.student_name,
						row.mobile,
						row.inquiry_number,
						row.course_interest,
						row.city,
					])
						.toLowerCase()
						.includes(search.toLowerCase()),
			),
		[rows, filter, search],
	);
	const dueCount = rows.filter(
		(row) =>
			row.next_follow_up_at &&
			new Date(row.next_follow_up_at) <= new Date() &&
			!['closed', 'converted'].includes(row.status),
	).length;

	async function exportInquiries() {
		try {
			await downloadExcel({
				fileName: `svit-inquiries-${filter}`,
				sheetName: 'Inquiries',
				columns: [
					{ key: 'inquiry_number', label: 'Inquiry reference' },
					{ key: 'student_name', label: 'Student name' },
					{ key: 'mobile', label: 'Mobile' },
					{ key: 'email', label: 'Email' },
					{ key: 'course_interest', label: 'Course interest' },
					{ key: 'branch_interest', label: 'Branch interest' },
					{ key: 'qualification', label: 'Qualification' },
					{ key: 'city', label: 'City' },
					{ key: 'source', label: 'Source' },
					{ key: 'status', label: 'Status' },
					{ key: 'next_follow_up_at', label: 'Next follow-up' },
					{ key: 'created_at', label: 'Created at' },
				],
				rows: shownRows,
			});
		} catch (error) {
			setMessage(errorText(error));
		}
	}

	async function downloadInquiryTemplate() {
		try {
			await downloadExcelTemplate({
				fileName: 'svit-inquiry-import-template',
				sheetName: 'Inquiries',
				columns: inquiryExcelColumns,
				instructions: [
					'Import creates new inquiries; existing inquiry records are never overwritten.',
					'Every imported inquiry must have a valid consent value of Yes or TRUE.',
					'Mobile numbers must be 10 digits and begin with 6, 7, 8, or 9.',
				],
			});
		} catch (error) {
			setMessage(errorText(error));
		}
	}

	async function importInquiries(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		setBusy(true);
		setMessage('');
		let imported = 0;
		try {
			const inputRows = await readExcelRows(file, inquiryExcelColumns);
			const records = inputRows.map((row, index) => {
				const consent =
					row.consent === true ||
					['true', 'yes', '1'].includes(
						String(row.consent).trim().toLowerCase(),
					);
				if (!consent) {
					throw new Error(
						`Row ${index + 2}: consent must be Yes/TRUE before importing personal information.`,
					);
				}
				const mobile = String(row.mobile ?? '').trim();
				if (!/^[6-9]\d{9}$/.test(mobile))
					throw new Error(
						`Row ${index + 2}: mobile must be a 10-digit Indian mobile number.`,
					);
				const studentName = String(row.student_name ?? '').trim();
				if (studentName.length < 2 || studentName.length > 120)
					throw new Error(
						`Row ${index + 2}: student name must contain 2 to 120 characters.`,
					);
				return { ...row, mobile, studentName };
			});
			for (let index = 0; index < records.length; index += 1) {
				const row = records[index];
				const { error } = await supabase.rpc('submit_public_inquiry', {
					p_student_name: row.studentName,
					p_mobile: row.mobile,
					p_email: String(row.email ?? '').trim(),
					p_course_interest: String(row.course_interest ?? '').trim(),
					p_branch_interest: String(row.branch_interest ?? '').trim(),
					p_qualification: String(row.qualification ?? '').trim(),
					p_city: String(row.city ?? '').trim(),
					p_source: String(row.source || 'excel_import').trim(),
					p_message: String(row.message ?? '').trim(),
					p_consent: true,
					p_website: '',
				});
				if (error) {
					throw new Error(`Row ${index + 2} failed: ${error.message}`);
				}
				imported += 1;
			}
			setMessage(`Imported ${imported} inquiries from Excel.`);
			await load();
		} catch (error) {
			const detail = errorText(error);
			setMessage(
				imported
					? `${imported} inquiries imported before the import stopped. ${detail}`
					: detail,
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="inquiry-admin">
			<div className="inquiry-kpis">
				{[
					['Total inquiries', rows.length],
					['New', rows.filter((row) => row.status === 'new').length],
					['Follow-ups due', dueCount],
					['Converted', rows.filter((row) => row.status === 'converted').length],
				].map(([label, value]) => (
					<div className="inquiry-kpi" key={label}>
						<small>{label}</small>
						<strong>{value}</strong>
					</div>
				))}
			</div>
			{message && (
				<div className="error" role="status">
					{message}
					<button type="button" onClick={() => setMessage('')}>
						×
					</button>
				</div>
			)}
			<section className="panel">
				<div className="panelhead">
					<div>
						<h2>Inquiry Management</h2>
						<p>View incoming inquiries and manage admission follow-ups.</p>
					</div>
					<div className="actions inquiry-filters">
						<input
							aria-label="Search inquiries"
							placeholder="Search name, mobile, reference..."
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
						<select
							aria-label="Filter inquiries by status"
							value={filter}
							onChange={(event) => setFilter(event.target.value)}
						>
							{inquiryStatuses.map((status) => (
								<option key={status} value={status}>
									{status === 'all' ? 'All statuses' : status.replaceAll('_', ' ')}
								</option>
							))}
						</select>
						<button type="button" onClick={() => void load()}>
							Refresh
						</button>
						<button type="button" onClick={() => void exportInquiries()}>
							Export Excel
						</button>
						{canManage && (
							<>
								<button
									type="button"
									onClick={() => void downloadInquiryTemplate()}
								>
									Download template
								</button>
								<button
									type="button"
									disabled={busy}
									onClick={() => importInput.current?.click()}
								>
									Import Excel
								</button>
								<input
									ref={importInput}
									className="excel-file-input"
									type="file"
									accept=".xlsx"
									aria-label="Import inquiries from Excel"
									onChange={(event) => void importInquiries(event)}
								/>
							</>
						)}
					</div>
				</div>
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								{[
									'Reference',
									'Student',
									'Mobile',
									'Course',
									'Status',
									'Next follow-up',
									'Action',
								].map((label) => (
									<th key={label}>{label}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{shownRows.map((row) => (
								<tr key={row.id}>
									<td>{row.inquiry_number}</td>
									<td>{row.student_name}</td>
									<td>{row.mobile}</td>
									<td>{row.course_interest}</td>
									<td>
										<span className="pill">{row.status.replaceAll('_', ' ')}</span>
									</td>
									<td>
										{row.next_follow_up_at
											? new Date(row.next_follow_up_at).toLocaleString()
											: '—'}
									</td>
									<td>
										<button
											type="button"
											onClick={() => {
												setSelected(row);
												setMessage('');
											}}
										>
											Open
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{loading && <div className="empty">Loading inquiries...</div>}
					{!loading && !shownRows.length && (
						<div className="empty">No matching inquiries.</div>
					)}
				</div>
			</section>
			{selected && (
				<section className="panel">
					<div className="panelhead">
						<h2>
							{selected.student_name} · {selected.inquiry_number}
						</h2>
						<button type="button" onClick={() => setSelected(null)}>
							Close
						</button>
					</div>
					<div className="inquiry-details">
						<p>
							<b>Mobile:</b> {selected.mobile}
						</p>
						<p>
							<b>Email:</b> {selected.email || '—'}
						</p>
						<p>
							<b>Course:</b> {selected.course_interest}
						</p>
						<p>
							<b>Branch:</b> {selected.branch_interest || '—'}
						</p>
						<p>
							<b>Qualification:</b> {selected.qualification || '—'}
						</p>
						<p>
							<b>City:</b> {selected.city || '—'}
						</p>
						<p>
							<b>Source:</b> {selected.source}
						</p>
						<p>
							<b>Message:</b> {selected.message || '—'}
						</p>
					</div>
					{canManage && (
						<form className="editgrid" onSubmit={saveFollowUp}>
							<h3>Add follow-up</h3>
							<label>
								Contact mode
								<select
									value={note.contact_mode}
									onChange={(event) =>
										setNote({ ...note, contact_mode: event.target.value })
									}
								>
									{['call', 'whatsapp', 'email', 'visit', 'other'].map((mode) => (
										<option key={mode} value={mode}>
											{mode}
										</option>
									))}
								</select>
							</label>
							<label>
								Update status
								<select
									value={note.status}
									onChange={(event) =>
										setNote({ ...note, status: event.target.value })
									}
								>
									{inquiryStatuses.slice(1).map((status) => (
										<option key={status} value={status}>
											{status.replaceAll('_', ' ')}
										</option>
									))}
								</select>
							</label>
							<label>
								Next follow-up
								<input
									type="datetime-local"
									value={note.next_follow_up_at}
									onChange={(event) =>
										setNote({ ...note, next_follow_up_at: event.target.value })
									}
								/>
							</label>
							<label>
								Outcome / notes
								<textarea
									required
									minLength={2}
									maxLength={1000}
									value={note.outcome}
									onChange={(event) =>
										setNote({ ...note, outcome: event.target.value })
									}
								/>
							</label>
							<button className="primary" disabled={busy}>
								{busy ? 'Saving...' : 'Save follow-up'}
							</button>
						</form>
					)}
					<h3>Follow-up history</h3>
					{history.length ? (
						history.map((entry) => (
							<div className="inquiry-history" key={entry.id}>
								<b>{entry.contact_mode}</b>
								<span>{entry.outcome}</span>
								<small>{new Date(entry.created_at).toLocaleString()}</small>
							</div>
						))
					) : (
						<p>No follow-ups yet.</p>
					)}
				</section>
			)}
		</div>
	);
}
