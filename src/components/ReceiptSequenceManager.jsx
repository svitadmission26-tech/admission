import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import './ReceiptSequenceManager.css';

const emptyForm = {
	college_id: '',
	academic_year: '',
	payment_type: 'Application Fee',
	course_id: '',
	admission_type: 'Regular',
	prefix: '',
	current_sequence: '0',
	active: true,
	show_college_logo: false,
};
const commonPaymentTypes = ['Application Fee', 'Tuition Fee', 'Other'];
const sequenceOptions = 'id,college_id,academic_year,payment_type,course_id,admission_type,prefix,current_sequence,active,show_college_logo';

function receiptPreview(prefix, currentSequence) {
	const nextSequence = Number(currentSequence) + 1;
	if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) return '—';
	return `${prefix || ''}${String(nextSequence).padStart(3, '0')}`;
}

function formatError(error) {
	if (error?.code === '23505')
		return 'A receipt sequence already exists for this college, year, payment type, course, and admission type.';
	return error?.message || (error instanceof Error ? error.message : 'Could not save receipt sequence.');
}

export default function ReceiptSequenceManager() {
	const [rows, setRows] = useState([]);
	const [colleges, setColleges] = useState([]);
	const [courses, setCourses] = useState([]);
	const [academicYears, setAcademicYears] = useState([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [filters, setFilters] = useState({
		college_id: '',
		academic_year: '',
		payment_type: '',
		course_id: '',
		search: '',
	});
	const [editing, setEditing] = useState(null);
	const [form, setForm] = useState(emptyForm);

	async function loadAll() {
		setLoading(true);
		const [sequenceResult, collegeResult, courseResult, yearResult] =
			await Promise.all([
				supabase
					.from('receipt_sequences')
					.select(sequenceOptions)
					.order('academic_year', { ascending: false }),
				supabase.from('colleges').select('id,name,code,logo_url').order('name'),
				supabase.from('courses').select('id,name,code,college_id').order('name'),
				supabase.from('academic_years').select('id,name').order('name', {
					ascending: false,
				}),
			]);
		const error = [
			sequenceResult.error,
			collegeResult.error,
			courseResult.error,
			yearResult.error,
		].find(Boolean);
		if (error) {
			setMessage(formatError(error));
			setLoading(false);
			return;
		}
		setRows(sequenceResult.data ?? []);
		setColleges(collegeResult.data ?? []);
		setCourses(courseResult.data ?? []);
		setAcademicYears(yearResult.data ?? []);
		setLoading(false);
	}

	useEffect(() => {
		void loadAll();
	}, []);

	const courseOptions = useMemo(
		() =>
			filters.college_id
				? courses.filter((course) => course.college_id === filters.college_id)
				: courses,
		[courses, filters.college_id],
	);
	const formCourseOptions = useMemo(
		() =>
			form.college_id
				? courses.filter((course) => course.college_id === form.college_id)
				: courses,
		[courses, form.college_id],
	);
	const years = useMemo(
		() =>
			[...new Set([...academicYears.map((year) => year.name), ...rows.map((row) => row.academic_year)])]
				.filter(Boolean)
				.sort((a, b) => b.localeCompare(a)),
		[academicYears, rows],
	);
	const paymentTypes = useMemo(
		() =>
			[...new Set([...commonPaymentTypes, ...rows.map((row) => row.payment_type)])]
				.filter(Boolean)
				.sort(),
		[rows],
	);
	const visibleRows = useMemo(() => {
		const query = filters.search.trim().toLowerCase();
		return rows.filter((row) => {
			if (filters.college_id && row.college_id !== filters.college_id)
				return false;
			if (filters.academic_year && row.academic_year !== filters.academic_year)
				return false;
			if (filters.payment_type && row.payment_type !== filters.payment_type)
				return false;
			if (filters.course_id && row.course_id !== filters.course_id) return false;
			if (!query) return true;
			const collegeName =
				colleges.find((college) => college.id === row.college_id)?.name ?? '';
			const courseName =
				courses.find((course) => course.id === row.course_id)?.name ?? '';
			return `${row.prefix} ${collegeName} ${courseName} ${row.payment_type} ${row.admission_type}`
				.toLowerCase()
				.includes(query);
		});
	}, [rows, filters, colleges, courses]);

	function startAdd() {
		setEditing('new');
		setForm({
			...emptyForm,
			college_id: filters.college_id || '',
			academic_year: filters.academic_year || years[0] || '',
			payment_type: filters.payment_type || 'Application Fee',
			course_id: filters.course_id || '',
		});
		setMessage('');
	}

	function startEdit(row) {
		setEditing(row.id);
		setForm({
			college_id: row.college_id,
			academic_year: row.academic_year,
			payment_type: row.payment_type,
			course_id: row.course_id ?? '',
			admission_type: row.admission_type,
			prefix: row.prefix,
			current_sequence: String(row.current_sequence),
			active: row.active,
			show_college_logo: Boolean(row.show_college_logo),
		});
		setMessage('');
	}

	async function saveSequence(event) {
		event.preventDefault();
		setMessage('');
		const currentSequence = Number(form.current_sequence);
		if (!Number.isSafeInteger(currentSequence) || currentSequence < 0) {
			setMessage('Current sequence must be a whole number greater than or equal to zero.');
			return;
		}
		const prefix = form.prefix.trim();
		if (!prefix || !/^[A-Za-z0-9-]+$/.test(prefix)) {
			setMessage('Enter a prefix using only letters, numbers, and hyphens.');
			return;
		}
		if (!form.college_id || !form.academic_year || !form.payment_type.trim() || !form.admission_type.trim()) {
			setMessage('College, academic year, payment type, and admission type are required.');
			return;
		}

		const payload = {
			college_id: form.college_id,
			academic_year: form.academic_year.trim(),
			payment_type: form.payment_type.trim(),
			course_id: form.course_id || null,
			admission_type: form.admission_type.trim(),
			prefix,
			current_sequence: currentSequence,
			active: Boolean(form.active),
			show_college_logo: Boolean(form.show_college_logo),
		};
		setBusy(true);
		const result =
			editing === 'new'
				? await supabase.from('receipt_sequences').insert(payload)
				: await supabase
						.from('receipt_sequences')
						.update(payload)
						.eq('id', editing);
		if (result.error) setMessage(formatError(result.error));
		else {
			setEditing(null);
			setMessage(editing === 'new' ? 'Receipt sequence added.' : 'Receipt sequence updated.');
			await loadAll();
		}
		setBusy(false);
	}

	async function resetSequence(row) {
		if (
			!window.confirm(
				`Reset ${row.prefix} receipt sequence to 0? The next preview will be ${receiptPreview(row.prefix, 0)}.`,
			)
		)
			return;
		setBusy(true);
		setMessage('');
		const { error } = await supabase
			.from('receipt_sequences')
			.update({ current_sequence: 0 })
			.eq('id', row.id);
		if (error) setMessage(formatError(error));
		else {
			setMessage('Receipt sequence reset.');
			await loadAll();
		}
		setBusy(false);
	}

	async function deleteSequence(row) {
		if (!window.confirm(`Delete the ${row.prefix} receipt sequence?`)) return;
		setBusy(true);
		setMessage('');
		const { error } = await supabase
			.from('receipt_sequences')
			.delete()
			.eq('id', row.id);
		if (error) setMessage(formatError(error));
		else {
			setMessage('Receipt sequence deleted.');
			await loadAll();
		}
		setBusy(false);
	}

	return (
		<section className="panel receipt-sequences">
			<div className="receipt-title">
				<div>
					<h2>Receipt Sequence Management</h2>
					<p>Configure college-, year-, payment-, and course-specific receipt numbers.</p>
				</div>
				<button type="button" className="primary" onClick={startAdd}>
					＋ Add New
				</button>
			</div>

			<section className="receipt-filter">
				<h3>Filter by Configuration</h3>
				<div className="receipt-filter-fields">
					<label>
						College
						<select
							value={filters.college_id}
							onChange={(event) =>
								setFilters({
									...filters,
									college_id: event.target.value,
									course_id: '',
								})
							}
						>
							<option value="">All Colleges</option>
							{colleges.map((college) => (
								<option key={college.id} value={college.id}>
									{college.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Academic Year
						<select
							value={filters.academic_year}
							onChange={(event) =>
								setFilters({ ...filters, academic_year: event.target.value })
							}
						>
							<option value="">All Years</option>
							{years.map((year) => (
								<option key={year} value={year}>
									{year}
								</option>
							))}
						</select>
					</label>
					<label>
						Payment Type
						<select
							value={filters.payment_type}
							onChange={(event) =>
								setFilters({ ...filters, payment_type: event.target.value })
							}
						>
							<option value="">All Types</option>
							{paymentTypes.map((type) => (
								<option key={type} value={type}>
									{type}
								</option>
							))}
						</select>
					</label>
					<label>
						Course
						<select
							value={filters.course_id}
							onChange={(event) =>
								setFilters({ ...filters, course_id: event.target.value })
							}
						>
							<option value="">All Courses</option>
							{courseOptions.map((course) => (
								<option key={course.id} value={course.id}>
									{course.name}
								</option>
							))}
						</select>
					</label>
					<label className="receipt-search">
						Search
						<input
							value={filters.search}
							onChange={(event) =>
								setFilters({ ...filters, search: event.target.value })
							}
							placeholder="Search by prefix, college or course name..."
						/>
					</label>
				</div>
			</section>

			{message && (
				<div className="receipt-message" role="status">
					{message}
				</div>
			)}

			<div className="receipt-list-heading">
				<h3>Receipt Sequences ({visibleRows.length} of {rows.length})</h3>
			</div>

			{editing && (
				<form className="editgrid receipt-edit-form" onSubmit={saveSequence}>
					<h3>{editing === 'new' ? 'Add Receipt Sequence' : 'Edit Receipt Sequence'}</h3>
					<label>
						College
						<select
							required
							value={form.college_id}
							onChange={(event) =>
								setForm({ ...form, college_id: event.target.value, course_id: '' })
							}
						>
							<option value="">Select college</option>
							{colleges.map((college) => (
								<option key={college.id} value={college.id}>
									{college.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Academic Year
						<input
							required
							list="receipt-academic-years"
							value={form.academic_year}
							onChange={(event) => setForm({ ...form, academic_year: event.target.value })}
							placeholder="e.g. 2026-27"
						/>
						<datalist id="receipt-academic-years">
							{years.map((year) => <option key={year} value={year} />)}
						</datalist>
					</label>
					<label>
						Payment Type
						<input
							required
							list="receipt-payment-types"
							value={form.payment_type}
							onChange={(event) => setForm({ ...form, payment_type: event.target.value })}
						/>
						<datalist id="receipt-payment-types">
							{paymentTypes.map((type) => <option key={type} value={type} />)}
						</datalist>
					</label>
					<label>
						Course
						<select
							value={form.course_id}
							onChange={(event) => setForm({ ...form, course_id: event.target.value })}
						>
							<option value="">All Courses</option>
							{formCourseOptions.map((course) => (
								<option key={course.id} value={course.id}>
									{course.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Admission Type
						<input
							required
							value={form.admission_type}
							onChange={(event) => setForm({ ...form, admission_type: event.target.value })}
							placeholder="e.g. Regular"
						/>
					</label>
					<label>
						Prefix
						<input
							required
							value={form.prefix}
							onChange={(event) => setForm({ ...form, prefix: event.target.value })}
							placeholder="e.g. MQ-"
							maxLength={20}
						/>
					</label>
					<label>
						Current Sequence
						<input
							required
							type="number"
							min="0"
							step="1"
							value={form.current_sequence}
							onChange={(event) =>
								setForm({ ...form, current_sequence: event.target.value })
							}
						/>
					</label>
					<label>
						Status
						<select
							value={String(form.active)}
							onChange={(event) =>
								setForm({ ...form, active: event.target.value === 'true' })
							}
						>
							<option value="true">Active</option>
							<option value="false">Inactive</option>
						</select>
					</label>
					<label className="receipt-logo-toggle">
						<input
							type="checkbox"
							checked={form.show_college_logo}
							onChange={(event) =>
								setForm({ ...form, show_college_logo: event.target.checked })
							}
						/>
						Show college logo on receipts for this sequence
					</label>
					<div className="receipt-preview">
						<span>Next Receipt Preview</span>
						<strong>{receiptPreview(form.prefix, form.current_sequence)}</strong>
					</div>
					{form.show_college_logo &&
						colleges.find((college) => college.id === form.college_id)?.logo_url && (
							<div className="receipt-logo-preview">
								<img
									src={colleges.find((college) => college.id === form.college_id).logo_url}
									alt={`${colleges.find((college) => college.id === form.college_id).name} logo`}
								/>
								<span>Logo will appear on printed receipts using this sequence.</span>
							</div>
						)}
					<div className="actions">
						<button className="primary" type="submit" disabled={busy}>
							{busy ? 'Saving…' : 'Save Sequence'}
						</button>
						<button type="button" onClick={() => setEditing(null)}>
							Cancel
						</button>
					</div>
				</form>
			)}

			<div className="tablewrap">
				<table>
					<thead>
						<tr>
							<th>College</th>
							<th>Course</th>
							<th>Academic Year</th>
							<th>Payment Type</th>
							<th>Admission Type</th>
							<th>Prefix</th>
							<th>Current Seq</th>
							<th>Preview</th>
							<th>College Logo</th>
							<th>Status</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{visibleRows.map((row) => (
							<tr key={row.id}>
								<td>{colleges.find((college) => college.id === row.college_id)?.name ?? '—'}</td>
								<td>{courses.find((course) => course.id === row.course_id)?.name ?? 'All Courses'}</td>
								<td>{row.academic_year}</td>
								<td><span className="pill">{row.payment_type}</span></td>
								<td><span className="pill">{row.admission_type}</span></td>
								<td>{row.prefix}</td>
								<td>{row.current_sequence}</td>
								<td className="receipt-preview-cell">{receiptPreview(row.prefix, row.current_sequence)}</td>
								<td>{row.show_college_logo ? 'Shown' : 'Hidden'}</td>
								<td><span className={`pill ${row.active ? '' : 'receipt-inactive'}`}>{row.active ? 'Active' : 'Inactive'}</span></td>
								<td className="receipt-actions">
									<button type="button" disabled={busy} onClick={() => startEdit(row)} aria-label="Edit sequence">Edit</button>
									<button type="button" disabled={busy} onClick={() => void resetSequence(row)} aria-label="Reset sequence">Reset</button>
									<button type="button" className="danger" disabled={busy} onClick={() => void deleteSequence(row)} aria-label="Delete sequence">Delete</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? (
					<div className="empty">Loading receipt sequences…</div>
				) : !visibleRows.length ? (
					<div className="empty">No receipt sequences found. Add a configuration to get started.</div>
				) : null}
			</div>
		</section>
	);
}
