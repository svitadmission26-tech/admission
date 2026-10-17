import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel } from '../lib/excel';

const DAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
];

const blankSlot = {
	day: 'Monday',
	period: '1',
	faculty_id: '',
	subject_id: '',
	course: '',
	semester: '1',
	division: '',
	room: '',
};
const blankLeave = {
	faculty_id: '',
	start_date: '',
	end_date: '',
	leave_type: '',
	reason: '',
};
const blankProxy = { slot_id: '', lecture_date: '', proxy_faculty_id: '' };

function messageFor(error) {
	if (
		['PGRST205', '42P01'].includes(error?.code) ||
		error?.message?.includes('timetable_slots') ||
		error?.message?.includes('faculty') ||
		error?.message?.includes('lecture_')
	) {
		return 'Academics tables are missing. Run supabase/migrations/008_academics.sql after migrations 001-007 in the Supabase SQL Editor, then reload.';
	}
	return error?.message || 'An unexpected error occurred.';
}

function nameOf(list, id) {
	const match = list.find((item) => item.id === id);
	return match ? `${match.name}${match.code ? ` (${match.code})` : ''}` : '—';
}

function statusClass(status) {
	return `status-${status}`;
}

async function loadAcademicsLookups() {
	const [facultyResult, subjectsResult] = await Promise.all([
		supabase.from('faculty').select('id,name,code').order('name'),
		supabase
			.from('subjects')
			.select('id,name,code,course,semester')
			.order('name'),
	]);
	const error = facultyResult.error || subjectsResult.error;
	return {
		error,
		faculty: facultyResult.data ?? [],
		subjects: subjectsResult.data ?? [],
	};
}

