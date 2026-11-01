import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function StudentMarksReport() {
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			const { data, error: failure } = await supabase
				.from('student_exam_marks')
				.select('id,subject_name,theory_max,theory_obtained,practical_max,practical_obtained,subject_total,percentage,board_id,exam_id,application_id')
				.order('created_at', { ascending: false });
			if (cancelled) return;
			if (failure) {
				setError(failure.message);
				setRows([]);
			} else {
				setRows(data ?? []);
				setError('');
			}
			setLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Student Marks Report</h2>
					<p>Board exam marks stored independently per student application.</p>
				</div>
			</div>
			{loading && <p>Loading marks…</p>}
			{error && <div className="error">{error}</div>}
			{!loading && !error && (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Application ID</th>
								<th>Subject</th>
								<th>Theory</th>
								<th>Practical</th>
								<th>Total</th>
								<th>Percentage</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id}>
									<td>{row.application_id}</td>
									<td>{row.subject_name || '—'}</td>
									<td>{row.theory_obtained}/{row.theory_max}</td>
									<td>{row.practical_obtained}/{row.practical_max}</td>
									<td>{row.subject_total}</td>
									<td>{Number(row.percentage || 0).toFixed(2)}%</td>
								</tr>
							))}
							{!rows.length && <tr><td colSpan={6}>No marks found.</td></tr>}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
