import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel } from '../lib/excel';

export default function StudentManagement({ canManage, onNavigate }) {
	const [students, setStudents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [busy, setBusy] = useState(false);

	// Filters
	const [selectedYear, setSelectedYear] = useState('all');
	const [searchEnrollment, setSearchEnrollment] = useState('');
	const [searchId, setSearchId] = useState('');
	const [searchName, setSearchName] = useState('');
	const [selectedCourse, setSelectedCourse] = useState('all');
	const [selectedSemester, setSelectedSemester] = useState('all');

	// Form Modal / Edit
	const [editingId, setEditingId] = useState(null);
	const [showForm, setShowForm] = useState(false);
	const initialForm = {
		enrollment: '',
		student_id_code: '',
		name: '',
		course: '',
		semester: 1,
		division: 'A',
		admission_year: '2025-2026',
		active: true,
	};
	const [form, setForm] = useState(initialForm);

	async function loadStudents() {
		setLoading(true);
		setError('');
		try {
			const { data, error: err } = await supabase
				.from('students')
				.select('*')
				.order('created_at', { ascending: false });

			if (err) setError(err.message);
			else setStudents(data || []);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void loadStudents();
	}, []);

	// Unique filter options
	const admissionYears = Array.from(
		new Set(students.map((s) => s.admission_year).filter(Boolean)),
	).sort().reverse();
	if (!admissionYears.includes('2026-2027')) admissionYears.unshift('2026-2027');
	if (!admissionYears.includes('2025-2026')) admissionYears.push('2025-2026');

	const courses = Array.from(new Set(students.map((s) => s.course).filter(Boolean))).sort();

	// Filtering logic
	const filteredStudents = students.filter((s) => {
		if (selectedYear !== 'all' && (s.admission_year || '2025-2026') !== selectedYear) {
			return false;
		}
		if (searchEnrollment.trim() && !String(s.enrollment || '').toLowerCase().includes(searchEnrollment.toLowerCase().trim())) {
			return false;
		}
		if (searchId.trim()) {
			const studentId = String(s.student_id_code || s.id || '').toLowerCase();
			if (!studentId.includes(searchId.toLowerCase().trim())) return false;
		}
		if (searchName.trim() && !String(s.name || '').toLowerCase().includes(searchName.toLowerCase().trim())) {
			return false;
		}
		if (selectedCourse !== 'all' && s.course !== selectedCourse) {
			return false;
		}
		if (selectedSemester !== 'all' && String(s.semester) !== selectedSemester) {
			return false;
		}
		return true;
	});

	async function handleSave(e) {
		e.preventDefault();
		if (!form.enrollment.trim() || !form.name.trim() || !form.course.trim()) {
			setError('Enrollment, Student Name, and Course are required.');
			return;
		}
		setBusy(true);
		setError('');
		setSuccess('');

		try {
			const payload = {
				enrollment: form.enrollment.trim(),
				student_id_code: form.student_id_code.trim(),
				name: form.name.trim(),
				course: form.course.trim(),
				semester: Number(form.semester) || 1,
				division: form.division.trim() || 'A',
				admission_year: form.admission_year.trim() || '2025-2026',
				active: Boolean(form.active),
			};

			let result;
			if (editingId) {
				result = await supabase.from('students').update(payload).eq('id', editingId);
			} else {
				result = await supabase.from('students').insert(payload);
			}

			if (result.error) {
				setError(result.error.message);
			} else {
				setSuccess(editingId ? 'Student record updated.' : 'Student record created.');
				setShowForm(false);
				setEditingId(null);
				setForm(initialForm);
				await loadStudents();
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	function handleEdit(s) {
		setForm({
			enrollment: s.enrollment || '',
			student_id_code: s.student_id_code || '',
			name: s.name || '',
			course: s.course || '',
			semester: s.semester || 1,
			division: s.division || 'A',
			admission_year: s.admission_year || '2025-2026',
			active: Boolean(s.active),
		});
		setEditingId(s.id);
		setShowForm(true);
	}

	async function handleDelete(id) {
		if (!window.confirm('Delete this student record?')) return;
		setBusy(true);
		try {
			const { error: err } = await supabase.from('students').delete().eq('id', id);
			if (err) setError(err.message);
			else {
				setSuccess('Student record deleted.');
				await loadStudents();
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	async function exportExcel() {
		try {
			await downloadExcel({
				fileName: `students-${selectedYear}`,
				sheetName: 'Students',
				columns: [
					{ key: 'admission_year', label: 'Admission Year' },
					{ key: 'student_id_code', label: 'Student ID' },
					{ key: 'enrollment', label: 'Enrollment No' },
					{ key: 'name', label: 'Student Name' },
					{ key: 'course', label: 'Course' },
					{ key: 'semester', label: 'Semester' },
					{ key: 'division', label: 'Division' },
					{ key: 'active', label: 'Status' },
				],
				rows: filteredStudents.map((s) => ({
					...s,
					active: s.active ? 'Active' : 'Inactive',
				})),
			});
		} catch (err) {
			setError(err.message);
		}
	}

	return (
		<section className="panel student-management-panel">
			<div className="panelhead">
				<div>
					<small>ACADEMIC REGISTRY</small>
					<h2>🧑‍🎓 Student Management</h2>
					<p>Admission Year Student Data (ID Wise &amp; Enrollment Wise Registry)</p>
				</div>
				<div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{onNavigate && (
						<>
							<button type="button" onClick={() => onNavigate('Attendance')}>
								✅ Attendance
							</button>
							<button type="button" onClick={() => onNavigate('ID Cards')}>
								🎟️ ID Cards
							</button>
						</>
					)}
					<button type="button" onClick={exportExcel}>
						📥 Export Excel
					</button>
					{canManage && (
						<button
							className="primary"
							type="button"
							onClick={() => {
								if (showForm) {
									setShowForm(false);
									setEditingId(null);
								} else {
									setForm(initialForm);
									setEditingId(null);
									setShowForm(true);
								}
							}}
						>
							{showForm ? 'Close Form' : '+ Add Student'}
						</button>
					)}
				</div>
			</div>

			{error && <p className="dfb-message error" role="alert" style={{ color: 'crimson' }}>{error}</p>}
			{success && <p className="hint" role="status" style={{ color: 'green' }}>{success}</p>}

			{/* Add/Edit Form */}
			{showForm && canManage && (
				<form onSubmit={handleSave} className="editgrid" style={{ marginBottom: 24, padding: 16, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
					<h3>{editingId ? 'Edit Student Record' : 'Register New Student'}</h3>
					<label>
						Admission Year *
						<input
							type="text"
							required
							placeholder="e.g. 2026-2027"
							value={form.admission_year}
							onChange={(e) => setForm({ ...form, admission_year: e.target.value })}
						/>
					</label>
					<label>
						Student ID / App ID
						<input
							type="text"
							placeholder="e.g. STU-2026-001"
							value={form.student_id_code}
							onChange={(e) => setForm({ ...form, student_id_code: e.target.value })}
						/>
					</label>
					<label>
						Enrollment Number *
						<input
							type="text"
							required
							placeholder="e.g. 230410107001"
							value={form.enrollment}
							onChange={(e) => setForm({ ...form, enrollment: e.target.value })}
						/>
					</label>
					<label>
						Full Name *
						<input
							type="text"
							required
							placeholder="Student full name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</label>
					<label>
						Course *
						<input
							type="text"
							required
							placeholder="e.g. B.Tech Computer Engineering"
							value={form.course}
							onChange={(e) => setForm({ ...form, course: e.target.value })}
						/>
					</label>
					<label>
						Semester *
						<input
							type="number"
							min="1"
							max="12"
							required
							value={form.semester}
							onChange={(e) => setForm({ ...form, semester: e.target.value })}
						/>
					</label>
					<label>
						Division
						<input
							type="text"
							placeholder="e.g. A"
							value={form.division}
							onChange={(e) => setForm({ ...form, division: e.target.value })}
						/>
					</label>
					<label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
						<input
							type="checkbox"
							checked={form.active}
							onChange={(e) => setForm({ ...form, active: e.target.checked })}
						/>
						Active Student Status
					</label>
					<div className="actions" style={{ gridColumn: '1 / -1' }}>
						<button className="primary" type="submit" disabled={busy}>
							{busy ? 'Saving...' : editingId ? 'Update Student' : 'Save Student'}
						</button>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{/* Filters Box */}
			<div style={{ background: '#f1f5f9', padding: '16px 20px', borderRadius: 8, marginBottom: 20 }}>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
					<label style={{ margin: 0 }}>
						<span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
							📅 Admission Year:
						</span>
						<select
							value={selectedYear}
							onChange={(e) => setSelectedYear(e.target.value)}
							style={{ width: '100%' }}
						>
							<option value="all">All Admission Years</option>
							{admissionYears.map((yr) => (
								<option key={yr} value={yr}>{yr}</option>
							))}
						</select>
					</label>

					<label style={{ margin: 0 }}>
						<span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
							🔢 Enrollment Wise Search:
						</span>
						<input
							type="search"
							placeholder="Search Enrollment..."
							value={searchEnrollment}
							onChange={(e) => setSearchEnrollment(e.target.value)}
							style={{ width: '100%' }}
						/>
					</label>

					<label style={{ margin: 0 }}>
						<span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
							🆔 Student ID Wise Search:
						</span>
						<input
							type="search"
							placeholder="Search Student ID..."
							value={searchId}
							onChange={(e) => setSearchId(e.target.value)}
							style={{ width: '100%' }}
						/>
					</label>

					<label style={{ margin: 0 }}>
						<span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
							👤 Name Search:
						</span>
						<input
							type="search"
							placeholder="Search Name..."
							value={searchName}
							onChange={(e) => setSearchName(e.target.value)}
							style={{ width: '100%' }}
						/>
					</label>

					<label style={{ margin: 0 }}>
						<span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
							📚 Course:
						</span>
						<select
							value={selectedCourse}
							onChange={(e) => setSelectedCourse(e.target.value)}
							style={{ width: '100%' }}
						>
							<option value="all">All Courses</option>
							{courses.map((c) => (
								<option key={c} value={c}>{c}</option>
							))}
						</select>
					</label>

					<label style={{ margin: 0 }}>
						<span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
							🎓 Semester:
						</span>
						<select
							value={selectedSemester}
							onChange={(e) => setSelectedSemester(e.target.value)}
							style={{ width: '100%' }}
						>
							<option value="all">All Semesters</option>
							{[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
								<option key={sem} value={String(sem)}>Sem {sem}</option>
							))}
						</select>
					</label>
				</div>
			</div>

			{/* Summary Bar */}
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
				<small style={{ color: '#64748b', fontWeight: 500 }}>
					Showing {filteredStudents.length} of {students.length} students {selectedYear !== 'all' ? `(Batch: ${selectedYear})` : ''}
				</small>
			</div>

			{/* Students Table */}
			{loading ? (
				<p>Loading students...</p>
			) : !filteredStudents.length ? (
				<div style={{ padding: '32px 16px', textAlign: 'center', background: '#fafafa', borderRadius: 8 }}>
					<h3>No student records found</h3>
					<p>Try adjusting your Admission Year, ID, or Enrollment search filters.</p>
				</div>
			) : (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Admission Year</th>
								<th>Student ID</th>
								<th>Enrollment No</th>
								<th>Name</th>
								<th>Course</th>
								<th>Sem &amp; Div</th>
								<th>Status</th>
								{canManage && <th>Actions</th>}
							</tr>
						</thead>
						<tbody>
							{filteredStudents.map((s) => (
								<tr key={s.id}>
									<td>
										<span className="pill" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
											{s.admission_year || '2025-2026'}
										</span>
									</td>
									<td>
										<code style={{ fontSize: '0.85rem', color: '#475569' }}>
											{s.student_id_code || s.id.slice(0, 8)}
										</code>
									</td>
									<td><strong>{s.enrollment}</strong></td>
									<td><b>{s.name}</b></td>
									<td>{s.course}</td>
									<td>Sem {s.semester} {s.division ? `(${s.division})` : ''}</td>
									<td>
										<span className={`pill ${s.active ? 'pill-success' : 'pill-danger'}`}>
											{s.active ? 'Active' : 'Inactive'}
										</span>
									</td>
									{canManage && (
										<td>
											<div style={{ display: 'flex', gap: 6 }}>
												<button
													type="button"
													onClick={() => handleEdit(s)}
													style={{ padding: '4px 8px', fontSize: '0.8rem' }}
												>
													Edit
												</button>
												<button
													type="button"
													className="danger"
													onClick={() => handleDelete(s.id)}
													style={{ padding: '4px 8px', fontSize: '0.8rem' }}
												>
													Delete
												</button>
											</div>
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
