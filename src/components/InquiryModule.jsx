import AdmissionChatbot from './AdmissionChatbot';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel, downloadExcelTemplate, readExcelRows } from '../lib/excel';
import './InquiryModule.css';

function localDateValue(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
	if (!value) return '—';
	const datePart = String(value).slice(0, 10);
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
	if (match) return `${match[3]}-${match[2]}-${match[1]}`;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function formatDisplayDateTime(value) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${formatDisplayDate(value)} ${hours}:${minutes}`;
}

function createInitialInquiry() {
	return {
		student_name: '',
		mobile: '',
		email: '',
		course_interest: '',
		branch_interest: '',
		qualification: '',
		academic_result: '',
		academic_percentage: '',
		academic_passing_year: '',
		city: '',
		source: 'website',
		message: '',
		consent: false,
		website: '',
		college_id: '',
		faculty_id: '',
		branch_id: '',
		inquiry_date: '',
		timing_slot: '',
		gender: '',
	};
}

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

function genderFromTitle(title) {
	const normalized = String(title ?? '').toLowerCase().replace(/[^a-z]/g, '');
	if (['mr', 'mister', 'master', 'male'].includes(normalized)) return 'male';
	if (['ms', 'mrs', 'miss', 'female'].includes(normalized)) return 'female';
	return '';
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

function errorText(error) {
	if (error?.code === 'PGRST202' || error?.code === '42883') {
		return 'Public inquiry database functions are missing or out of date. Apply migrations 005_inquiries.sql through 007_intake_capacity.sql, then 027_inquiry_college_faculty.sql and 056_inquiry_other_responses.sql through 069_normalize_nested_mobile_prefixes.sql in order.';
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
	{ key: 'academic_result', label: 'Academic Result', type: 'select', sectionId: 'academic', width: 'half', required: false, options: ['Pass', 'Fail'] },
	{ key: 'academic_percentage', label: 'Percentage / CGPA Points', type: 'number', sectionId: 'academic', width: 'half', required: true, min: 0, max: 100, step: 0.01, visibility: { fieldKey: 'academic_result', operator: 'equals', value: 'Pass' } },
	{ key: 'academic_passing_year', label: 'Passing Year', type: 'number', sectionId: 'academic', width: 'half', required: true, min: 1950, max: new Date().getFullYear(), step: 1, visibility: { fieldKey: 'academic_result', operator: 'equals', value: 'Pass' } },
	{ key: 'city', label: 'City', type: 'text', sectionId: 'academic', width: 'half', required: false, placeholder: 'Your city' },
	{ key: 'college_id', label: 'College', type: 'college', sectionId: 'contact', width: 'half', required: true },
	{ key: 'faculty_id', label: 'Select faculty', type: 'faculty', sectionId: 'contact', width: 'half', required: true },
	{ key: 'contact_number', label: 'Contact number', type: 'tel', sectionId: 'contact', width: 'half', required: false, placeholder: '10-digit contact number' },
	{ key: 'inquiry_date', label: 'Inquiry date', type: 'date', sectionId: 'contact', width: 'half', required: true },
	{ key: 'timing_slot', label: 'Preferred time', type: 'time', sectionId: 'contact', width: 'half', required: true },
	{ key: 'source', label: 'How did you hear about us?', type: 'source', sectionId: 'contact', width: 'full', required: false },
	{ key: 'message', label: 'Message / questions', type: 'textarea', sectionId: 'contact', width: 'full', required: false },
	{ key: 'consent', label: 'I agree to be contacted by the SVIT admission team regarding my inquiry.', type: 'consent', sectionId: 'contact', width: 'full', required: true },
	{ key: 'website', label: 'Website', type: 'text', sectionId: 'contact', width: 'full', required: false, hidden: true },
];

const qualificationOptions = ['10th', '12th Science', '12th Commerce', 'Diploma', 'Other'];
const sourceOptions = ['website', 'social_media', 'friend', 'school_visit', 'other'];

function fieldIdentity(field) {
	return `${field.key ?? ''} ${field.label ?? ''}`
		.toLowerCase()
		.replace(/[^a-z]/g, '');
}

function fieldHasPassOption(field) {
	return Boolean(passOptionFor(field));
}

function passOptionFor(field) {
	return (field.options ?? [])
		.map((option) => {
			if (typeof option === 'object' && option !== null) {
				return {
					value: option.value ?? option.label,
					label: option.label ?? option.value,
				};
			}
			return { value: option, label: option };
		})
		.find((option) => /^pass(?:ed)?$/i.test(String(option.label ?? '').trim()));
}

function isPercentageField(field) {
	return /percentage|percent|cgpa|pointscore/.test(fieldIdentity(field));
}

function isPassingYearField(field) {
	const identity = fieldIdentity(field);
	return /passingyear|yearofpassing|passyear/.test(identity);
}

function isAcademicResponse([key, response]) {
	const field = { key, label: response?.label };
	const identity = fieldIdentity(field);
	const value = String(response?.value ?? '');
	return (
		isPercentageField(field) ||
		isPassingYearField(field) ||
		/academic|education|qualification/.test(identity) ||
		(/result|status/.test(identity) && /^(pass(?:ed)?|fail(?:ed)?)$/i.test(value))
	);
}

function formatAcademicResponses(responses) {
	return Object.entries(responses ?? {})
		.filter(isAcademicResponse)
		.map(([key, response]) => `${response.label || key}: ${response.value}`)
		.join('; ');
}

function conditionVisible(field, values) {
	if (!field.visibility || !field.visibility.fieldKey) return true;
	const actual = String(values?.[field.visibility.fieldKey] ?? '');
	const expected = String(field.visibility.value ?? '');
	if (field.visibility.operator === 'not_equals') return actual !== expected;
	if (field.visibility.operator === 'contains') return actual.includes(expected);
	return actual === expected;
}

function isOtherOption(option) {
	const values =
		typeof option === 'object' && option !== null
			? [option.label, option.value]
			: [option];
	return values.some((value) => /\bother\b/i.test(String(value ?? '').trim()));
}

function isOtherSelection(value, options) {
	return options.some((option) => isOtherOption(option) && option.value === value);
}

function isInquiryDateField(field) {
	if (field.key === 'inquiry_date') return true;
	const identity = `${field.key ?? ''} ${field.label ?? ''}`.toLowerCase();
	return (
		!/(birth|date of birth|\bdob\b)/i.test(identity) &&
		/(inquiry|appointment|visit).{0,20}date|date.{0,20}(inquiry|appointment|visit)/i.test(
			identity,
		)
	);
}

function transformFieldText(field, value) {
	if (typeof value !== 'string') return value;
	const textCase =
		field.textCase || (field.forceUppercase ? 'uppercase' : 'none');
	if (textCase === 'uppercase') return value.toUpperCase();
	if (textCase === 'lowercase') return value.toLowerCase();
	return value;
}

function normalizeIndianMobile(value) {
	let mobile = String(value ?? '')
		.replace(/[૦-૯०-९٠-٩۰-۹]/g, (digit) => {
			const code = digit.codePointAt(0);
			if (code >= 0x0ae6 && code <= 0x0aef) return String(code - 0x0ae6);
			if (code >= 0x0966 && code <= 0x096f) return String(code - 0x0966);
			if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
			return String(code - 0x06f0);
		})
		.replace(/\D/g, '');
	while (mobile.length > 10) {
		if (mobile.startsWith('0091')) {
			mobile = mobile.slice(4);
		} else if (mobile.startsWith('91')) {
			mobile = mobile.slice(2);
		} else if (mobile.startsWith('0')) {
			mobile = mobile.slice(1);
		} else {
			break;
		}
	}
	return mobile;
}

export function PublicInquiry() {
	const [form, setForm] = useState(createInitialInquiry);
	const [busy, setBusy] = useState(false);
	const [reference, setReference] = useState('');
	const [confirmation, setConfirmation] = useState(null);
	const [error, setError] = useState('');
	const [courses, setCourses] = useState([]);
	const [branches, setBranches] = useState([]);
	const [colleges, setColleges] = useState([]);
	const [departments, setDepartments] = useState([]);
	const [faculties, setFaculties] = useState([]);
	const [inquiryForms, setInquiryForms] = useState([]);
	const [selectedForm, setSelectedForm] = useState(null);
	const [catalogError, setCatalogError] = useState('');
	const [inquirySlots, setInquirySlots] = useState([]);
	const [facultyFilter, setFacultyFilter] = useState({ collegeId: '', department: '' });
	const [facultyDeptTab, setFacultyDeptTab] = useState('');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadCatalog = async () => {
			try {
				const [
					coursesRes,
					collegesRes,
					departmentsRes,
					formsRes,
					inquirySlotsRes,
				] = await Promise.all([
					supabase
						.from('courses')
						.select('id, name, code')
						.eq('active', true)
						.order('name'),
					supabase.from('colleges').select('id, name').order('name'),
					supabase.from('departments').select('id, name').order('name'),
					supabase
						.from('inquiry_forms')
						.select('*')
						.eq('is_active', true)
						.order('created_at', { ascending: false })
						.limit(1),
					supabase
						.from('inquiry_appointment_slots')
						.select('id,college_id,slot_date,starts_at,ends_at')
						.eq('active', true)
						.gte('slot_date', localDateValue())
						.order('slot_date')
						.order('starts_at'),
				]);
				if (coursesRes.error) {
					console.error('Courses:', coursesRes.error);
					setCatalogError(`Could not load courses: ${errorText(coursesRes.error)}`);
				} else setCourses(coursesRes.data ?? []);
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
				if (inquirySlotsRes.error) {
					console.error('Inquiry appointment slots:', inquirySlotsRes.error);
					setCatalogError(
						`Could not load inquiry appointment slots: ${errorText(inquirySlotsRes.error)} Apply migration 060_inquiry_appointment_slots.sql.`,
					);
				} else setInquirySlots(inquirySlotsRes.data ?? []);
			} catch (err) {
				console.error('Failed to load catalog:', err);
			} finally {
				setLoading(false);
			}
		};
		loadCatalog();
	}, []);

	const configuredSections = selectedForm?.sections && selectedForm.sections.length
		? selectedForm.sections
		: defaultInquirySections;
	const baseConfiguredFields = selectedForm?.fields && selectedForm.fields.length
		? selectedForm.fields
		: defaultInquiryFields;
	const schedulingSectionId =
		configuredSections.find((section) =>
			/contact|scheduling/i.test(`${section.id} ${section.title}`),
		)?.id || configuredSections[0]?.id || 'contact';
	const validSectionIds = new Set(configuredSections.map((section) => section.id));
	const normalizedConfiguredFields = baseConfiguredFields.map((field) =>
		(isInquiryDateField(field) ||
			field.type === 'date' ||
			field.key === 'timing_slot' ||
			field.type === 'time' ||
			field.type === 'timing') &&
		!validSectionIds.has(field.sectionId)
			? { ...field, sectionId: schedulingSectionId }
			: field,
	);
	const configuredFields = [
		...normalizedConfiguredFields,
		...(normalizedConfiguredFields.some(
			isInquiryDateField,
		)
			? []
			: [
					{
						key: 'inquiry_date',
						label: 'Inquiry date',
						type: 'date',
						sectionId: schedulingSectionId,
						width: 'half',
						required: true,
					},
				]),
		...(normalizedConfiguredFields.some(
			(field) =>
				field.key === 'timing_slot' ||
				field.type === 'timing' ||
				field.type === 'time',
		)
			? []
			: [
					{
						key: 'timing_slot',
						label: 'Preferred time',
						type: 'time',
						sectionId: schedulingSectionId,
						width: 'half',
						required: true,
					},
				]),
	];
	const configuredAcademicSection = configuredSections.find((section) =>
		/academic|education|qualification/i.test(`${section.id} ${section.title}`),
	);
	const pageBranding = selectedForm?.branding ?? {};
	const academicSection =
		configuredAcademicSection ??
		{ id: 'academic_details', title: 'Academic Details', layout: 'columns' };
	const resultField = configuredFields.find(fieldHasPassOption);
	const resultFieldKey =
		resultField?.key ||
		(configuredFields.some((field) => field.key === 'academic_result')
			? 'academic_result_auto'
			: 'academic_result');
	const passValue = resultField
		? passOptionFor(resultField)?.value
		: 'Pass';
	const autoAcademicFields = [
		...(!resultField
			? [
					{
						key: resultFieldKey,
						label: 'Academic Result',
						type: 'select',
						sectionId: academicSection.id,
						width: 'half',
						required: false,
						options: ['Pass', 'Fail'],
					},
				]
			: []),
		...(!configuredFields.some(isPercentageField)
			? [
					{
						key: 'academic_percentage',
						label: 'Percentage / CGPA Points',
						type: 'number',
						sectionId: resultField?.sectionId || academicSection.id,
						width: 'half',
						required: true,
						min: 0,
						max: 100,
						step: 0.01,
					},
				]
			: []),
		...(!configuredFields.some(isPassingYearField)
			? [
					{
						key: 'academic_passing_year',
						label: 'Passing Year',
						type: 'number',
						sectionId: resultField?.sectionId || academicSection.id,
						width: 'half',
						required: true,
						min: 1950,
						max: new Date().getFullYear(),
						step: 1,
					},
				]
			: []),
	].map((field) => ({
		...field,
		visibility: {
			fieldKey: resultFieldKey,
			operator: 'equals',
			value: passValue,
		},
	}));
	const effectiveSections = configuredAcademicSection
		? configuredSections
		: [...configuredSections, academicSection];
	const effectiveFields = [...configuredFields, ...autoAcademicFields];
	const mobileField =
		effectiveFields.find((field) => field.key === 'mobile') ||
		effectiveFields.find((field) =>
			/mobile|phone/.test(fieldIdentity(field)),
		) ||
		effectiveFields.find((field) => field.type === 'tel') ||
		effectiveFields.find((field) =>
			/contact/.test(fieldIdentity(field)),
		);
	const preferredTimeField =
		effectiveFields.find((field) => field.key === 'timing_slot') ||
		effectiveFields.find(
			(field) => field.type === 'timing' || field.type === 'time',
		);
	const inquiryDateField =
		effectiveFields.find(isInquiryDateField);
	const inquiryDateFieldKey = inquiryDateField?.key || 'inquiry_date';
	const selectedInquiryDate =
		form[inquiryDateFieldKey] || form.inquiry_date || '';
	const consentField = effectiveFields.find(
		(field) => field.type === 'consent' || field.key === 'consent',
	);
	const selectedPassField = effectiveFields.find(fieldHasPassOption);
	const academicPassSelected =
		selectedPassField &&
		String(form[selectedPassField.key] ?? '') ===
			String(passOptionFor(selectedPassField)?.value ?? '');
	const courseFieldKey =
		effectiveFields.find((field) => field.type === 'course')?.key ||
		'course_interest';
	const selectedCourseId = form[courseFieldKey] || form.course_interest || '';
	const collegeField = effectiveFields.find((field) => field.type === 'college');
	const collegeFieldKey = collegeField?.key || 'college_id';
	const selectedCollegeId = form[collegeFieldKey] || form.college_id || '';
	const facultyField = effectiveFields.find((field) => field.type === 'faculty');
	const facultyFieldKey = facultyField?.key || 'faculty_id';
	const selectedFaculty = faculties.find(
		(faculty) => faculty.id === form[facultyFieldKey],
	);
	const appointmentCollegeId = selectedFaculty?.college_id || selectedCollegeId;
	const collegeInquirySlots = inquirySlots.filter(
		(slot) =>
			slot.slot_date >= localDateValue() &&
			(!appointmentCollegeId || slot.college_id === appointmentCollegeId),
	);
	const inquiryDates = [...new Set(collegeInquirySlots.map((slot) => slot.slot_date))];
	const selectedDateSlots = collegeInquirySlots.filter(
		(slot) => slot.slot_date === selectedInquiryDate,
	);
	function selectedBranchesFromIds(ids) {
		return branches.filter((branch) => ids.includes(branch.id));
	}

	useEffect(() => {
		let cancelled = false;
		const loadBranches = async () => {
			if (!selectedCourseId) {
				setBranches([]);
				return;
			}
			try {
				const { data, error } = await supabase
					.from('branches')
					.select('id, name, intake')
					.eq('course_id', selectedCourseId)
					.eq('active', true)
					.order('name');
				if (error) throw error;
				if (!cancelled) {
					setBranches(data ?? []);
					setCatalogError('');
				}
			} catch (error) {
				console.error('Failed to load branches:', error);
				if (!cancelled) {
					setBranches([]);
					setCatalogError(`Could not load branches: ${errorText(error)}`);
				}
			}
		};
		void loadBranches();
		return () => {
			cancelled = true;
		};
	}, [selectedCourseId]);

	useEffect(() => {
		const loadFaculties = async () => {
			setFaculties([]);
			try {
				const { data, error } = await supabase.rpc('get_faculties_for_inquiry', {
					p_college_id: selectedCollegeId || null,
					p_department: '',
				});
				if (error) console.error('Faculties error:', error);
				else setFaculties(data ?? []);
			} catch (err) {
				console.error('Failed to load branches/faculties:', err);
			}
		};
		void loadFaculties();
	}, [selectedCollegeId]);

	async function submit(event) {
		event.preventDefault();
		if (busy) return;
		setError('');
		const academicValueError = effectiveFields.find((field) => {
			if (
				!fieldIsVisible(field) ||
				(!isPercentageField(field) && !isPassingYearField(field)) ||
				!String(form[field.key] ?? '').trim()
			) {
				return false;
			}
			const value = Number(form[field.key]);
			return (
				!Number.isFinite(value) ||
				(isPassingYearField(field) && !Number.isInteger(value)) ||
				(field.min != null && value < Number(field.min)) ||
				(field.max != null && value > Number(field.max))
			);
		});
		if (academicValueError) {
			const constraints = [
				academicValueError.min != null && `at least ${academicValueError.min}`,
				academicValueError.max != null && `at most ${academicValueError.max}`,
				isPassingYearField(academicValueError) && 'a whole year',
			].filter(Boolean);
			setError(
				`${academicValueError.label || 'Academic value'} must be a valid number${constraints.length ? ` (${constraints.join(', ')})` : ''}.`,
			);
			return;
		}
		const name = String(form.student_name ?? '').trim();
		const mobile = normalizeIndianMobile(
			form[mobileField?.key ?? 'mobile'],
		);
		const courseInterest = String(form.course_interest ?? '').trim();
		if (name.length < 2 || name.length > 120) {
			setError('Student name must be between 2 and 120 characters.');
			return;
		}
		if (!/^[6-9]\d{9}$/.test(mobile)) {
			setError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
			return;
		}
		setBusy(true);
		try {
			const otherResponses = Object.fromEntries([
				...effectiveFields
					.filter(
						(field) =>
							(field.type === 'date' || field.key === inquiryDateFieldKey) &&
							field.key !== inquiryDateFieldKey &&
							String(form[field.key] ?? '').trim(),
					)
					.map((field) => [
						field.key,
						{
							label: field.label || field.key,
							value: String(form[field.key]).trim(),
						},
					]),
				...(selectedInquiryDate
					? [
							[
								'inquiry_date',
								{
									label: inquiryDateField?.label || 'Inquiry date',
									value: selectedInquiryDate,
								},
							],
						]
					: []),
				...effectiveFields
					.filter((field) =>
						isOtherSelection(
							form[field.key],
							fieldOptionsFor(field),
						),
					)
					.map((field) => [
						field.key,
						{
							label: field.label || field.key,
							value: String(form[`${field.key}_other`] ?? '').trim(),
						},
					]),
				...effectiveFields
					.filter((field) =>
						/academicresult|result|status/.test(fieldIdentity(field)) ||
						isPercentageField(field) ||
						isPassingYearField(field),
					)
					.map((field) => [
						field.key,
						{
							label: field.label || field.key,
							value: String(form[field.key] ?? '').trim(),
						},
					])
					.filter(([, response]) => response.value),
			]);
			const invalidResponse = Object.entries(otherResponses).find(
				([key, response]) =>
					key.length > 100 ||
					typeof response?.label !== 'string' ||
					response.label.length > 200 ||
					typeof response?.value !== 'string' ||
					response.value.length > 500,
			);
			if (invalidResponse) {
				const [key, response] = invalidResponse;
				throw new Error(
					`${response?.label || key} is invalid or too long to save. Keep labels under 200 characters and answers under 500 characters.`,
				);
			}
			if (new TextEncoder().encode(JSON.stringify(otherResponses)).length > 65536) {
				throw new Error(
					'Academic and additional answers are too large to submit. Shorten some answers and try again.',
				);
			}
			const courseField = effectiveFields.find((field) => field.type === 'course');
			const selectedCourse = courses.find(
				(course) => course.id === (form[courseField?.key] || form.course_interest),
			);
			const branchField = effectiveFields.find((field) => field.type === 'branch');
			const selectedBranchIds = String(form.branch_id ?? '')
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
			const selectedBranches = selectedBranchIds
				.map((id) => branches.find((branch) => branch.id === id))
				.filter(Boolean);
			const selectedBranchId = selectedBranchIds[0] || '';
			const selectedFacultyId = faculties.some(
				(faculty) => faculty.id === form[facultyFieldKey],
			)
				? form[facultyFieldKey]
				: '';
			const args = {
				p_student_name: form.student_name,
				p_mobile: mobile,
				p_email: form.email,
				p_course_interest: selectedCourse?.name || form.course_interest,
				p_branch_interest: selectedBranches
					.map((branch) => branch.name)
					.join(', ') || form.branch_interest,
				p_qualification: form.qualification,
				p_city: form.city,
				p_source: form.source,
				p_message: form.message,
				p_consent: Boolean(form[consentField?.key ?? 'consent']),
				p_website: form.website,
				p_college_id: selectedFaculty?.college_id || selectedCollegeId,
				p_department: faculties.find(
					(faculty) => faculty.id === selectedFacultyId,
				)?.department || form.department || '',
				p_faculty_id: selectedFacultyId,
				p_gender: form.gender,
				p_student_id: form.student_id || '',
				p_course_id: selectedCourse?.id || form.course_id || '',
				p_branch_id: selectedBranchId,
				p_timing_slot: form[preferredTimeField?.key ?? 'timing_slot'] || '',
				p_other_responses: otherResponses,
			};
			const { data, error: submitError } = await supabase.rpc(
				'submit_public_inquiry_with_other',
				args,
			);
			if (submitError) throw submitError;
			const selectedBranchesForConfirm = branches.filter((branch) =>
				String(form.branch_id ?? '')
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
					.includes(branch.id),
			);
			setConfirmation({
				reference: data,
				name: form.student_name,
				date: form[inquiryDateFieldKey] || form.inquiry_date || '',
				time: form[preferredTimeField?.key ?? 'timing_slot'] || '',
				branches: selectedBranchesForConfirm.map((b) => b.name),
			});
			setReference(data);
			setForm(createInitialInquiry());
		} catch (submitError) {
			setError(errorText(submitError));
		} finally {
			setBusy(false);
		}
	}

	function setFieldValue(key, value) {
		setForm((prev) => {
			const changedField = effectiveFields.find((field) => field.key === key);
			const next = {
				...prev,
				[key]: changedField
					? transformFieldText(changedField, value)
					: value,
			};
			// Reset dependent selections when their parent changes
			if (key === courseFieldKey || key === 'course_interest') {
				next.branch_interest = '';
				next.course_id = '';
				next.branch_id = '';
				effectiveFields
					.filter((field) => field.type === 'branch')
					.forEach((field) => {
						next[field.key] = '';
					});
			}
			if (
				key === 'college_id' ||
				changedField?.type === 'college' ||
				changedField?.type === 'faculty'
			) {
				effectiveFields
					.filter((field) => field.type === 'faculty')
					.forEach((field) => {
						if (field.key !== key || changedField?.type === 'college') {
							next[field.key] = '';
						}
					});
				next[inquiryDateFieldKey] = '';
				next.inquiry_date = '';
				if (preferredTimeField) next[preferredTimeField.key] = '';
			}
			if (key === inquiryDateFieldKey || key === 'inquiry_date') {
				if (preferredTimeField) next[preferredTimeField.key] = '';
			}
			if (key !== 'gender' && !key.endsWith('_other')) {
				delete next[`${key}_other`];
			}
			if (key === 'gender') {
				next.student_name = applyTitlePrefix(prev.student_name, value);
			}
			const normalizedTitleKey = `${changedField?.key ?? ''} ${changedField?.label ?? ''}`
				.toLowerCase()
				.replace(/[^a-z]/g, '');
			if (
				normalizedTitleKey.includes('title') ||
				normalizedTitleKey.includes('salutation') ||
				normalizedTitleKey.includes('honorific')
			) {
				const gender = genderFromTitle(value);
				if (gender) {
					next.gender = gender;
					const genderField = effectiveFields.find((field) => {
						const identity = `${field.key ?? ''} ${field.label ?? ''}`
							.toLowerCase()
							.replace(/[^a-z]/g, '');
						return identity.includes('gender') || identity.includes('sex');
					});
					if (genderField) next[genderField.key] = gender;
					next.student_name = applyTitlePrefix(prev.student_name, gender);
				}
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
					label: branch.name,
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
				return [...faculties]
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((faculty) => ({
						value: faculty.id,
						label: faculty.department
							? `${faculty.name} (${faculty.department})`
							: faculty.name,
					}));
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
				return (field.options ?? []).map((option) =>
					typeof option === 'object' && option !== null
						? {
								value: option.value ?? option.label,
								label: option.label ?? option.value,
							}
						: { value: option, label: option },
				);
			default:
				return [];
		}
	}

	function renderField(field) {
		if (!fieldIsVisible(field)) return null;
		const value = form[field.key] ?? '';
		const required = Boolean(
			field.required || field.type === 'consent' || field.key === 'consent',
		);
		const width = field.width || 'full';
		const label = field.label || field.key;

		if (field.type === 'college') return null;

		if (field.key === inquiryDateFieldKey) {
			const noSlotsAvailable = !inquiryDates.length;
			const dateRequired = required && inquiryDates.length > 0;
			return (
				<label className={`inquiry-field width-${width}`} key={field.key}>
					{label}
					{dateRequired ? ' *' : ''}
					<select
						required={dateRequired}
						value={value}
						disabled={noSlotsAvailable}
						onChange={(event) => setFieldValue(field.key, event.target.value)}
					>
						<option value="">
							{inquiryDates.length
								? 'Select inquiry date'
								: 'No inquiry dates available'}
						</option>
						{inquiryDates.map((date) => (
							<option key={date} value={date}>
								{formatDisplayDate(date)}
							</option>
						))}
					</select>
				</label>
			);
		}

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
			const options = fieldOptionsFor(field);
			const isOtherSelected = isOtherSelection(value, options);
			return (
				<>
					<label className={`inquiry-field width-${width}`} key={field.key}>
						{label}
						{required ? ' *' : ''}
						<span className="inquiry-radio-group">
							{options.map((option) => (
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
					{isOtherSelected && (
						<label className={`inquiry-field width-${width}`}>
							{label} (Other)
							<input
								type="text"
								required={required}
								maxLength={500}
								value={form[`${field.key}_other`] ?? ''}
								onChange={(event) =>
									setFieldValue(`${field.key}_other`, event.target.value)
								}
							/>
						</label>
					)}
				</>
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

		if (field.key === preferredTimeField?.key || field.type === 'timing') {
			return (
				<label className={`inquiry-field width-${width}`} key={field.key}>
					{label}
					{required ? ' *' : ''}
					<select
						required={required}
						disabled={!selectedInquiryDate || !selectedDateSlots.length}
						value={value}
						onChange={(event) => setFieldValue(field.key, event.target.value)}
					>
						<option value="">
							{!selectedInquiryDate
								? 'Select a date first'
								: selectedDateSlots.length
									? 'Select available time'
									: 'No times available'}
						</option>
						{selectedDateSlots.map((slot) => {
							const start = String(slot.starts_at).slice(0, 5);
							const end = String(slot.ends_at).slice(0, 5);
							return (
								<option key={slot.id} value={`${start} - ${end}`}>
									{start} - {end}
								</option>
							);
						})}
					</select>
				</label>
			);
		}

		const dynamicTypes = [
			'college',
			'course',
			'branch',
			'department',
			'faculty',
			'gender',
			'source',
			'qualification',
			'select',
		];
		if (dynamicTypes.includes(field.type)) {
			const options = fieldOptionsFor(field);

			// ── Faculty field: department tabs + faculty cards ──────────────────
			if (field.type === 'faculty') {
				const deptNames = [...new Set(faculties.map((f) => f.department).filter(Boolean))].sort();
				const activeDeptTab = facultyDeptTab || (deptNames.length > 0 ? deptNames[0] : '');
				const filteredFaculties =
					deptNames.length === 0
						? faculties
						: faculties.filter((f) => f.department === activeDeptTab);
				return (
					<div className={`inquiry-field width-${width} faculty-picker`} key={field.key}>
						<span className="inquiry-field-label">
							{label}
							{required ? ' *' : ''}
						</span>
						{deptNames.length > 0 && (
							<div className="faculty-dept-tabs">
								{deptNames.map((dept) => (
									<button
										key={dept}
										type="button"
										className={`faculty-dept-tab${activeDeptTab === dept ? ' active' : ''}`}
										onClick={() => {
											setFacultyDeptTab(dept);
											// Clear selection if selected faculty not in new dept
											const current = faculties.find((f) => f.id === form[field.key]);
											if (current && current.department !== dept) {
												setFieldValue(field.key, '');
											}
										}}
									>
										{dept}
									</button>
								))}
							</div>
						)}
						{faculties.length === 0 ? (
							<p className="faculty-empty">No faculty available.</p>
						) : filteredFaculties.length === 0 ? (
							<p className="faculty-empty">No faculty in this department.</p>
						) : (
							<div className="faculty-cards">
								{filteredFaculties.map((faculty) => (
									<button
										key={faculty.id}
										type="button"
										className={`faculty-card${form[field.key] === faculty.id ? ' selected' : ''}`}
										onClick={() => setFieldValue(field.key, faculty.id)}
									>
										<span className="faculty-card-name">{faculty.name}</span>
										{faculty.designation && (
											<span className="faculty-card-desig">{faculty.designation}</span>
										)}
										{faculty.department && (
											<span className="faculty-card-dept">{faculty.department}</span>
										)}
									</button>
								))}
							</div>
						)}
						{/* hidden select to carry required validation */}
						<select
							required={required}
							value={form[field.key] ?? ''}
							onChange={() => {}}
							tabIndex={-1}
							aria-hidden="true"
							style={{ opacity: 0, height: 0, width: 0, position: 'absolute', pointerEvents: 'none' }}
						>
							<option value="" />
							{faculties.map((f) => (
								<option key={f.id} value={f.id} />
							))}
						</select>
					</div>
				);
			}
			// ── Branch field: preference-wise selection ───────────────────────
			if (field.type === 'branch') {
				const branchValue = String(form.branch_id ?? '');
				const selectedBranchIds = branchValue
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean);
				const availableBranches = options.filter(
					(option) => !selectedBranchIds.includes(String(option.value)),
				);
				return (
					<label className={`inquiry-field width-${width}`} key={field.key}>
						{label}
						{required ? ' *' : ''}
						<div className="branch-preference-picker">
							<select
								key={selectedBranchIds.length}
								value=""
								onChange={(event) => {
									const val = event.target.value;
									if (val) {
										setFieldValue('branch_id', [
											...selectedBranchIds,
											val,
										].join(','));
									}
								}}
							>
								<option value="">Add branch</option>
								{availableBranches.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
							{selectedBranchIds.length > 0 && (
								<div className="branch-preferences">
									{selectedBranchIds.map((id, index) => {
										const option = options.find(
											(o) => String(o.value) === id,
										);
										if (!option) return null;
										return (
											<div
												key={id}
												className="branch-chip"
											>
												<span className="pref-number">
													{index + 1}.
												</span>
												{option.label}
												<button
													type="button"
													onClick={() => {
														setFieldValue('branch_id',
															selectedBranchIds
																.filter((_, i) => i !== index)
																.join(','));
													}}
												>
													✕
												</button>
											</div>
										);
									})}
								</div>
							)}
						</div>
						{selectedBranchIds.length > 0 && (
							<p className="branch-selected">
								Preferences:{' '}
								{selectedBranchesFromIds(selectedBranchIds)
									.map((b, i) => `${i + 1}. ${b.name}`)
									.join('; ')}
							</p>
						)}
					</label>
				);
			}
			// ───────────────────────────────────────────────────────────────────

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
			const isOtherSelected = isOtherSelection(value, options);
			return (
				<>
					<label className={`inquiry-field width-${width}`} key={field.key}>
						{label}
						{required ? ' *' : ''}
						<select
							required={required}
							value={value}
							onChange={(event) => setFieldValue(field.key, event.target.value)}
						>
							<option value="">
								{options.length
									? `Select ${label.toLowerCase()}`
									: field.type === 'branch' && !selectedCourseId
										? 'Select a course first'
										: `No active ${label.toLowerCase()} options available`}
							</option>
							{options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					{isOtherSelected && (
						<label className={`inquiry-field width-${width}`}>
							{label} (Other)
							<input
								type="text"
								required={required}
								maxLength={500}
								value={form[`${field.key}_other`] ?? ''}
								onChange={(event) =>
									setFieldValue(`${field.key}_other`, event.target.value)
								}
							/>
						</label>
					)}
				</>
			);
		}

		const isAcademicNumberField =
			isPercentageField(field) || isPassingYearField(field);
		const inputType = isAcademicNumberField
			? 'text'
			: ['email', 'number', 'date', 'time', 'tel', 'url'].includes(field.type)
				? field.type
				: 'text';
		return (
			<label className={`inquiry-field width-${width}`} key={field.key}>
				{label}
				{required ? ' *' : ''}
				<input
					type={inputType}
					required={required}
					maxLength={
						field.key === mobileField?.key
							? 20
							: field.type === 'tel'
								? 10
								: 254
					}
					min={!isAcademicNumberField ? field.min : undefined}
					max={!isAcademicNumberField ? field.max : undefined}
					step={!isAcademicNumberField ? field.step : undefined}
					inputMode={
						isAcademicNumberField
							? isPassingYearField(field)
								? 'numeric'
								: 'decimal'
							: field.type === 'tel'
								? 'numeric'
								: undefined
					}
					pattern={
						isAcademicNumberField
							? isPassingYearField(field)
								? '[0-9]{4}'
								: '[0-9]+(\\.[0-9]+)?'
							: field.type === 'tel' && field.key !== mobileField?.key
								? '[6-9][0-9]{9}'
								: undefined
					}
					value={value}
					placeholder={field.placeholder || ''}
					onChange={(event) =>
						setFieldValue(field.key, event.target.value)
					}
				/>
			</label>
		);
	}

	function fieldIsVisible(field) {
		if (field.hidden || field.type === 'college') return false;
		if (isPercentageField(field) || isPassingYearField(field)) {
			return Boolean(academicPassSelected);
		}
		return conditionVisible(field, form);
	}

	function renderFieldSection(section, sectionFields) {
		const visibleFields = sectionFields.filter(
			fieldIsVisible,
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
		<>
			<AdmissionChatbot collegeId={selectedForm?.branding?.chatbotCollegeId} />
			<div className="inquiry-public">
			<section className="inquiry-hero">
				<a
					className={`inquiry-mark${pageBranding.logoUrl ? ' has-logo' : ''}`}
					href="/"
					aria-label={`${pageBranding.universityName || 'SVIT'} home`}
				>
					{pageBranding.logoUrl ? (
						<img src={pageBranding.logoUrl} alt={`${pageBranding.universityName || 'University'} logo`} />
					) : (
						'S'
					)}
				</a>
				<span>{pageBranding.universityName || 'SVIT'} ADMISSION CELL</span>
				{pageBranding.address && (
					<address className="inquiry-hero-address">{pageBranding.address}</address>
				)}
				{pageBranding.contactNumber && (
					<a
						className="inquiry-hero-contact"
						href={`tel:${pageBranding.contactNumber.replace(/[^\d+]/g, '')}`}
					>
						{pageBranding.contactNumber}
					</a>
				)}
				<h1>{pageBranding.heroTitle || 'Your future starts with a conversation.'}</h1>
				{pageBranding.heroDescription && <p>{pageBranding.heroDescription}</p>}
				{pageBranding.footerText && (
					<div className="hero-note">{pageBranding.footerText}</div>
				)}
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
						{confirmation && (
							<>
								<p>
									{confirmation.branches.length > 0
										? `Branches: ${confirmation.branches.join(', ')}`
										: 'Branch: —'}
								</p>
								<p>
									{confirmation.date
										? `Date: ${formatDisplayDate(confirmation.date)}`
										: 'Date: —'}
									{confirmation.time ? ` · Time: ${confirmation.time}` : ''}
								</p>
								<p>Name: {confirmation.name || '—'}</p>
							</>
						)}
						<p>Our admission team will contact you.</p>
						<button type="button" onClick={() => {
							setReference('');
							setConfirmation(null);
						}}>
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
						{catalogError && (
							<div className="error" role="alert">
								{catalogError}
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
		</>
	);
}

export function InquiryDashboard({
	canManage = true,
	canViewFeedback = false,
	canViewHistory = true,
	canSubmitFeedback = false,
}) {
	const importInput = useRef(null);
	const [rows, setRows] = useState([]);
	const [selected, setSelected] = useState(null);
	const [history, setHistory] = useState([]);
	const [feedbackEntries, setFeedbackEntries] = useState([]);
	const [feedbackText, setFeedbackText] = useState('');
	const [canAddFeedback, setCanAddFeedback] = useState(false);
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
	const [assignFacultyDeptTab, setAssignFacultyDeptTab] = useState('');

	useEffect(() => {
		(async () => {
			const [collegesRes, studentsRes] = await Promise.all([
				supabase.from('colleges').select('id, name').order('name'),
				canManage
					? supabase.from('students').select('id, enrollment, name, course, semester').order('name').limit(500)
					: Promise.resolve({ data: [], error: null }),
			]);
			if (collegesRes.error) setMessage(errorText(collegesRes.error));
			else setColleges(collegesRes.data ?? []);
			if (studentsRes.error) setMessage(errorText(studentsRes.error));
			else setStudents(studentsRes.data ?? []);
		})();
	}, [canManage]);

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
				.select('*, colleges(name), profiles(name), students(name, enrollment), faculty(name)')
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
			setHistory([]);
			setFeedbackEntries([]);
			setFeedbackText('');
			setCanAddFeedback(false);
			if (!selected) {
				setHistory([]);
				return;
			}
			if (canViewHistory) {
				const { data, error } = await supabase
					.from('inquiry_followups')
					.select('*')
					.eq('inquiry_id', selected.id)
					.order('created_at', { ascending: false });
				if (cancelled) return;
				if (error) setMessage(errorText(error));
				else setHistory(data ?? []);
			}
			if (canViewFeedback) {
				const { data, error } = await supabase
					.from('inquiry_feedback')
					.select('id,feedback,created_at,profiles:submitted_by(full_name)')
					.eq('inquiry_id', selected.id)
					.order('created_at', { ascending: false });
				if (cancelled) return;
				if (error) setMessage(errorText(error));
				else setFeedbackEntries(data ?? []);
			}
			if (canSubmitFeedback) {
				const { data, error } = await supabase.rpc(
					'can_submit_inquiry_feedback',
					{ p_inquiry_id: selected.id },
				);
				if (cancelled) return;
				if (error) setMessage(errorText(error));
				else setCanAddFeedback(Boolean(data));
			}
		}
		void loadHistory();
		return () => {
			cancelled = true;
		};
	}, [selected, canViewHistory, canViewFeedback, canSubmitFeedback]);

	async function saveInquiryFeedback(event) {
		event.preventDefault();
		if (!selected || !canAddFeedback || busy) return;
		setBusy(true);
		setMessage('');
		try {
			const { error } = await supabase.rpc('submit_inquiry_feedback', {
				p_inquiry_id: selected.id,
				p_feedback: feedbackText,
			});
			if (error) throw error;
			setCanAddFeedback(false);
			setFeedbackText('');
			setMessage('Inquiry feedback submitted.');
			if (canViewFeedback) {
				const { data, error: feedbackError } = await supabase
					.from('inquiry_feedback')
					.select('id,feedback,created_at,profiles:submitted_by(full_name)')
					.eq('inquiry_id', selected.id)
					.order('created_at', { ascending: false });
				if (feedbackError) throw feedbackError;
				setFeedbackEntries(data ?? []);
			}
		} catch (error) {
			setMessage(errorText(error));
		} finally {
			setBusy(false);
		}
	}

	async function saveFollowUp(event) {
		event.preventDefault();
		if (!selected || !canManage || busy) return;
		setBusy(true);
		setMessage('');
		try {
			const assignedFaculty = facultyList.find(
				(faculty) => faculty.id === note.faculty_id,
			);
			if (canManage) {
				const { error: facultyError } = await supabase
					.from('inquiries')
					.update({
						assigned_faculty_id: note.faculty_id || null,
						department:
							assignedFaculty?.department ?? selected.department ?? '',
					})
					.eq('id', selected.id);
				if (facultyError) throw facultyError;
			}
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
			if (canManage) {
				setSelected((current) =>
					current
						? {
								...current,
								assigned_faculty_id: note.faculty_id || null,
								department:
									assignedFaculty?.department ?? current.department ?? '',
								faculty: assignedFaculty
									? { name: assignedFaculty.name }
									: null,
							}
						: current,
				);
			}
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
					(filterFaculty === '' ||
						row.assigned_faculty_id === filterFaculty),
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
					{ key: 'academic_details', label: 'Academic details' },
					{ key: 'city', label: 'City' },
					{ key: 'source', label: 'Source' },
					{ key: 'college', label: 'College' },
					{ key: 'department', label: 'Department' },
					{ key: 'faculty', label: 'Faculty' },
					{ key: 'inquiry_date', label: 'Inquiry date' },
					{ key: 'timing_slot', label: 'Preferred time' },
					{ key: 'status', label: 'Status' },
					{ key: 'next_follow_up_at', label: 'Next follow-up' },
					{ key: 'created_at', label: 'Created at' },
				],
				rows: shownRows.map((row) => ({
					...row,
					academic_details: formatAcademicResponses(row.other_responses),
					inquiry_date: row.other_responses?.inquiry_date?.value ?? '',
					faculty: row.faculty?.name ?? row.profiles?.name ?? '',
				})),
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
				const mobile = normalizeIndianMobile(row.mobile);
				if (!/^[6-9]\d{9}$/.test(mobile))
					throw new Error(
						`Row ${index + 2}: mobile must be a valid 10-digit Indian number, optionally with +91 or 0 prefix.`,
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
									'Inquiry date',
									'Preferred time',
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
									<td>
										{row.other_responses?.inquiry_date?.value
											? formatDisplayDate(
													row.other_responses.inquiry_date.value,
												)
											: '—'}
									</td>
									<td>{row.timing_slot || '—'}</td>
									<td>
										<span className="pill">{row.status.replaceAll('_', ' ')}</span>
									</td>
									<td>
										{row.next_follow_up_at
											? formatDisplayDateTime(row.next_follow_up_at)
											: '—'}
									</td>
									<td>
										<button
											type="button"
											onClick={() => {
												setSelected(row);
												setMessage('');
												setFilterCollege(row.college_id || '');
												setNote((current) => ({
													...current,
													faculty_id: row.assigned_faculty_id || '',
												}));
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
						{Object.entries(selected.other_responses ?? {})
							.filter(isAcademicResponse)
							.map(([key, response]) => (
								<p key={key}>
									<b>{response.label || key}:</b> {response.value}
								</p>
							))}
						<p>
							<b>City:</b> {selected.city || '—'}
						</p>
						<p>
							<b>Source:</b> {selected.source}
						</p>
						{selected.other_responses?.inquiry_date?.value && (
							<p>
								<b>Inquiry date:</b>{' '}
								{formatDisplayDate(
									selected.other_responses.inquiry_date.value,
								)}
							</p>
						)}
						{Object.entries(selected.other_responses ?? {}).map(
							([key, response]) =>
								response?.value &&
								key !== 'inquiry_date' &&
								!isAcademicResponse([key, response]) ? (
									<p key={key}>
										<b>{response.label || key} (Other):</b> {response.value}
									</p>
								) : null,
						)}
						<p>
							<b>College:</b> {selected.colleges?.name || '—'}
						</p>
						<p>
							<b>Department:</b> {selected.department || '—'}
						</p>
						<p>
							<b>Handling faculty:</b>{' '}
							{selected.faculty?.name || selected.profiles?.name || '—'}
						</p>
						<p>
							<b>Preferred time:</b> {selected.timing_slot || '—'}
						</p>
						<p>
							<b>Message:</b> {selected.message || '—'}
						</p>
					</div>
					{canViewFeedback && (
						<div className="inquiry-feedback">
							<h3>Faculty feedback</h3>
							{feedbackEntries.length ? (
								feedbackEntries.map((entry) => (
									<div className="inquiry-history" key={entry.id}>
										<b>{entry.profiles?.full_name || 'Faculty'}</b>
										<span>{entry.feedback}</span>
										<small>{new Date(entry.created_at).toLocaleString()}</small>
									</div>
								))
							) : (
								<p>No faculty feedback has been submitted.</p>
							)}
						</div>
					)}
					{canAddFeedback && (
						<form className="editgrid" onSubmit={saveInquiryFeedback}>
							<h3>Add completed-inquiry feedback</h3>
							<label>
								Feedback
								<textarea
									required
									minLength={2}
									maxLength={2000}
									rows={4}
									value={feedbackText}
									onChange={(event) => setFeedbackText(event.target.value)}
								/>
							</label>
							<button className="primary" disabled={busy}>
								{busy ? 'Saving...' : 'Submit feedback'}
							</button>
						</form>
					)}
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
														<div className="assign-faculty-picker">
								<span className="assign-faculty-label">Assign faculty</span>
								{(() => {
									const deptNames = [...new Set(facultyList.map((f) => f.department).filter(Boolean))].sort();
									const activeTab = assignFacultyDeptTab || (deptNames.length > 0 ? deptNames[0] : '');
									const filtered = deptNames.length === 0
										? facultyList
										: facultyList.filter((f) => f.department === activeTab);
									return (
										<>
											{deptNames.length > 0 && (
												<div className="faculty-dept-tabs">
													{deptNames.map((dept) => (
														<button
															key={dept}
															type="button"
															className={`faculty-dept-tab${activeTab === dept ? ' active' : ''}`}
															onClick={() => {
																setAssignFacultyDeptTab(dept);
																const cur = facultyList.find((f) => f.id === note.faculty_id);
																if (cur && cur.department !== dept) setNote({ ...note, faculty_id: '' });
															}}
														>
															{dept}
														</button>
													))}
												</div>
											)}
											{canManage && facultyList.length > 0 ? (
												<div className="faculty-cards assign-faculty-cards">
													{filtered.map((f) => (
														<button
															key={f.id}
															type="button"
															className={`faculty-card${note.faculty_id === f.id ? ' selected' : ''}`}
															onClick={() => setNote({ ...note, faculty_id: f.id })}
														>
															<span className="faculty-card-name">{f.name}</span>
															{f.designation && <span className="faculty-card-desig">{f.designation}</span>}
															{f.department && <span className="faculty-card-dept">{f.department}</span>}
														</button>
													))}
												</div>
											) : (
												<p className="faculty-empty">No faculty available.</p>
											)}
										</>
									);
								})()}
							</div>
							<button className="primary" disabled={busy}>
								{busy ? 'Saving...' : 'Save follow-up'}
							</button>
						</form>
					)}
					{canViewHistory && (
						<>
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
						</>
					)}
				</section>
			)}
		</div>
	);
}
