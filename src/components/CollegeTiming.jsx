import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const emptyBreak = { start: '', end: '' };
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
	const [form, setForm] = useState(initial);
	const [editing, setEditing] = useState(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function load() {
		const [c, r] = await Promise.all([
			supabase.from('colleges').select('id,name').order('name'),
			supabase.from('college_timings').select('*').order('college_id').order('day_of_week'),
		]);
		setColleges(c.data || []);
		setRows(r.data || []);
		setError(c.error?.message || r.error?.message || '');
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