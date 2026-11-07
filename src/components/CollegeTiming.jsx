import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const emptyBreak = { start: '', end: '' };
const localDate = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const emptyInquirySlot = {
	college_id: '',
	slot_date: localDate(),
	starts_at: '09:00',
	ends_at: '10:00',
	active: true,
};
const emptyBulkInquirySlots = {
	college_id: '',
	date_from: localDate(),
	date_to: localDate(),
	starts_at: '09:00',
	ends_at: '17:00',
};
const initial = {
	college_id: '',
	department: '',
	shift_name: 'General',
	days: [1],
	opens_at: '09:00',
	closes_at: '17:00',
	period_minutes: 60,
	breaks: [emptyBreak],
	active: true,
};
export default function CollegeTiming({ canManage }) {
	const [colleges, setColleges] = useState([]);
	const [rows, setRows] = useState([]);
	const [inquirySlots, setInquirySlots] = useState([]);
	const [form, setForm] = useState(initial);
	const [inquirySlotForm, setInquirySlotForm] = useState(emptyInquirySlot);
	const [bulkSlotsForm, setBulkSlotsForm] = useState(emptyBulkInquirySlots);
	const [holidayDate, setHolidayDate] = useState('');
	const [holidayDates, setHolidayDates] = useState([]);
	const [editing, setEditing] = useState(null);
	const [editingSlot, setEditingSlot] = useState(null);
	const [error, setError] = useState('');
	const [slotMessage, setSlotMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [slotBusy, setSlotBusy] = useState(false);

	async function load() {
		const [c, r, slots] = await Promise.all([
			supabase.from('colleges').select('id,name').order('name'),
			supabase.from('college_timings').select('*').order('college_id').order('day_of_week'),
			supabase
				.from('inquiry_appointment_slots')
				.select('*')
				.order('slot_date')
				.order('starts_at'),
		]);
		setColleges(c.data || []);
		setRows(r.data || []);
		setInquirySlots(slots.data || []);
		setError(c.error?.message || r.error?.message || slots.error?.message || '');
	}

	useEffect(() => {
		load();
	}, []);

	function update(e) {
		const { name, value, type, checked } = e.target;
		setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
	}

	function toggleDay(day) {
		setForm((f) => {
			const set = new Set(f.days ?? []);
			if (set.has(day)) set.delete(day);
			else set.add(day);
			const next = [...set].sort((a, b) => a - b);
			return { ...f, days: next.length ? next : f.days };
		});
	}

	function updateBreak(index, field, value) {
		setForm((f) => {
			const breaks = [...(f.breaks ?? [])];
			breaks[index] = { ...breaks[index], [field]: value };
			return { ...f, breaks };
		});
	}

	function addBreak() {
		setForm((f) => ({ ...f, breaks: [...(f.breaks ?? []), { start: '', end: '' }] }));
	}

	function removeBreak(index) {
		setForm((f) => {
			const breaks = (f.breaks ?? []).filter((_, i) => i !== index);
			return { ...f, breaks: breaks.length ? breaks : [{ start: '', end: '' }] };
		});
	}

	function normaliseBreaks(breaks) {
		return (breaks ?? [])
			.map((b) => ({ start: b?.start || '', end: b?.end || '' }))
			.filter((b) => b.start && b.end);
	}

	async function save(e) {
		e.preventDefault();
		setError('');
		const breaks = normaliseBreaks(form.breaks);
		for (const b of breaks) {
			if (b.start >= b.end) {
				setError('Each break must end after it starts.');
				return;
			}
		}
		const daysToSave = editing
			? [Number(form.day_of_week)]
			: (form.days ?? []).map(Number);
		if (!daysToSave.length) {
			setError('Select at least one day.');
			return;
		}
		setBusy(true);
		const base = {
			college_id: form.college_id,
			department: form.department,
			shift_name: form.shift_name,
			opens_at: form.opens_at,
			closes_at: form.closes_at,
			period_minutes: Number(form.period_minutes),
			breaks,
			break_start: breaks[0]?.start || null,
			break_end: breaks[0]?.end || null,
			active: form.active,
		};
		let resultError = null;
		for (const day of daysToSave) {
			const payload = { ...base, day_of_week: day };
			const result = editing
				? await supabase.from('college_timings').update(payload).eq('id', editing)
				: await supabase.from('college_timings').insert(payload);
			if (result.error) {
				resultError = result.error.message;
				break;
			}
		}
		setBusy(false);
		if (resultError) {
			setError(resultError);
			return;
		}
		setEditing(null);
		setForm(initial);
		await load();
	}

	async function remove(id) {
		if (!window.confirm('Delete this timing?')) return;
		const r = await supabase.from('college_timings').delete().eq('id', id);
		if (r.error) setError(r.error.message);
		else await load();
	}

	async function saveInquirySlot(event) {
		event.preventDefault();
		setError('');
		if (inquirySlotForm.starts_at >= inquirySlotForm.ends_at) {
			setError('Inquiry slot end time must be after its start time.');
			return;
		}
		setSlotBusy(true);
		const result = editingSlot
			? await supabase
					.from('inquiry_appointment_slots')
					.update(inquirySlotForm)
					.eq('id', editingSlot)
			: await supabase.from('inquiry_appointment_slots').insert(inquirySlotForm);
		setSlotBusy(false);
		if (result.error) {
			setError(result.error.message);
			return;
		}
		setEditingSlot(null);
		setInquirySlotForm({ ...emptyInquirySlot, slot_date: localDate() });
		await load();
	}

	function addHolidayDate() {
		if (!holidayDate) return;
		setHolidayDates((current) =>
			[...new Set([...current, holidayDate])].sort(),
		);
		setHolidayDate('');
	}

	async function createBulkInquirySlots(event) {
		event.preventDefault();
		setError('');
		setSlotMessage('');
		if (bulkSlotsForm.date_to < bulkSlotsForm.date_from) {
			setError('The end date must be on or after the start date.');
			return;
		}
		const startMinutes =
			Number(bulkSlotsForm.starts_at.slice(0, 2)) * 60 +
			Number(bulkSlotsForm.starts_at.slice(3, 5));
		const endMinutes =
			Number(bulkSlotsForm.ends_at.slice(0, 2)) * 60 +
			Number(bulkSlotsForm.ends_at.slice(3, 5));
		if (startMinutes >= endMinutes) {
			setError('The closing time must be after the opening time.');
			return;
		}
		const firstDate = new Date(`${bulkSlotsForm.date_from}T00:00:00Z`);
		const lastDate = new Date(`${bulkSlotsForm.date_to}T00:00:00Z`);
		const daysCount = Math.round((lastDate - firstDate) / 86400000) + 1;
		if (!Number.isFinite(daysCount) || daysCount < 1 || daysCount > 366) {
			setError('Select a date range of 1 to 366 days.');
			return;
		}

		const slots = [];
		const holidays = new Set(holidayDates);
		for (let dayOffset = 0; dayOffset < daysCount; dayOffset += 1) {
			const date = new Date(firstDate);
			date.setUTCDate(date.getUTCDate() + dayOffset);
			const slotDate = date.toISOString().slice(0, 10);
			if (holidays.has(slotDate)) continue;
			for (
				let slotStart = startMinutes;
				slotStart + 60 <= endMinutes;
				slotStart += 60
			) {
				const formatTime = (minutes) =>
					`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
				slots.push({
					college_id: bulkSlotsForm.college_id,
					slot_date: slotDate,
					starts_at: formatTime(slotStart),
					ends_at: formatTime(slotStart + 60),
					active: true,
				});
			}
		}
		if (!slots.length) {
			setError('No one-hour slots can be created for the selected dates and hours.');
			return;
		}

		setSlotBusy(true);
		try {
			for (let offset = 0; offset < slots.length; offset += 500) {
				const { error: saveError } = await supabase
					.from('inquiry_appointment_slots')
					.upsert(slots.slice(offset, offset + 500), {
						onConflict: 'college_id,slot_date,starts_at,ends_at',
						ignoreDuplicates: true,
					});
				if (saveError) throw saveError;
			}
			const selectedHolidays = holidayDates.filter(
				(date) =>
					date >= bulkSlotsForm.date_from && date <= bulkSlotsForm.date_to,
			).length;
			setSlotMessage(
				`${slots.length} one-hour slots processed. Existing slots were left unchanged.${selectedHolidays ? ` ${selectedHolidays} holiday date(s) skipped.` : ''}`,
			);
			await load();
		} catch (saveError) {
			setError(saveError.message || 'Could not save inquiry slots.');
		} finally {
			setSlotBusy(false);
		}
	}

	async function removeInquirySlot(id) {
		if (!window.confirm('Delete this inquiry appointment slot?')) return;
		const result = await supabase
			.from('inquiry_appointment_slots')
			.delete()
			.eq('id', id);
		if (result.error) setError(result.error.message);
		else await load();
	}

	function breaksLabel(row) {
		const list = Array.isArray(row.breaks) && row.breaks.length
			? row.breaks
			: row.break_start
				? [{ start: row.break_start, end: row.break_end }]
				: [];
		return list.length ? list.map((b) => `${b.start} – ${b.end}`).join(', ') : '—';
	}

	return (
		<section className="panel">
			<h2>College Timing Management</h2>
			<p>Set working days, shifts, department hours, lecture duration and multiple recess timings for each college.</p>
			{error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
			{canManage && (
				<form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 24 }}>
					<label>College
						<select required name="college_id" value={form.college_id} onChange={update}>
							<option value="">Select college</option>
							{colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
						</select>
					</label>
					<label>Department
						<input name="department" value={form.department} onChange={update} placeholder="Blank = all" />
					</label>
					<label>Shift
						<input required name="shift_name" value={form.shift_name} onChange={update} />
					</label>
					{editing ? (
						<label>Day
							<select name="day_of_week" value={form.day_of_week} onChange={update}>
								{days.map((d, i) => <option key={d} value={i}>{d}</option>)}
							</select>
						</label>
					) : (
						<fieldset style={{ gridColumn: '1 / -1' }}>
							<legend>Days</legend>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
								{days.map((d, i) => (
									<label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
										<input
											type="checkbox"
											checked={(form.days ?? []).includes(i)}
											onChange={() => toggleDay(i)}
										/>
										{d}
									</label>
								))}
							</div>
						</fieldset>
					)}
					{[['opens_at', 'Opens'], ['closes_at', 'Closes']].map(([name, label]) => (
						<label key={name}>{label}
							<input type="time" required name={name} value={form[name]} onChange={update} />
						</label>
					))}
					<label>Period (minutes)
						<input type="number" min="15" max="240" required name="period_minutes" value={form.period_minutes} onChange={update} />
					</label>
					<label><input type="checkbox" name="active" checked={form.active} onChange={update} /> Working day</label>
					<fieldset style={{ gridColumn: '1 / -1' }}>
						<legend>Recess timings</legend>
						{(form.breaks ?? []).map((b, index) => (
							<div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
								<input type="time" value={b.start} onChange={(e) => updateBreak(index, 'start', e.target.value)} />
								<span>to</span>
								<input type="time" value={b.end} onChange={(e) => updateBreak(index, 'end', e.target.value)} />
								<button type="button" onClick={() => removeBreak(index)}>Remove</button>
							</div>
						))}
						<button type="button" onClick={addBreak}>Add recess</button>
					</fieldset>
					<button disabled={busy} type="submit">{busy ? 'Saving…' : editing ? 'Update timing' : 'Add timing'}</button>
					{editing && <button type="button" onClick={() => { setEditing(null); setForm(initial); }}>Cancel</button>}
				</form>
			)}
			<hr />
			<h3>Inquiry appointment slots</h3>
			<p>Choose the available dates and times that applicants can select on the public inquiry form.</p>
			{canManage && (
				<form onSubmit={createBulkInquirySlots} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 24 }}>
					<h4 style={{ gridColumn: '1 / -1', marginBottom: 0 }}>Bulk create 1-hour slots</h4>
					<label>College
						<select
							required
							value={bulkSlotsForm.college_id}
							onChange={(event) =>
								setBulkSlotsForm({ ...bulkSlotsForm, college_id: event.target.value })
							}
						>
							<option value="">Select college</option>
							{colleges.map((college) => (
								<option key={college.id} value={college.id}>{college.name}</option>
							))}
						</select>
					</label>
					<label>From date
						<input
							type="date"
							required
							min={localDate()}
							value={bulkSlotsForm.date_from}
							onChange={(event) =>
								setBulkSlotsForm({ ...bulkSlotsForm, date_from: event.target.value })
							}
						/>
					</label>
					<label>To date
						<input
							type="date"
							required
							min={bulkSlotsForm.date_from || localDate()}
							value={bulkSlotsForm.date_to}
							onChange={(event) =>
								setBulkSlotsForm({ ...bulkSlotsForm, date_to: event.target.value })
							}
						/>
					</label>
					<label>Opening time
						<input
							type="time"
							required
							value={bulkSlotsForm.starts_at}
							onChange={(event) =>
								setBulkSlotsForm({ ...bulkSlotsForm, starts_at: event.target.value })
							}
						/>
					</label>
					<label>Closing time
						<input
							type="time"
							required
							value={bulkSlotsForm.ends_at}
							onChange={(event) =>
								setBulkSlotsForm({ ...bulkSlotsForm, ends_at: event.target.value })
							}
						/>
					</label>
					<div style={{ gridColumn: '1 / -1' }}>
						<label>Holiday date
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
								<input
									type="date"
									min={bulkSlotsForm.date_from || localDate()}
									max={bulkSlotsForm.date_to}
									value={holidayDate}
									onChange={(event) => setHolidayDate(event.target.value)}
								/>
								<button type="button" onClick={addHolidayDate} disabled={!holidayDate}>
									Add holiday
								</button>
							</div>
						</label>
						{holidayDates.length > 0 && (
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
								{holidayDates.map((date) => (
									<span key={date}>
										{new Date(`${date}T00:00:00`).toLocaleDateString()}{' '}
										<button
											type="button"
											aria-label={`Remove holiday ${date}`}
											onClick={() =>
												setHolidayDates((current) =>
													current.filter((holiday) => holiday !== date),
												)
											}
										>
											×
										</button>
									</span>
								))}
							</div>
						)}
					</div>
					<p style={{ gridColumn: '1 / -1', margin: 0 }}>
						One-hour slots are generated each day, up to the closing time. Listed holidays are skipped.
					</p>
					<button disabled={slotBusy} type="submit">
						{slotBusy ? 'Creating slots…' : 'Create slots in bulk'}
					</button>
				</form>
			)}
			{slotMessage && <p role="status">{slotMessage}</p>}
			{canManage && (
				<form onSubmit={saveInquirySlot} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 24 }}>
					<label>College
						<select
							required
							value={inquirySlotForm.college_id}
							onChange={(event) =>
								setInquirySlotForm({ ...inquirySlotForm, college_id: event.target.value })
							}
						>
							<option value="">Select college</option>
							{colleges.map((college) => (
								<option key={college.id} value={college.id}>{college.name}</option>
							))}
						</select>
					</label>
					<label>Inquiry date
						<input
							type="date"
							required
							min={localDate()}
							value={inquirySlotForm.slot_date}
							onChange={(event) =>
								setInquirySlotForm({ ...inquirySlotForm, slot_date: event.target.value })
							}
						/>
					</label>
					<label>From
						<input
							type="time"
							required
							value={inquirySlotForm.starts_at}
							onChange={(event) =>
								setInquirySlotForm({ ...inquirySlotForm, starts_at: event.target.value })
							}
						/>
					</label>
					<label>To
						<input
							type="time"
							required
							value={inquirySlotForm.ends_at}
							onChange={(event) =>
								setInquirySlotForm({ ...inquirySlotForm, ends_at: event.target.value })
							}
						/>
					</label>
					<label>
						<input
							type="checkbox"
							checked={inquirySlotForm.active}
							onChange={(event) =>
								setInquirySlotForm({ ...inquirySlotForm, active: event.target.checked })
							}
						/> Available on inquiry form
					</label>
					<button disabled={slotBusy} type="submit">
						{slotBusy ? 'Saving…' : editingSlot ? 'Update inquiry slot' : 'Add inquiry slot'}
					</button>
					{editingSlot && (
						<button
							type="button"
							onClick={() => {
								setEditingSlot(null);
								setInquirySlotForm({ ...emptyInquirySlot, slot_date: localDate() });
							}}
						>
							Cancel
						</button>
					)}
				</form>
			)}
			<div style={{ overflowX: 'auto', marginBottom: 24 }}>
				<table>
					<thead>
						<tr>
							<th>College</th>
							<th>Date</th>
							<th>Time</th>
							<th>Status</th>
							{canManage && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{inquirySlots.map((slot) => (
							<tr key={slot.id}>
								<td>{colleges.find((college) => college.id === slot.college_id)?.name || slot.college_id}</td>
								<td>{new Date(`${slot.slot_date}T00:00:00`).toLocaleDateString()}</td>
								<td>{String(slot.starts_at).slice(0, 5)} – {String(slot.ends_at).slice(0, 5)}</td>
								<td>{slot.active ? 'Available' : 'Hidden'}</td>
								{canManage && (
									<td>
										<button
											type="button"
											onClick={() => {
												setEditingSlot(slot.id);
												setInquirySlotForm({
													college_id: slot.college_id,
													slot_date: slot.slot_date,
													starts_at: String(slot.starts_at).slice(0, 5),
													ends_at: String(slot.ends_at).slice(0, 5),
													active: slot.active,
												});
											}}
										>
											Edit
										</button>{' '}
										<button type="button" onClick={() => void removeInquirySlot(slot.id)}>Delete</button>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
				{!inquirySlots.length && <p>No inquiry appointment slots configured.</p>}
			</div>
			<div style={{ overflowX: 'auto' }}>
				<table>
					<thead>
						<tr>
							<th>College</th>
							<th>Department</th>
							<th>Shift</th>
							<th>Day</th>
							<th>Hours</th>
							<th>Period</th>
							<th>Recess</th>
							<th>Status</th>
							{canManage && <th>Actions</th>}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td>{colleges.find((c) => c.id === r.college_id)?.name || r.college_id}</td>
								<td>{r.department || 'All'}</td>
								<td>{r.shift_name}</td>
								<td>{days[r.day_of_week]}</td>
								<td>{r.opens_at} – {r.closes_at}</td>
								<td>{r.period_minutes} min</td>
								<td>{breaksLabel(r)}</td>
								<td>{r.active ? 'Working' : 'Off'}</td>
								{canManage && (
									<td>
										<button type="button" onClick={() => {
											setEditing(r.id);
											const breaks = Array.isArray(r.breaks) && r.breaks.length
												? r.breaks
												: r.break_start
													? [{ start: r.break_start, end: r.break_end }]
													: [{ start: '', end: '' }];
											setForm({
												college_id: r.college_id,
												department: r.department || '',
												shift_name: r.shift_name,
												day_of_week: r.day_of_week,
												days: [r.day_of_week],
												opens_at: r.opens_at,
												closes_at: r.closes_at,
												period_minutes: r.period_minutes,
												breaks,
												active: r.active,
											});
										}}>Edit</button>{' '}
										<button type="button" onClick={() => remove(r.id)}>Delete</button>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
				{!rows.length && <p>No timing records yet. Apply migration 023 and add your first college timing.</p>}
			</div>
		</section>
	);
}