import AdmissionChatbot from './AdmissionChatbot';
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
	college_id: '',
	faculty_id: '',
	branch_id: '',
	timing_slot: '',
	gender: '',
};

const genderOptions = [
	{ value: '', label: 'Select gender' },
	{ value: 'male', label: 'Male (Mr.)' },
	{ value: 'female', label: 'Female (Ms.)' },
	{ value: 'other', label: 'Other' },
];

const titlePrefixMap = { male: 'Mr.', female: 'Ms.', other: '' };
const titlePrefixes = ['Mr.', 'Ms.', 'Mrs.', 'Miss', 'Dr.', 'Prof.'];

function stripTitlePrefix(name) {
	let stripped = name.trim();
	for (const prefix of titlePrefixes) {
		const lower = prefix.toLowerCase() + ' ';
		if (stripped.toLowerCase().startsWith(lower)) {
			stripped = stripped.slice(lower.length).trim();
		}
	}
	return stripped;
}

function applyTitlePrefix(rawName, gender) {
	const prefix = titlePrefixMap[gender] ?? '';
	const stripped = stripTitlePrefix(rawName);
	return prefix ? `${prefix} ${stripped}` : stripped;
}

const inquiryStatuses = [
	'all',
	'new',
	'contacted',
	'interested',
	'follow_up',
	'converted',
	'closed',
];
const departments = [
	'Degree Engineering',
	'D2D Engineering',
	'Dental Medicine',
	'Nursing',
	'Pharmacy',
	'Architecture',
	'Law',
	'Management',
	'Computer Applications',
	'Other',
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

const getDepartmentOptions = (colleges) => {
	const uniqueDepts = [...new Set(colleges.map((c) => c.department).filter(Boolean))];
	return [...new Set([...departments, ...uniqueDepts])].sort();
};

const defaultTimingSlots = (() => {
	const slots = [];
	for (let hour = 9; hour <= 17; hour += 1) {
		const displayHour = hour > 12 ? hour - 12 : hour;
		const ampm = hour >= 12 ? 'PM' : 'AM';
		const endHour = hour + 1 > 12 ? hour + 1 - 12 : hour + 1;
		const endAmpm = hour + 1 >= 12 ? 'PM' : 'AM';
		slots.push(`${displayHour}:00 ${ampm} - ${endHour}:00 ${endAmpm}`);
	}
	return slots;
})();

function errorText(error) {
	if (error?.code === 'PGRST202' || error?.code === '42883') {
		return 'Inquiry database functions are missing. Run migrations 005_inquiries.sql through 007_intake_capacity.sql in Supabase in order.';
	}
	if (error?.code === 'PGRST205' || error?.code === '42P01') {
		return 'Inquiry tables are missing. Run migrations 005_inquiries.sql through 007_intake_capacity.sql in Supabase in order.';
	}
	return error?.message || 'An unexpected error occurred.';
}

const defaultInquirySections = [
	{ id: 'general', title: 'General', layout: 'columns' },
	{ id: 'academic', title: 'Academic interest', layout: 'columns' },
	{ id: 'contact', title: 'Contact & scheduling', layout: 'columns' },
];
const defaultInquiryFields = [
	{ key: 'student_name', label: 'Student full name', type: 'text', sectionId: 'general', width: 'full', required: true },
	{ key: 'gender', label: 'Gender', type: 'gender', sectionId: 'general', width: 'half', required: false },
	{ key: 'mobile', label: 'Mobile number', type: 'tel', sectionId: 'general', width: 'half', required: true, placeholder: '10-digit mobile' },
	{ key: 'email', label: 'Email address', type: 'email', sectionId: 'general', width: 'half', required: false, placeholder: 'name@example.com' },
	{ key: 'course_interest', label: 'Interested course', type: 'course', sectionId: 'academic', width: 'half', required: true },
	{ key: 'branch_interest', label: 'Preferred branch', type: 'branch', sectionId: 'academic', width: 'half', required: false },
	{ key: 'qualification', label: 'Current qualification', type: 'qualification', sectionId: 'academic', width: 'half', required: false },
	{ key: 'city', label: 'City', type: 'text', sectionId: 'academic', width: 'half', required: false, placeholder: 'Your city' },
	{ key: 'college_id', label: 'College', type: 'college', sectionId: 'contact', width: 'half', required: true },
	{ key: 'faculty_id', label: 'Select branch', type: 'faculty', sectionId: 'contact', width: 'half', required: true },
	{ key: 'contact_number', label: 'Contact number', type: 'tel', sectionId: 'contact', width: 'half', required: false, placeholder: '10-digit contact number' },
	{ key: 'timing_slot', label: 'Preferred timing (1-hour slot)', type: 'timing', sectionId: 'contact', width: 'half', required: true },
	{ key: 'source', label: 'How did you hear about us?', type: 'source', sectionId: 'contact', width: 'full', required: false },
	{ key: 'message', label: 'Message / questions', type: 'textarea', sectionId: 'contact', width: 'full', required: false },
	{ key: 'consent', label: 'I agree to be contacted by the SVIT admission team regarding my inquiry.', type: 'consent', sectionId: 'contact', width: 'full', required: true },
	{ key: 'website', label: 'Website', type: 'text', sectionId: 'contact', width: 'full', required: false, hidden: true },
];

const qualificationOptions = ['10th', '12th Science', '12th Commerce', 'Diploma', 'Other'];
const sourceOptions = ['website', 'social_media', 'friend', 'school_visit', 'other'];

function conditionVisible(field, values) {
	if (!field.visibility || !field.visibility.fieldKey) return true;
	const actual = String(values?.[field.visibility.fieldKey] ?? '');
	const expected = String(field.visibility.value ?? '');
	if (field.visibility.operator === 'not_equals') return actual !== expected;
	if (field.visibility.operator === 'contains') return actual.includes(expected);
	return actual === expected;
}

export function PublicInquiry() {
	const [form, setForm] = useState(initialInquiry);
	const [busy, setBusy] = useState(false);
	const [reference, setReference] = useState('');
	const [error, setError] = useState('');
	const [courses, setCourses] = useState([]);
	const [branches, setBranches] = useState([]);
	const [colleges, setColleges] = useState([]);
	const [departments, setDepartments] = useState([]);
	const [faculties, setFaculties] = useState([]);
	const [inquiryForms, setInquiryForms] = useState([]);
	const [selectedForm, setSelectedForm] = useState(null);
	const [timingOptions, setTimingOptions] = useState([]);
	const [facultyFilter, setFacultyFilter] = useState({ collegeId: '', department: '' });
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadCatalog = async () => {
			try {
				const [
					coursesRes,
					collegesRes,
					departmentsRes,
					formsRes,
					timingsRes,
				] = await Promise.all([
					supabase.from('courses').select('id, name, code').order('name'),
					supabase.from('colleges').select('id, name').order('name'),
					supabase.from('departments').select('id, name').order('name'),
					supabase
						.from('inquiry_forms')
						.select('*')
						.eq('is_active', true)
						.order('created_at', { ascending: false })
						.limit(1),
					supabase.from('college_timings').select('*').eq('active', true),
				]);
				if (coursesRes.error) console.error('Courses:', coursesRes.error);
				else setCourses(coursesRes.data ?? []);
				if (collegesRes.error) console.error('Colleges:', collegesRes.error);
				else setColleges(collegesRes.data ?? []);
				if (departmentsRes.error) console.error('Departments:', departmentsRes.error);
				else setDepartments(departmentsRes.data ?? []);
				if (formsRes.error) console.error('Inquiry forms:', formsRes.error);
				else {
					const forms = formsRes.data ?? [];
					setInquiryForms(forms);
					if (forms.length > 0) setSelectedForm(forms[0]);
				}
				if (timingsRes.error) console.error('College timings:', timingsRes.error);
				else {
					const timings = timingsRes.data ?? [];
					const slots = [...new Set(
						timings
							.map((t) => {
								if (!t.opens_at || !t.closes_at) return null;
								const fmt = (d) => {
									const h = Number(d.toString().slice(0, 2));
									const m = d.toString().slice(3, 5);
									const ampm = h >= 12 ? 'PM' : 'AM';
									const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
									return `${display}:${m} ${ampm}`;
								};
								return `${fmt(t.opens_at)} - ${fmt(t.closes_at)}`;
							})
							.filter(Boolean),
					)];
					setTimingOptions(slots);
				}
			} catch (err) {
				console.error('Failed to load catalog:', err);
			} finally {
				setLoading(false);
			}
		};
		loadCatalog();
	}, []);

	const effectiveSections = selectedForm?.sections && selectedForm.sections.length
		? selectedForm.sections
		: defaultInquirySections;
	const effectiveFields = selectedForm?.fields && selectedForm.fields.length
		? selectedForm.fields
		: defaultInquiryFields;

	useEffect(() => {
		// Load branches when course changes
		const loadBranches = async () => {
			if (!form.course_interest) {
				setBranches([]);
				return;
			}
			try {
				const { data, error } = await supabase
					.from('branches')
					.select('id, name, intake')
					.eq('course_id', form.course_interest)
					.order('name');
				if (error) throw error;
				setBranches(data ?? []);
			} catch (err) {
				console.error('Failed to load branches:', err);
				setBranches([]);
			}
		};
		loadBranches();
	}, [form.course_interest]);

	useEffect(() => {
		// Load branches when college or department changes
		const loadBranchesAndFaculties = async () => {
			setFaculties([]);
			setBranches([]);
			if (!form.college_id) {
				return;
			}
			try {
				// Load branches for the selected course if available
				let branches = [];
				if (form.course_interest) {
					const { data, error } = await supabase
						.from('branches')
						.select('id, name, intake')
						.eq('course_id', form.course_interest)
						.order('name');
					if (error) console.error('Branches error:', error);
					else branches = data ?? [];
				}
				setBranches(branches);
				
				// Load faculties filtered by college
				const { data, error } = await supabase.rpc('get_faculties_for_inquiry', {
					p_college_id: form.college_id,
					p_department: '',
				});
				if (error) console.error('Faculties error:', error);
				else setFaculties(data ?? []);
			} catch (err) {
				console.error('Failed to load branches/faculties:', err);
			}
		};
		loadBranchesAndFaculties();
	}, [form.college_id, form.course_interest]);

	useEffect(() => {
		if (form.college_id && selectedCollegeTiming.length > 0) {
			setTimingOptions([]);
		}
	}, [form.college_id]);

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

	function setFieldValue(key, value) {
		setForm((prev) => {
			const next = { ...prev, [key]: value };
			// Reset dependent selections when their parent changes
			if (key === 'course_interest') {
				next.branch_interest = '';
				next.course_id = '';
				next.branch_id = '';
			}
			if (key === 'college_id') {
				next.faculty_id = '';
				next.timing_slot = '';
			}
			if (key === 'faculty_id') {
				// Map branch selection to branch_id
				next.branch_id = value;
			}
			if (key === 'gender') {
				next.student_name = applyTitlePrefix(prev.student_name, value);
			}
			return next;
		});
	}

	function fieldOptionsFor(field) {
		switch (field.type) {
			case 'college':
				return colleges.map((college) => ({
					value: college.id,
					label: college.name,
				}));
			case 'course':
				return courses.map((course) => ({
					value: course.id,
					label: course.code ? `${course.name} (${course.code})` : course.name,
				}));
			case 'branch':
				return branches.map((branch) => ({
					value: branch.id,
					label: branch.intake
						? `${branch.name} (intake: ${branch.intake})`
						: branch.name,
				}));
case 'department': {
			const options = new Map();
			departments.forEach((dept) => options.set(dept.name, dept.name));
			// Include contact_number in display for departments from colleges
			colleges.forEach((college) => {
				if (college.department) options.set(college.department, college.department);
			});
			return [...options.values()]
				.sort((a, b) => a.localeCompare(b))
				.map((name) => ({ value: name, label: name }));
		}
			case 'faculty':
				return [...branches]
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((branch) => ({
						value: branch.id,
						label: branch.intake
							? `${branch.name} (intake: ${branch.intake})`
							: branch.name,
					}));
			case 'timing': {
				const slots = timingOptions.length ? timingOptions : defaultTimingSlots;
				return slots.map((slot) => ({ value: slot, label: slot }));
			}
			case 'gender':
				return genderOptions.map((option) => ({
					value: option.value,
					label: option.label,
				}));
			case 'source':
				return sourceOptions.map((option) => ({
					value: option,
					label: option.replaceAll('_', ' '),
				}));
			case 'qualification':
				return qualificationOptions.map((option) => ({
					value: option,
					label: option,
				}));
			case 'select':
			case 'radio':
				return (field.options ?? []).map((option) => ({
					value: option,
					label: option,
				}));
			default:
				return [];
		}
	}

	function renderField(field) {
		if (field.hidden) return null;
		if (!conditionVisible(field, form)) return null;
		const value = form[field.key] ?? '';
		const required = Boolean(field.required);
		const width = field.width || 'full';
		const label = field.label || field.key;

		if (field.type === 'consent') {
			return (
				<label className="inquiry-consent" key={field.key}>
					<input
						type="checkbox"
						required={required}
						checked={Boolean(form[field.key])}
						onChange={(event) => setFieldValue(field.key, event.target.checked)}
					/>
					<span>
						{label}
						{required ? ' *' : ''}
					</span>
				</label>
			);
		}

		if (field.type === 'radio') {
			return (
				<label className={`inquiry-field width-${width}`} key={field.key}>
					{label}
					{required ? ' *' : ''}
					<span className="inquiry-radio-group">
						{fieldOptionsFor(field).map((option) => (
							<span key={option.value}>
								<input
									type="radio"
									name={field.key}
									value={option.value}
									required={required}
									checked={value === option.value}
									onChange={(event) => setFieldValue(field.key, event.target.value)}
								/>
								{option.label}
							</span>
						))}
					</span>
				</label>
			);
		}

		if (field.type === 'checkbox') {
			return (
				<label className={`inquiry-field width-${width}`} key={field.key}>
					<span className="inquiry-check-row">
						<input
							type="checkbox"
							required={required}
							checked={Boolean(form[field.key])}
							onChange={(event) => setFieldValue(field.key, event.target.checked)}
						/>
						{label}
						{required ? ' *' : ''}
					</span>
				</label>
			);
		}

		if (field.type === 'textarea') {
			return (
				<label className={`inquiry-field width-${width}`} key={field.key}>
					{label}
					{required ? ' *' : ''}
					<textarea
						rows={3}
						maxLength={1500}
						required={required}
						value={value}
						placeholder={field.placeholder || ''}
						onChange={(event) => setFieldValue(field.key, event.target.value)}
					/>
				</label>
			);
		}

		const dynamicTypes = [
			'college',
			'course',
			'branch',
			'department',
			'faculty',
			'timing',
			'gender',
			'source',
			'qualification',
			'select',
		];
		if (dynamicTypes.includes(field.type)) {
			const options = fieldOptionsFor(field);
			const isNameField = field.key === 'student_name';
			if (isNameField) {
				return (
					<label className={`inquiry-field width-${width}`} key={field.key}>
						{label}
						{required ? ' *' : ''}
						<div className="inquiry-name-wrapper">
							{form.gender && form.student_name ? (
								<span className="inquiry-title-badge">{titlePrefixMap[form.gender]}</span>
							) : null}
							<input
								required={required}
								maxLength={120}
								value={value}
								placeholder={field.placeholder || 'Enter your full name'}
								onChange={(event) => setFieldValue(field.key, event.target.value)}
							/>
						</div>
					</label>
				);
			}
			return (
				<label className={`inquiry-field width-${width}`} key={field.key}>
					{label}
					{required ? ' *' : ''}
					<select
						required={required}
						value={value}
						onChange={(event) => setFieldValue(field.key, event.target.value)}
					>
						<option value="">Select {label.toLowerCase()}</option>
						{options.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			);
		}

		const inputType = ['email', 'number', 'date', 'tel', 'url'].includes(field.type)
			? field.type
			: 'text';
		return (
			<label className={`inquiry-field width-${width}`} key={field.key}>
				{label}
				{required ? ' *' : ''}
				<input
					type={inputType}
					required={required}
					maxLength={field.type === 'tel' ? 10 : 254}
					inputMode={field.type === 'tel' ? 'numeric' : undefined}
					pattern={field.type === 'tel' ? '[6-9][0-9]{9}' : undefined}
					value={value}
					placeholder={field.placeholder || ''}
					onChange={(event) => setFieldValue(field.key, event.target.value)}
				/>
			</label>
		);
	}

	function renderFieldSection(section, sectionFields) {
		const visibleFields = sectionFields.filter(
			(field) => !field.hidden && conditionVisible(field, form),
		);
		if (!visibleFields.length) return null;
		if (section.layout === 'vertical' || visibleFields.every((f) => (f.width || 'full') === 'full')) {
			return (
				<div className="inquiry-fields-grid">
					{visibleFields.map((field) => renderField(field))}
				</div>
			);
		}
		return (
			<div className="inquiry-fields-grid">
				{visibleFields.map((field) => renderField(field))}
			</div>
		);
	}

	return (
		<div className="inquiry-public">
            <AdmissionChatbot />
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
			<section id="inquiry-form" className="inquiry-form-wrap">
				<div className="inquiry-form-head">
					<small>ADMISSION ENQUIRY</small>
					<h2>Get in touch</h2>
					<p>Fields marked * are required.</p>
				</div>
			{loading ? (
					<div className="inquiry-loading">Loading form…</div>
				) : reference ? (
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
						{effectiveSections.map((section) => {
							const sectionFields = effectiveFields.filter(
								(field) => (field.sectionId || 'general') === section.id,
							);
							if (!sectionFields.length) return null;
							return (
								<div className="inquiry-section" key={section.id}>
									{section.title ? (
										<h3 className="inquiry-section-title">{section.title}</h3>
									) : null}
									{renderFieldSection(section, sectionFields)}
								</div>
							);
						})}
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
	const [colleges, setColleges] = useState([]);
	const [facultyList, setFacultyList] = useState([]);
	const [students, setStudents] = useState([]);
	const [filterCollege, setFilterCollege] = useState('');
	const [filterDepartment, setFilterDepartment] = useState('');
	const [filterFaculty, setFilterFaculty] = useState('');
	const [note, setNote] = useState({
		contact_mode: 'call',
		outcome: '',
		next_follow_up_at: '',
		status: 'follow_up',
		faculty_id: '',
	});
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		(async () => {
			const [collegesRes, studentsRes] = await Promise.all([
				supabase.from('colleges').select('id, name').order('name'),
				supabase.from('students').select('id, enrollment, name, course, semester').order('name').limit(500),
			]);
			if (collegesRes.error) setMessage(errorText(collegesRes.error));
			else setColleges(collegesRes.data ?? []);
			if (studentsRes.error) setMessage(errorText(studentsRes.error));
			else setStudents(studentsRes.data ?? []);
		})();
	}, []);

	useEffect(() => {
		const loadFaculty = async () => {
			if (!filterCollege) {
				setFacultyList([]);
				setFilterFaculty(''); // Reset faculty filter when college changes
				return;
			}
			const { data, error } = await supabase.rpc('get_faculties_for_inquiry', {
				p_college_id: filterCollege,
				p_department: filterDepartment,
			});
			if (error) {
				setMessage(errorText(error));
				return;
			}
			setFacultyList(data ?? []);
		};
		void loadFaculty();
	}, [filterCollege, filterDepartment]);

	async function load() {
		try {
			const { data, error } = await supabase
				.from('inquiries')
				.select('*, colleges(name), profiles(name), students(name, enrollment)')
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
			// First, update the inquiry with faculty assignment if changed
			if (note.faculty_id || note.faculty_id === '') {
				const { error: facultyError } = await supabase
					.from('inquiries')
					.update({ faculty_id: note.faculty_id === '' ? null : note.faculty_id })
					.eq('id', selected.id);
				if (facultyError) throw facultyError;
			}
			// Save follow-up
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
				faculty_id: '',
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
						.includes(search.toLowerCase()) &&
					(filterCollege === '' || row.college_id === filterCollege) &&
					(filterDepartment === '' ||
						(row.department ?? '') === filterDepartment) &&
					(filterFaculty === '' || row.faculty_id === filterFaculty),
			),
		[rows, filter, search, filterCollege, filterDepartment, filterFaculty],
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
					{ key: 'college', label: 'College' },
					{ key: 'department', label: 'Department' },
					{ key: 'faculty', label: 'Faculty' },
					{ key: 'timing_slot', label: 'Timing slot' },
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
						<select
							aria-label="Filter by college"
							value={filterCollege}
							onChange={(event) => setFilterCollege(event.target.value)}
						>
							<option value="">All colleges</option>
							{[...colleges].sort((a, b) => a.name.localeCompare(b.name)).map((college) => (
								<option key={college.id} value={college.id}>
									{college.name}
								</option>
							))}
						</select>
						<select
							aria-label="Filter by department"
							value={filterDepartment}
							onChange={(event) => setFilterDepartment(event.target.value)}
						>
							<option value="">All departments</option>
							{getDepartmentOptions(colleges).map((dept) => (
								<option key={dept} value={dept}>
									{dept}
								</option>
							))}
						</select>
						<select
							aria-label="Filter by faculty"
							value={filterFaculty}
							onChange={(event) => setFilterFaculty(event.target.value)}
						>
							<option value="">All faculty</option>
							{[...facultyList].sort((a, b) => a.name.localeCompare(b.name)).map((faculty) => (
								<option key={faculty.id} value={faculty.id}>
									{faculty.name} ({faculty.designation})
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
									'College',
									'Department',
									'Faculty',
									'Timing',
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
									<td>{row.colleges?.name || '—'}</td>
									<td>{row.department || '—'}</td>
									<td>{row.profiles?.name || row.faculty?.name || '—'}</td>
									<td>{row.timing_slot || '—'}</td>
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
							<b>Student:</b> {selected.students?.name || '—'} ({selected.students?.enrollment || '—'})
						</p>
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
							<b>College:</b> {selected.colleges?.name || '—'}
						</p>
						<p>
							<b>Department:</b> {selected.department || '—'}
						</p>
						<p>
							<b>Handling faculty:</b> {selected.profiles?.name || '—'}
						</p>
						<p>
							<b>Preferred timing:</b> {selected.timing_slot || '—'}
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
								Assign faculty
								<select
									value={note.faculty_id || ''}
									onChange={(event) =>
										setNote({ ...note, faculty_id: event.target.value })
									}
								>
									<option value="">Select faculty</option>
									{canManage && facultyList.length > 0
										? facultyList.sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
												<option key={f.id} value={f.id}>
													{f.name} ({f.designation}) · {f.department}
												</option>
											))
										: []}
								</select>
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
