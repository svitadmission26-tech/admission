import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel } from '../lib/excel';

function money(paise) {
	return '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function groupSum(rows, keyFn, valueFn) {
	const map = new Map();
	for (const row of rows) {
		const key = keyFn(row) || 'Unknown';
		map.set(key, (map.get(key) || 0) + (valueFn(row) || 0));
	}
	return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

export default function ChairmanDashboard() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [intakes, setIntakes] = useState([]);
	const [branches, setBranches] = useState([]);
	const [colleges, setColleges] = useState([]);
	const [admissions, setAdmissions] = useState([]);
	const [applications, setApplications] = useState([]);
	const [payments, setPayments] = useState([]);
	const [assignments, setAssignments] = useState([]);
	const [feeStructures, setFeeStructures] = useState([]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError('');
			const results = await Promise.all([
				supabase.from('admission_intake_summary').select('*'),
				supabase.from('branches').select('id,name,college_id'),
				supabase.from('colleges').select('id,name'),
				supabase.from('inquiry_admissions').select('id,decision,created_at,decided_at,course_name,branch_name,intake_id'),
				supabase.from('applications').select('id,status,created_at'),
				supabase.from('payments').select('amount_paise,recorded_at,assignment_id,mode'),
				supabase.from('fee_assignments').select('id,application_id,amount_paise,fee_structure_id'),
				supabase.from('fee_structures').select('id,title'),
			]);
			if (cancelled) return;
			const failed = results.find((result) => result.error);
			if (failed) {
				setError(failed.error.message);
				setLoading(false);
				return;
			}
			setIntakes(results[0].data ?? []);
			setBranches(results[1].data ?? []);
			setColleges(results[2].data ?? []);
			setAdmissions(results[3].data ?? []);
			setApplications(results[4].data ?? []);
			setPayments(results[5].data ?? []);
			setAssignments(results[6].data ?? []);
			setFeeStructures(results[7].data ?? []);
			setLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const branchById = new Map(branches.map((branch) => [branch.id, branch]));
	const collegeById = new Map(colleges.map((college) => [college.id, college]));
	const feeStructureById = new Map(feeStructures.map((structure) => [structure.id, structure]));
	const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));

	const collegeIntake = groupSum(
		intakes,
		(intake) => collegeById.get(branchById.get(intake.branch_id)?.college_id)?.name,
		(intake) => intake.sanctioned_seats,
	);
	const courseIntake = groupSum(intakes, (intake) => intake.course_name, (intake) => intake.sanctioned_seats);
	const branchIntake = groupSum(intakes, (intake) => intake.branch_name, (intake) => intake.sanctioned_seats);
	const headIntake = groupSum(intakes, (intake) => intake.intake_head, (intake) => intake.sanctioned_seats);

	const totalIntake = intakes.reduce((sum, intake) => sum + Number(intake.sanctioned_seats || 0), 0);
	const admittedCount = admissions.filter((admission) => admission.decision === 'admitted').length;
	const pendingCount = admissions.filter((admission) => admission.decision === 'pending').length;
	const cancelledCount = admissions.filter((admission) => admission.decision === 'not_admitted').length;
	const availableSeats = intakes.reduce((sum, intake) => sum + Number(intake.available_seats || 0), 0);
	const lateralCount = intakes
		.filter((intake) => String(intake.intake_head || '').toLowerCase().includes('lateral'))
		.reduce((sum, intake) => sum + Number(intake.admitted_count || 0), 0);

	const totalFees = payments.reduce((sum, payment) => sum + Number(payment.amount_paise || 0), 0);
	const assignedFees = assignments.reduce((sum, assignment) => sum + Number(assignment.amount_paise || 0), 0);
	const outstandingFees = assignedFees - totalFees;

	const categoryFees = groupSum(
		payments,
		(payment) => {
			const assignment = assignmentById.get(payment.assignment_id);
			const structure = assignment ? feeStructureById.get(assignment.fee_structure_id) : null;
			return structure?.title || 'Unassigned';
		},
		(payment) => payment.amount_paise,
	);

	const trendMap = new Map();
	for (const admission of admissions.filter((item) => item.decision === 'admitted')) {
		const date = (admission.decided_at || admission.created_at || '').slice(0, 10);
		if (!date) continue;
		trendMap.set(date, (trendMap.get(date) || 0) + 1);
	}
	const trends = Array.from(trendMap.entries())
		.map(([date, count]) => ({ date, count }))
		.sort((a, b) => a.date.localeCompare(b.date));

	async function exportExcel() {
		await downloadExcel({
			fileName: 'chairman-dashboard',
			sheetName: 'Chairman Dashboard',
			columns: [
				{ key: 'metric', label: 'Metric' },
				{ key: 'value', label: 'Value' },
			],
			rows: [
				{ metric: 'Total intake', value: totalIntake },
				{ metric: 'Total final admissions', value: admittedCount },
				{ metric: 'Provisional admissions', value: pendingCount },
				{ metric: 'Cancelled admissions', value: cancelledCount },
				{ metric: 'Available seats', value: availableSeats },
				{ metric: 'Lateral entry admissions', value: lateralCount },
				{ metric: 'Total fees collected (paise)', value: totalFees },
				{ metric: 'Outstanding fees (paise)', value: outstandingFees },
			],
		});
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Chairman Dashboard</h2>
					<p>Executive, read-only summary calculated from live database records.</p>
				</div>
				<div className="actions">
					<button type="button" onClick={() => void exportExcel()}>Export Excel</button>
					<button type="button" onClick={() => window.print()}>Export PDF</button>
				</div>
			</div>
			{loading && <p>Loading dashboard…</p>}
			{error && <div className="error">{error}</div>}
			{!loading && !error && (
				<>
					<div className="stats">
						{[
							['Total intake', totalIntake, '🪑'],
							['Final admissions', admittedCount, '🎓'],
							['Provisional', pendingCount, '⏳'],
							['Cancelled', cancelledCount, '❌'],
							['Available seats', availableSeats, '✅'],
							['Lateral entry', lateralCount, '↪️'],
							['Fees collected', money(totalFees), '💰'],
							['Outstanding fees', money(outstandingFees), '📌'],
						].map(([label, value, icon]) => (
							<div className="stat" key={label}>
								<span>{icon}</span>
								<strong>{value}</strong>
								<small>{label}</small>
							</div>
						))}
					</div>

					<h3>College-wise intake</h3>
					<div className="tablewrap">
						<table>
							<thead><tr><th>College</th><th>Intake</th></tr></thead>
							<tbody>
								{collegeIntake.map((row) => (
									<tr key={row.label}><td>{row.label}</td><td>{row.value}</td></tr>
								))}
								{!collegeIntake.length && <tr><td colSpan={2}>No records found.</td></tr>}
							</tbody>
						</table>
					</div>

					<h3>Course-wise intake</h3>
					<div className="tablewrap">
						<table>
							<thead><tr><th>Course</th><th>Intake</th></tr></thead>
							<tbody>
								{courseIntake.map((row) => (
									<tr key={row.label}><td>{row.label}</td><td>{row.value}</td></tr>
								))}
								{!courseIntake.length && <tr><td colSpan={2}>No records found.</td></tr>}
							</tbody>
						</table>
					</div>

					<h3>Branch-wise intake</h3>
					<div className="tablewrap">
						<table>
							<thead><tr><th>Branch</th><th>Intake</th></tr></thead>
							<tbody>
								{branchIntake.map((row) => (
									<tr key={row.label}><td>{row.label}</td><td>{row.value}</td></tr>
								))}
								{!branchIntake.length && <tr><td colSpan={2}>No records found.</td></tr>}
							</tbody>
						</table>
					</div>

					<h3>ACPC / MQ / VQ / NRI / lateral admissions</h3>
					<div className="tablewrap">
						<table>
							<thead><tr><th>Intake head</th><th>Sanctioned seats</th></tr></thead>
							<tbody>
								{headIntake.map((row) => (
									<tr key={row.label}><td>{row.label}</td><td>{row.value}</td></tr>
								))}
								{!headIntake.length && <tr><td colSpan={2}>No records found.</td></tr>}
							</tbody>
						</table>
					</div>

					<h3>Date-wise admission trends</h3>
					<div className="tablewrap">
						<table>
							<thead><tr><th>Date</th><th>Admissions</th></tr></thead>
							<tbody>
								{trends.map((row) => (
									<tr key={row.date}><td>{row.date}</td><td>{row.count}</td></tr>
								))}
								{!trends.length && <tr><td colSpan={2}>No records found.</td></tr>}
							</tbody>
						</table>
					</div>

					<h3>Category-wise fee collection</h3>
					<div className="tablewrap">
						<table>
							<thead><tr><th>Fee structure</th><th>Collected</th></tr></thead>
							<tbody>
								{categoryFees.map((row) => (
									<tr key={row.label}><td>{row.label}</td><td>{money(row.value)}</td></tr>
								))}
								{!categoryFees.length && <tr><td colSpan={2}>No records found.</td></tr>}
							</tbody>
						</table>
					</div>
				</>
			)}
		</section>
	);
}