export function TimetableModule({ canManage, facultyId }) {
	const [slots, setSlots] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [subjects, setSubjects] = useState([]);
	const [form, setForm] = useState(blankSlot);
	const [editingId, setEditingId] = useState(null);
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

	async function load() {
		setLoading(true);
		let slotsQuery = supabase
			.from('timetable_slots')
			.select('*,faculty(name,code),subjects(name,code)')
			.order('day')
			.order('period');
		if (!canManage && facultyId)
			slotsQuery = slotsQuery.eq('faculty_id', facultyId);
		const [slotsResult, lookups] = await Promise.all([
			slotsQuery,
			loadAcademicsLookups(),
		]);
		const error = slotsResult.error || lookups.error;
		if (error) {
			setMessage(messageFor(error));
			setLoading(false);
			return;
		}
		setSlots(slotsResult.data ?? []);
		setFaculty(lookups.faculty);
		setSubjects(lookups.subjects);
		setLoading(false);
	}

	useEffect(() => {
		void load();
	}, [canManage, facultyId]);

	function cancelEdit() {
		setEditingId(null);
		setForm(blankSlot);
		setMessage('');
	}

	function edit(slot) {
		setEditingId(slot.id);
		setForm({
			day: slot.day,
			period: String(slot.period),
			faculty_id: slot.faculty_id,
			subject_id: slot.subject_id,
			course: slot.course,
			semester: String(slot.semester),
			division: slot.division,
			room: slot.room ?? '',
		});
		setMessage('');
	}

	async function submit(event) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setMessage('');
		const { error } = await supabase.rpc('save_timetable_slot', {
			p_id: editingId,
			p_day: form.day,
			p_period: Number(form.period),
			p_faculty_id: form.faculty_id,
			p_subject_id: form.subject_id,
			p_course: form.course,
			p_semester: Number(form.semester),
			p_division: form.division,
			p_room: form.room,
		});
		setBusy(false);
		if (error) {
			setMessage(messageFor(error));
			return;
		}
		setMessage('Slot saved.');
		cancelEdit();
		await load();
	}

	async function remove(slot) {
		if (!confirm('Delete this timetable slot?')) return;
		const { error } = await supabase.rpc('delete_timetable_slot', {
			p_id: slot.id,
		});
		if (error) setMessage(messageFor(error));
		else {
			setMessage('Slot deleted.');
			await load();
		}
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Time Table</h2>
					<p>
						{canManage
							? 'Build the weekly timetable. Days run Monday–Sunday; the period is a whole number. Faculty and class clashes are rejected.'
							: facultyId
								? 'View your weekly timetable.'
								: 'View the weekly timetable.'}
					</p>
				</div>
			</div>
			{canManage && (
				<form className="editgrid" onSubmit={submit}>
					<h3>{editingId ? 'Edit slot' : 'Add slot'}</h3>
					<label>
						Day
						<select
							value={form.day}
							onChange={(event) => setForm({ ...form, day: event.target.value })}
						>
							{DAYS.map((day) => (
								<option key={day}>{day}</option>
							))}
						</select>
					</label>
					<label>
						Period
						<input
							type="number"
							min="1"
							required
							value={form.period}
							onChange={(event) => setForm({ ...form, period: event.target.value })}
						/>
					</label>
					<label>
						Faculty
						<select
							required
							value={form.faculty_id}
							onChange={(event) =>
								setForm({ ...form, faculty_id: event.target.value })
							}
						>
							<option value="">Select faculty</option>
							{faculty.map((member) => (
								<option key={member.id} value={member.id}>
									{member.name} {member.code ? `(${member.code})` : ''}
								</option>
							))}
						</select>
					</label>
					<label>
						Subject
						<select
							required
							value={form.subject_id}
							onChange={(event) => {
								const subject = subjects.find(
									(item) => item.id === event.target.value,
								);
								setForm({
									...form,
									subject_id: event.target.value,
									course: subject?.course ?? form.course,
									semester: subject ? String(subject.semester) : form.semester,
								});
							}}
						>
							<option value="">Select subject</option>
							{subjects.map((subject) => (
								<option key={subject.id} value={subject.id}>
									{subject.name} ({subject.course} · Sem {subject.semester})
								</option>
							))}
						</select>
					</label>
					<label>
						Course
						<input
							required
							value={form.course}
							onChange={(event) => setForm({ ...form, course: event.target.value })}
						/>
					</label>
					<label>
						Semester
						<input
							type="number"
							min="1"
							required
							value={form.semester}
							onChange={(event) =>
								setForm({ ...form, semester: event.target.value })
							}
						/>
					</label>
					<label>
						Division
						<input
							required
							value={form.division}
							onChange={(event) =>
								setForm({ ...form, division: event.target.value })
							}
						/>
					</label>
					<label>
						Room
						<input
							value={form.room}
							onChange={(event) => setForm({ ...form, room: event.target.value })}
						/>
					</label>
					<div className="actions">
						<button className="primary" disabled={busy}>
							{busy ? 'Saving...' : editingId ? 'Update slot' : 'Add slot'}
						</button>
						{editingId && (
							<button type="button" onClick={cancelEdit}>
								Cancel
							</button>
						)}
					</div>
				</form>
			)}
			{message && (
				<p className="dfb-message" role="status">
					{message}
				</p>
			)}
			{loading ? (
				<p>Loading timetable...</p>
			) : (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Day</th>
								<th>Period</th>
								<th>Faculty</th>
								<th>Subject</th>
								<th>Course</th>
								<th>Sem</th>
								<th>Division</th>
								<th>Room</th>
								{canManage && <th>Actions</th>}
							</tr>
						</thead>
						<tbody>
							{slots.map((slot) => (
								<tr key={slot.id}>
									<td>{slot.day}</td>
									<td>{slot.period}</td>
									<td>{slot.faculty?.name ?? nameOf(faculty, slot.faculty_id)}</td>
									<td>
										{slot.subjects?.name ?? nameOf(subjects, slot.subject_id)}
									</td>
									<td>{slot.course}</td>
									<td>{slot.semester}</td>
									<td>{slot.division}</td>
									<td>{slot.room || '—'}</td>
									{canManage && (
										<td>
											<button type="button" onClick={() => edit(slot)}>
												Edit
											</button>{' '}
											<button
												type="button"
												className="danger"
												onClick={() => void remove(slot)}
											>
												Delete
											</button>
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
					{!slots.length && <div className="empty">No timetable slots yet.</div>}
				</div>
			)}
		</section>
	);
}

export function LeaveModule({ canManage, facultyId }) {
	const [leaves, setLeaves] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [form, setForm] = useState({ ...blankLeave, faculty_id: facultyId || '' });
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

	const canApply = canManage || Boolean(facultyId);

	async function load() {
		setLoading(true);
		const [leavesResult, lookups] = await Promise.all([
			supabase
				.from('faculty_leaves')
				.select('*,faculty(name,code)')
				.order('created_at', { ascending: false }),
			loadAcademicsLookups(),
		]);
		const error = leavesResult.error || lookups.error;
		if (error) {
			setMessage(messageFor(error));
			setLoading(false);
			return;
		}
		setLeaves(leavesResult.data ?? []);
		setFaculty(lookups.faculty);
		setLoading(false);
	}

	useEffect(() => {
		void load();
	}, []);

	async function apply(event) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setMessage('');
		const { error } = await supabase.rpc('apply_faculty_leave', {
			p_faculty_id: form.faculty_id,
			p_start_date: form.start_date,
			p_end_date: form.end_date,
			p_leave_type: form.leave_type,
			p_reason: form.reason,
		});
		setBusy(false);
		if (error) {
			setMessage(messageFor(error));
			return;
		}
		setMessage('Leave application submitted.');
		setForm({ ...blankLeave, faculty_id: facultyId || '' });
		await load();
	}

	async function decide(leave, decision) {
		setMessage('');
		const { error } = await supabase.rpc('decide_faculty_leave', {
			p_leave_id: leave.id,
			p_decision: decision,
		});
		if (error) setMessage(messageFor(error));
		else await load();
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Faculty Leave</h2>
					<p>
						Faculty apply for leave; administrators and department heads approve
						or reject. A proxy can only be assigned for approved leave.
					</p>
				</div>
			</div>
			{canApply ? (
				<form className="editgrid" onSubmit={apply}>
					<h3>Apply for leave</h3>
					<label>
						Faculty
						<select
							required
							value={form.faculty_id}
							disabled={!canManage && Boolean(facultyId)}
							onChange={(event) =>
								setForm({ ...form, faculty_id: event.target.value })
							}
						>
							<option value="">Select faculty</option>
							{faculty.map((member) => (
								<option key={member.id} value={member.id}>
									{member.name} {member.code ? `(${member.code})` : ''}
								</option>
							))}
						</select>
					</label>
					<label>
						From
						<input
							type="date"
							required
							value={form.start_date}
							onChange={(event) =>
								setForm({ ...form, start_date: event.target.value })
							}
						/>
					</label>
					<label>
						To
						<input
							type="date"
							required
							value={form.end_date}
							onChange={(event) =>
								setForm({ ...form, end_date: event.target.value })
							}
						/>
					</label>
					<label>
						Leave type
						<input
							required
							value={form.leave_type}
							placeholder="Casual, medical, duty..."
							onChange={(event) =>
								setForm({ ...form, leave_type: event.target.value })
							}
						/>
					</label>
					<label>
						Reason
						<textarea
							rows="2"
							value={form.reason}
							onChange={(event) => setForm({ ...form, reason: event.target.value })}
						/>
					</label>
					<div className="actions">
						<button className="primary" disabled={busy}>
							{busy ? 'Submitting...' : 'Apply for leave'}
						</button>
					</div>
				</form>
			) : null}
			{message && (
				<p className="dfb-message" role="status">
					{message}
				</p>
			)}
			{loading ? (
				<p>Loading leave applications...</p>
			) : (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Faculty</th>
								<th>From</th>
								<th>To</th>
								<th>Type</th>
								<th>Reason</th>
								<th>Status</th>
								{canManage && <th>Actions</th>}
							</tr>
						</thead>
						<tbody>
							{leaves.map((leave) => (
								<tr key={leave.id}>
									<td>
										{leave.faculty?.name ?? nameOf(faculty, leave.faculty_id)}
									</td>
									<td>{leave.start_date}</td>
									<td>{leave.end_date}</td>
									<td>{leave.leave_type}</td>
									<td>{leave.reason || '—'}</td>
									<td>
										<span className={`pill ${statusClass(leave.status)}`}>
											{leave.status}
										</span>
									</td>
									{canManage && (
										<td>
											{leave.status === 'pending' ? (
												<>
													<button
														type="button"
														onClick={() => void decide(leave, 'approve')}
													>
														Approve
													</button>{' '}
													<button
														type="button"
														className="danger"
														onClick={() => void decide(leave, 'reject')}
													>
														Reject
													</button>
												</>
											) : (
												'—'
											)}
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
					{!leaves.length && <div className="empty">No leave applications yet.</div>}
				</div>
			)}
		</section>
	);
}

export function AttendanceModule({ canManage, facultyId }) {
	const [slots, setSlots] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [subjects, setSubjects] = useState([]);
	const [proxies, setProxies] = useState([]);
	const [report, setReport] = useState([]);
	const [proxyForm, setProxyForm] = useState(blankProxy);
	const [roster, setRoster] = useState(null);
	const [entries, setEntries] = useState({});
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

	async function load() {
		setLoading(true);
		const loadSlots = () =>
			supabase
				.from('timetable_slots')
				.select('*,faculty(name,code),subjects(name,code)')
				.order('day')
				.order('period');
		const [managerSlotsResult, proxiesResult, reportResult, lookups] =
			await Promise.all([
			canManage ? loadSlots() : Promise.resolve({ data: [], error: null }),
			supabase
				.from('lecture_proxies')
				.select('*')
				.order('lecture_date', { ascending: false })
				.limit(500),
			canManage
				? supabase
						.from('lecture_attendance_report')
						.select('*')
						.order('lecture_date', { ascending: false })
						.limit(500)
				: Promise.resolve({ data: [], error: null }),
			loadAcademicsLookups(),
		]);
		const error = managerSlotsResult.error ||
			proxiesResult.error ||
			reportResult.error ||
			lookups.error;
		if (error) {
			setMessage(messageFor(error));
			setLoading(false);
			return;
		}
		const loadedProxies = proxiesResult.data ?? [];
		const relevantProxies = canManage
			? loadedProxies
			: facultyId
				? loadedProxies.filter(
						(proxy) =>
							proxy.original_faculty_id === facultyId ||
							proxy.proxy_faculty_id === facultyId,
					)
				: [];
		let relevantSlots = managerSlotsResult.data ?? [];
		if (!canManage && facultyId) {
			const proxySlotIds = [
				...new Set(
					relevantProxies
						.filter((proxy) => proxy.status === 'assigned')
						.map((proxy) => proxy.slot_id),
				),
			];
			const [ownSlotsResult, proxySlotsResult] = await Promise.all([
				loadSlots().eq('faculty_id', facultyId),
				proxySlotIds.length
					? loadSlots().in('id', proxySlotIds)
					: Promise.resolve({ data: [], error: null }),
			]);
			const slotError = ownSlotsResult.error || proxySlotsResult.error;
			if (slotError) {
				setMessage(messageFor(slotError));
				setLoading(false);
				return;
			}
			relevantSlots = [
				...new Map(
					[...(ownSlotsResult.data ?? []), ...(proxySlotsResult.data ?? [])].map(
						(slot) => [slot.id, slot],
					),
				).values(),
			];
		}
		setProxies(relevantProxies);
		setSlots(relevantSlots);
		setReport(reportResult.data ?? []);
		setFaculty(lookups.faculty);
		setSubjects(lookups.subjects);
		setLoading(false);
	}

	useEffect(() => {
		void load();
	}, [canManage, facultyId]);

	function slotLabel(slot) {
		if (!slot) return '—';
		return `${slot.day} P${slot.period} · ${slot.course} Sem ${slot.semester}-${slot.division}`;
	}

	async function assignProxy(event) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setMessage('');
		const { error } = await supabase.rpc('assign_lecture_proxy', {
			p_slot_id: proxyForm.slot_id,
			p_lecture_date: proxyForm.lecture_date,
			p_proxy_faculty_id: proxyForm.proxy_faculty_id,
		});
		setBusy(false);
		if (error) {
			setMessage(messageFor(error));
			return;
		}
		setMessage('Proxy assigned.');
		setProxyForm(blankProxy);
		await load();
	}

	async function cancelProxy(proxy) {
		setMessage('');
		const { error } = await supabase.rpc('cancel_lecture_proxy', {
			p_proxy_id: proxy.id,
		});
		if (error) setMessage(messageFor(error));
		else {
			setMessage('Proxy cancelled.');
			await load();
		}
	}

	async function openRoster(slotId, date) {
		setMessage('');
		setRoster({ slotId, date, data: null });
		const { data, error } = await supabase.rpc('get_attendance_roster', {
			p_slot_id: slotId,
			p_lecture_date: date,
		});
		if (error) {
			setMessage(messageFor(error));
			setRoster(null);
			return;
		}
		setRoster({ slotId, date, data });
		setEntries(
			Object.fromEntries(
				(data?.students ?? []).map((student) => [student.id, student.present ?? true]),
			),
		);
	}

	async function submitRoster() {
		if (!roster) return;
		if (busy) return;
		setBusy(true);
		setMessage('');
		const { error } = await supabase.rpc('submit_lecture_attendance', {
			p_slot_id: roster.slotId,
			p_lecture_date: roster.date,
			p_entries: entries,
		});
		setBusy(false);
		if (error) {
			setMessage(messageFor(error));
			return;
		}
		setMessage('Attendance saved.');
		await openRoster(roster.slotId, roster.date);
		await load();
	}

	async function exportReport() {
		try {
			await downloadExcel({
				fileName: 'svit-attendance-report',
				sheetName: 'Attendance',
				columns: [
					{ key: 'lecture_date', label: 'Date' },
					{ key: 'day', label: 'Day' },
					{ key: 'period', label: 'Period' },
					{ key: 'course', label: 'Course' },
					{ key: 'semester', label: 'Semester' },
					{ key: 'division', label: 'Division' },
					{ key: 'subject_code', label: 'Subject code' },
					{ key: 'subject_name', label: 'Subject' },
					{ key: 'enrollment', label: 'Enrollment' },
					{ key: 'student_name', label: 'Student' },
					{ key: 'attendance_type', label: 'Type' },
					{ key: 'present', label: 'Present' },
					{ key: 'taken_by_name', label: 'Taken by' },
				],
				rows: report,
			});
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Excel export failed.');
		}
	}

	const assignedProxies = proxies.filter((proxy) => proxy.status === 'assigned');
	const rosterSlot = roster ? slots.find((slot) => slot.id === roster.slotId) : null;

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Proxy &amp; Attendance</h2>
					<p>
						Assign a substitute only for approved leave, then record attendance
						against the original slot. Submitted lectures cannot be overwritten.
					</p>
				</div>
				{canManage && (
					<button type="button" onClick={() => void exportReport()}>
						Export report Excel
					</button>
				)}
			</div>
			{canManage && (
				<form className="editgrid" onSubmit={assignProxy}>
					<h3>Assign proxy</h3>
					<label>
						Lecture
						<select
							required
							value={proxyForm.slot_id}
							onChange={(event) =>
								setProxyForm({ ...proxyForm, slot_id: event.target.value })
							}
						>
							<option value="">Select lecture</option>
							{slots.map((slot) => (
								<option key={slot.id} value={slot.id}>
									{slotLabel(slot)}
								</option>
							))}
						</select>
					</label>
					<label>
						Lecture date
						<input
							type="date"
							required
							value={proxyForm.lecture_date}
							onChange={(event) =>
								setProxyForm({ ...proxyForm, lecture_date: event.target.value })
							}
						/>
					</label>
					<label>
						Proxy faculty
						<select
							required
							value={proxyForm.proxy_faculty_id}
							onChange={(event) =>
								setProxyForm({
									...proxyForm,
									proxy_faculty_id: event.target.value,
								})
							}
						>
							<option value="">Select faculty</option>
							{faculty.map((member) => (
								<option key={member.id} value={member.id}>
									{member.name} {member.code ? `(${member.code})` : ''}
								</option>
							))}
						</select>
					</label>
					<div className="actions">
						<button className="primary" disabled={busy}>
							{busy ? 'Assigning...' : 'Assign proxy'}
						</button>
					</div>
				</form>
			)}
			{message && (
				<p className="dfb-message" role="status">
					{message}
				</p>
			)}
			<h3>Assigned proxies</h3>
			{loading ? (
				<p>Loading proxies...</p>
			) : (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Lecture</th>
								<th>Date</th>
								<th>Original faculty</th>
								<th>Proxy faculty</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{proxies.map((proxy) => {
								const slot = slots.find((item) => item.id === proxy.slot_id);
								return (
									<tr key={proxy.id}>
										<td>{slotLabel(slot)}</td>
										<td>{proxy.lecture_date}</td>
										<td>{nameOf(faculty, proxy.original_faculty_id)}</td>
										<td>{nameOf(faculty, proxy.proxy_faculty_id)}</td>
										<td>
											<span className={`pill ${statusClass(proxy.status)}`}>
												{proxy.status}
											</span>
										</td>
										<td>
											<button
												type="button"
												onClick={() =>
													void openRoster(proxy.slot_id, proxy.lecture_date)
												}
											>
												Take attendance
											</button>{' '}
											{canManage && proxy.status === 'assigned' && (
												<button
													type="button"
													className="danger"
													onClick={() => void cancelProxy(proxy)}
												>
													Cancel
												</button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{!proxies.length && <div className="empty">No proxies assigned yet.</div>}
				</div>
			)}
			<h3>Open attendance</h3>
			<p className="hint">
				Select a lecture and its date (the weekday must match the slot day), or use
				the “Take attendance” button on an assigned proxy above.
			</p>
			<div className="editgrid">
				<label>
					Lecture
					<select
						value={roster?.slotId ?? ''}
						onChange={(event) =>
							setRoster(
								event.target.value
									? { slotId: event.target.value, date: roster?.date ?? '', data: null }
									: null,
							)
						}
					>
						<option value="">Select lecture</option>
						{slots.map((slot) => (
							<option key={slot.id} value={slot.id}>
								{slotLabel(slot)}
							</option>
						))}
					</select>
				</label>
				<label>
					Date
					<input
						type="date"
						value={roster?.date ?? ''}
						onChange={(event) =>
							setRoster((current) =>
								current ? { ...current, date: event.target.value } : current,
							)
						}
					/>
				</label>
				<div className="actions">
					<button
						type="button"
						disabled={!roster?.slotId || !roster?.date || busy}
						onClick={() => void openRoster(roster.slotId, roster.date)}
					>
						Open roster
					</button>
				</div>
			</div>
			{roster?.data && (
				<div className="roster">
					<p>
						<b>{roster.data.type} attendance</b> · subject{' '}
						{rosterSlot?.subjects?.name ??
							nameOf(subjects, rosterSlot?.subject_id)}
						· taken by {nameOf(faculty, roster.data.taken_by)}
						{roster.data.submitted ? ' · already submitted' : ''}
					</p>
					{roster.data.students.map((student) => (
						<label key={student.id}>
							{student.enrollment} {student.name}
							<select
								value={String(entries[student.id] ?? true)}
								disabled={roster.data.submitted}
								onChange={(event) =>
									setEntries({
										...entries,
										[student.id]: event.target.value === 'true',
									})
								}
							>
								<option value="true">Present</option>
								<option value="false">Absent</option>
							</select>
						</label>
					))}
					{!roster.data.students.length && (
						<p className="empty">No active students in this class.</p>
					)}
					<div className="actions">
						<button
							type="button"
							className="primary"
							disabled={busy || roster.data.submitted || !roster.data.students.length}
							onClick={() => void submitRoster()}
						>
							{roster.data.submitted ? 'Already submitted' : 'Submit attendance'}
						</button>
					</div>
				</div>
			)}
			{canManage && (
				<>
					<h3>Attendance report</h3>
					{report.length ? (
						<div className="tablewrap">
							<table>
								<thead>
									<tr>
										<th>Date</th>
										<th>Lecture</th>
										<th>Student</th>
										<th>Type</th>
										<th>Present</th>
										<th>Taken by</th>
									</tr>
								</thead>
								<tbody>
									{report.slice(0, 200).map((row) => (
										<tr key={row.id}>
											<td>{row.lecture_date}</td>
											<td>
												{row.day} P{row.period} · {row.course} Sem {row.semester}-
												{row.division}
											</td>
											<td>
												{row.enrollment} {row.student_name}
											</td>
											<td>{row.attendance_type}</td>
											<td>{row.present ? 'Yes' : 'No'}</td>
											<td>{row.taken_by_name || '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<div className="empty">No attendance recorded yet.</div>
					)}
				</>
			)}
			<p className="hint">{assignedProxies.length} active proxy assignment(s).</p>
		</section>
	);
}
