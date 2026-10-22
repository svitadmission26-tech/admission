import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const HEADS = ['ACPC', 'MQ', 'NRI', 'TFWS'];

export default function IntakeReport() {
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			const { data, error: failure } = await supabase
				.from('admission_intake_summary')
				.select('*');
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
		load();
		return () => {
			cancelled = true;
		};
	}, []);

	// Pivot the flat intake rows into one row per branch.
	const branches = [];
	const branchMap = new Map();
	for (const row of rows) {
		const key = row.branch_name || row.branch_id || 'Unknown';
		if (!branchMap.has(key)) {
			const entry = {
				branch: key,
				course: row.course_name || '',
				year: row.academic_year || '',
				heads: {},
				filled: {},
				totalIntake: 0,
				totalFilled: 0,
			};
			branchMap.set(key, entry);
			branches.push(entry);
		}
		const entry = branchMap.get(key);
		const head = String(row.intake_head || '').trim().toUpperCase();
		const sanctioned = Number(row.sanctioned_seats || 0);
		const admitted = Number(row.admitted_count || 0);
		entry.heads[head] = (entry.heads[head] || 0) + sanctioned;
		entry.filled[head] = (entry.filled[head] || 0) + admitted;
		entry.totalIntake += sanctioned;
		entry.totalFilled += admitted;
	}

	const num = (value) => (Number.isFinite(value) ? value : 0);

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Intake Report</h2>
					<p>Seat intake summary as per the government quota (ACPC, MQ, NRI, TFWS).</p>
				</div>
			</div>
			{loading && <p>Loading intake report…</p>}
			{error && <div className="error">{error}</div>}
			{!loading && !error && (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Sr. No.</th>
								<th>Branch</th>
								<th>Intake</th>
								<th>ACPC</th>
								<th>MQ</th>
								<th>NRI</th>
								<th>Total</th>
								<th>TFWS</th>
								<th>Filled ACPC</th>
								<th>Filled MQ</th>
								<th>Filled NRI</th>
								<th>Filled Total</th>
								<th>Vacant ACPC</th>
								<th>Vacant MQ</th>
								<th>Vacant NRI</th>
								<th>Total Vacant</th>
							</tr>
						</thead>
						<tbody>
							{branches.map((entry, index) => {
								const acpc = num(entry.heads.ACPC);
								const mq = num(entry.heads.MQ);
								const nri = num(entry.heads.NRI);
								const tfws = num(entry.heads.TFWS);
								const total = acpc + mq + nri;
								const filledAcpc = num(entry.filled.ACPC);
								const filledMq = num(entry.filled.MQ);
								const filledNri = num(entry.filled.NRI);
								const filledTotal = filledAcpc + filledMq + filledNri;
								const vacantAcpc = acpc - filledAcpc;
								const vacantMq = mq - filledMq;
								const vacantNri = nri - filledNri;
								const totalVacant = vacantAcpc + vacantMq + vacantNri;
								return (
									<tr key={entry.branch}>
										<td>{index + 1}</td>
										<td>{entry.branch}</td>
										<td>{entry.totalIntake}</td>
										<td>{acpc}</td>
										<td>{mq}</td>
										<td>{nri}</td>
										<td>{total}</td>
										<td>{tfws}</td>
										<td>{filledAcpc}</td>
										<td>{filledMq}</td>
										<td>{filledNri}</td>
										<td>{filledTotal}</td>
										<td>{vacantAcpc}</td>
										<td>{vacantMq}</td>
										<td>{vacantNri}</td>
										<td>{totalVacant}</td>
									</tr>
								);
							})}
							{!branches.length && (
								<tr>
									<td colSpan={16}>No intake records found.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
