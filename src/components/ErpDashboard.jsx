import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { accessibleModules, modulePermissions } from '../lib/erpAccess';
import { erpModuleById, erpModulePrimaryTable } from '../lib/erpModules';

// The role aware dashboard of the ERP.
//
// The summary cards, the charts, the quick actions and the global search are
// all built from the modules that the signed-in account may open. A module
// that is disabled, or that the account has no grant for, never appears.

const searchableTables = [
	{ table: 'students', label: 'Student', columns: 'name,enrollment,student_id_code' },
	{ table: 'faculty', label: 'Faculty', columns: 'name,code,email' },
	{ table: 'inquiries', label: 'Inquiry', columns: 'student_name,inquiry_number,mobile' },
];

function BarChart({ title, data, total }) {
	const max = Math.max(1, ...data.map((entry) => entry.value));
	return (
		<div className="erp-chart">
			<h4>{title}</h4>
			{data.length === 0 && <p className="hint">No data yet.</p>}
			{data.map((entry) => (
				<div className="erp-bar-row" key={entry.label}>
					<span className="erp-bar-label" title={entry.label}>
						{entry.label}
					</span>
					<span className="erp-bar-track">
						<span
							className="erp-bar-fill"
							style={{ width: `${Math.round((entry.value / max) * 100)}%` }}
						/>
					</span>
					<strong>
						{entry.value}
						{total ? (
							<small>{Math.round((entry.value / Math.max(1, total)) * 100)}%</small>
						) : null}
					</strong>
				</div>
			))}
		</div>
	);
}

export default function ErpDashboard({ access, profile, onNavigate }) {
	const modules = useMemo(() => accessibleModules(access), [access]);
	const [cards, setCards] = useState([]);
	const [charts, setCharts] = useState({ courses: [], admissions: [] });
	const [search, setSearch] = useState('');
	const [results, setResults] = useState([]);
	const [searching, setSearching] = useState(false);
	const [error, setError] = useState('');

	const loadDashboard = useCallback(async () => {
		const wanted = modules.filter((module) => modulePermissions(access, module.id).view);
		const requests = wanted.map(async (module) => {
			const config = erpModuleById[module.id];
			const table = erpModulePrimaryTable(config);
			if (!table) return null;
			const { count, error: failure } = await supabase
				.from(table.table)
				.select('id', { count: 'exact', head: true });
			if (failure) {
				console.warn(`Dashboard count failed for ${table.table}`, failure);
				return null;
			}
			return {
				id: module.id,
				title: module.title,
				icon: module.icon,
				label: table.title,
				value: count ?? 0,
			};
		});
		const settled = await Promise.all(settledSafe(requests));
		setCards(settled.filter(Boolean));

		// The two charts that every role can read.
		const [studentRows, applicationRows] = await Promise.all([
			supabase.from('students').select('course,course_id').limit(1000),
			supabase.from('applications').select('status').limit(1000),
		]);
		const courseCounts = new Map();
		for (const row of studentRows.data ?? []) {
			const key = row.course || 'Unassigned';
			courseCounts.set(key, (courseCounts.get(key) ?? 0) + 1);
		}
		setCharts({
			courses: Array.from(courseCounts.entries())
				.map(([label, value]) => ({ label, value }))
				.sort((a, b) => b.value - a.value)
				.slice(0, 8),
			admissions: (applicationRows.data ?? []).reduce((accumulator, row) => {
				const key = row.status || 'submitted';
				accumulator[key] = (accumulator[key] ?? 0) + 1;
				return accumulator;
			}, {}),
		});
	}, [access, modules]);

	useEffect(() => {
		loadDashboard();
	}, [loadDashboard]);

	useEffect(() => {
		const needle = search.trim();
		if (needle.length < 2) {
			setResults([]);
			return undefined;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			setSearching(true);
			const found = [];
			for (const entry of searchableTables) {
				try {
					const { data } = await supabase
						.from(entry.table)
						.select(entry.columns)
						.limit(200);
					const matches = (data ?? []).filter((row) =>
						Object.values(row)
							.filter(Boolean)
							.some((value) =>
								String(value).toLowerCase().includes(needle.toLowerCase()),
							),
						);
					for (const row of matches.slice(0, 5)) {
						found.push({
							label: entry.label,
							title:
								row.name ??
								row.student_name ??
								row.enrollment ??
								row.code ??
								'Record',
							subtitle:
								row.enrollment ??
								row.student_id_code ??
								row.inquiry_number ??
								row.email ??
								'',
							module:
								entry.table === 'students'
									? 'students'
									: entry.table === 'faculty'
										? 'faculty'
										: 'admissions',
						});
					}
				} catch (failure) {
					console.warn(`Global search failed on ${entry.table}`, failure);
				}
			}
			if (!cancelled) {
				setResults(found);
				setSearching(false);
			}
		}, 350);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [search]);

	const admissionData = Object.entries(charts.admissions).map(([label, value]) => ({
		label,
		value,
	}));
	const studentTotal = cards.find((card) => card.id === 'students')?.value ?? 0;

	return (
		<>
			<div className="welcome">
				<div>
					<span>SVIT COLLEGE ERP</span>
					<h2>
						Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}
					</h2>
					<p>
						{modules.length} module{modules.length === 1 ? '' : 's'} are open for
						your account. Use the quick actions below to start working.
					</p>
				</div>
				<div className="orb">✦</div>
			</div>

			<div className="erp-searchbar">
				<input
					type="search"
					placeholder="Search students, faculty and inquiries..."
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					aria-label="Global search"
				/>
				{searching && <span className="hint">Searching…</span>}
				{results.length > 0 && (
					<ul className="erp-search-results">
						{results.map((result, index) => (
							<li key={`${result.label}-${index}`}>
								<span className="pill">{result.label}</span>
								<b>{result.title}</b>
								<small>{result.subtitle}</small>
								<button
									type="button"
									className="link"
									onClick={() => onNavigate?.(result.module)}
								>
									Open
								</button>
							</li>
						))}
					</ul>
				)}
				{search.trim().length >= 2 && !searching && !results.length && (
					<p className="hint">No record matches "{search}".</p>
				)}
			</div>

			{error && <div className="error">{error}</div>}

			<div className="stats erp-stats">
				{cards.slice(0, 10).map((card) => (
					<button
						type="button"
						className="stat stat-button"
						key={card.id}
						onClick={() => onNavigate?.(card.id)}
					>
						<span aria-hidden="true">{card.icon}</span>
						<strong>{card.value}</strong>
						<small>{card.label}</small>
					</button>
				))}
			</div>

			<div className="erp-charts">
				<BarChart title="Students per course" data={charts.courses} total={studentTotal} />
				<BarChart title="Applications by status" data={admissionData} />
			</div>

			<h3>Quick actions</h3>
			<div className="tiles">
				{modules.map((module) => {
					const config = erpModuleById[module.id];
					return (
						<button
							type="button"
							className="tile"
							key={module.id}
							onClick={() => onNavigate?.(module.id)}
						>
							<span aria-hidden="true">{module.icon}</span>
							<b>{module.title}</b>
							<small>{config?.description ?? module.description}</small>
						</button>
					);
				})}
			</div>
		</>
	);
}

// Promise.allSettled that never rejects.
async function settledSafe(promises) {
	const results = await Promise.allSettled(promises);
	return results
		.filter((result) => result.status === 'fulfilled')
		.map((result) => result.value);
}
