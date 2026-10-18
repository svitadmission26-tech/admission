import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetableDashboard({ onNavigate, canManage }) {
	const [slots, setSlots] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [subjects, setSubjects] = useState([]);
	const [timings, setTimings] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	// Current day as default: 0 is Sun, 1 is Mon...
	const todayIndex = new Date().getDay();
	const defaultDay = todayIndex === 0 ? 'Sunday' : daysOfWeek[todayIndex - 1] || 'Monday';
	const [selectedDay, setSelectedDay] = useState(defaultDay);
	const [selectedDepartment, setSelectedDepartment] = useState('all');

	async function loadDashboard() {
		setLoading(true);
		setError('');
		try {
			const [slotsRes, facRes, subRes, timingRes] = await Promise.all([
				supabase.from('timetable_slots').select('*').order('period'),
				supabase.from('faculty').select('*').order('name'),
				supabase.from('subjects').select('*').order('name'),
				supabase.from('college_timings').select('*').order('day_of_week'),
			]);

			if (slotsRes.error) setError(slotsRes.error.message);
			setSlots(slotsRes.data || []);
			setFaculty(facRes.data || []);
			setSubjects(subRes.data || []);
			setTimings(timingRes.data || []);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void loadDashboard();
	}, []);

	const facultyMap = Object.fromEntries(faculty.map((f) => [f.id, f]));
	const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));

	// Unique departments across faculty & slots
	const departments = Array.from(
		new Set(faculty.map((f) => f.department).filter(Boolean)),
	);

	// Filter slots for selected day and department
	const daySlots = slots.filter((slot) => {
		if (slot.day !== selectedDay) return false;
		if (selectedDepartment !== 'all') {
			const fac = facultyMap[slot.faculty_id];
			if (!fac || fac.department !== selectedDepartment) return false;
		}
		return true;
	});

	// Metrics
	const totalWeeklySlots = slots.length;
	const totalActiveFaculty = new Set(slots.map((s) => s.faculty_id)).size;
	const totalSubjectsScheduled = new Set(slots.map((s) => s.subject_id)).size;
	const totalRooms = new Set(slots.map((s) => s.room).filter(Boolean)).size;

	return (
		<section className="panel timetable-dashboard-panel">
			<div className="panelhead">
				<div>
					<small>ACADEMIC OPERATIONS</small>
					<h2>◫ Time Table Dashboard</h2>
					<p>Overview of weekly lecture schedules, classroom allocation, and faculty timetable</p>
				</div>
				<div className="actions" style={{ display: 'flex', gap: 8 }}>
					{onNavigate && (
						<>
							<button className="primary" type="button" onClick={() => onNavigate('Timetable Management')}>
								📅 Manage Timetable
							</button>
							<button type="button" onClick={() => onNavigate('Subjects')}>
								📘 Subjects
							</button>
							<button type="button" onClick={() => onNavigate('College Timing')}>
								🕒 College Timing
							</button>
						</>
					)}
				</div>
			</div>

			{error && <p className="dfb-message error" role="alert" style={{ color: 'crimson' }}>{error}</p>}

			{/* Stats Overview */}
			<div className="stats" style={{ marginBottom: 24 }}>
				<div className="stat">
					<span>📅</span>
					<strong>{totalWeeklySlots}</strong>
					<small>Total Weekly Lectures</small>
				</div>
				<div className="stat">
					<span>🧑‍🏫</span>
					<strong>{totalActiveFaculty}</strong>
					<small>Faculty Scheduled</small>
				</div>
				<div className="stat">
					<span>📘</span>
					<strong>{totalSubjectsScheduled}</strong>
					<small>Subjects Scheduled</small>
				</div>
				<div className="stat">
					<span>🚪</span>
					<strong>{totalRooms}</strong>
					<small>Active Classrooms</small>
				</div>
			</div>

			{/* Day Selector and Filters */}
			<div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: 8, marginBottom: 20, border: '1px solid #e2e8f0' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
					<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
						{daysOfWeek.map((day) => (
							<button
								key={day}
								type="button"
								className={selectedDay === day ? 'primary' : ''}
								style={{ padding: '6px 14px', fontSize: '0.9rem', fontWeight: selectedDay === day ? 600 : 400 }}
								onClick={() => setSelectedDay(day)}
							>
								{day}
							</button>
						))}
					</div>
					{departments.length > 0 && (
						<label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
							<span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Department:</span>
							<select
								value={selectedDepartment}
								onChange={(e) => setSelectedDepartment(e.target.value)}
								style={{ padding: '6px 10px', fontSize: '0.85rem' }}
							>
								<option value="all">All Departments</option>
								{departments.map((d) => (
									<option key={d} value={d}>{d}</option>
								))}
							</select>
						</label>
					)}
				</div>
			</div>

			{/* Day Schedule Table */}
			<h3>{selectedDay} Lecture Schedule ({daySlots.length} Lectures)</h3>
			{loading ? (
				<p>Loading timetable data...</p>
			) : !daySlots.length ? (
				<div style={{ padding: '24px 16px', textAlign: 'center', background: '#fafafa', borderRadius: 8 }}>
					<p>No timetable slots scheduled for {selectedDay}{selectedDepartment !== 'all' ? ` in ${selectedDepartment}` : ''}.</p>
					{onNavigate && (
						<button type="button" onClick={() => onNavigate('Timetable Management')}>
							+ Add Slots in Timetable Management
						</button>
					)}
				</div>
			) : (
				<div className="tablewrap" style={{ marginBottom: 28 }}>
					<table>
						<thead>
							<tr>
								<th>Period</th>
								<th>Course</th>
								<th>Sem &amp; Div</th>
								<th>Subject</th>
								<th>Faculty</th>
								<th>Room</th>
							</tr>
						</thead>
						<tbody>
							{daySlots.map((slot) => {
								const sub = subjectMap[slot.subject_id];
								const fac = facultyMap[slot.faculty_id];
								return (
									<tr key={slot.id}>
										<td><strong>Period {slot.period}</strong></td>
										<td>{slot.course}</td>
										<td>Sem {slot.semester} {slot.division ? `(${slot.division})` : ''}</td>
										<td>
											<b>{sub?.name || slot.subject_id}</b>
											{sub?.code && <small style={{ display: 'block', color: '#64748b' }}>Code: {sub.code}</small>}
										</td>
										<td>
											<span>{fac?.name || 'Assigned Faculty'}</span>
											{fac?.department && <small style={{ display: 'block', color: '#64748b' }}>{fac.department}</small>}
										</td>
										<td><span className="pill">{slot.room || 'TBD'}</span></td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* College Timings Summary */}
			{timings.length > 0 && (
				<div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
					<h3>College Shifts &amp; Bell Timings</h3>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
						{timings.map((t) => (
							<div key={t.id} style={{ padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
								<div style={{ fontWeight: 600, color: '#1e293b' }}>
									{t.shift_name} {t.department ? `(${t.department})` : ''}
								</div>
								<div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 4 }}>
									🕒 Hours: {t.opens_at} – {t.closes_at}
								</div>
								<div style={{ fontSize: '0.85rem', color: '#475569' }}>
									⏱️ Period: {t.period_minutes} minutes
								</div>
								{t.break_start && (
									<div style={{ fontSize: '0.85rem', color: '#0284c7' }}>
										☕ Break: {t.break_start} – {t.break_end}
									</div>
								)}
								<div style={{ fontSize: '0.8rem', color: t.active ? '#16a34a' : '#dc2626', marginTop: 4 }}>
									{t.active ? '● Working' : '○ Holiday/Off'}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
