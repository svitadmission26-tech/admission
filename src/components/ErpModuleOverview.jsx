import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { money } from '../lib/erpModules';

// The dashboard of one ERP module.
//
// It shows the summary cards of every record list of the module, the number of
// records that each list holds and the link that opens the list. The numbers
// are real counts that the database calculates under the row level security of
// the signed-in account.

export default function ErpModuleOverview({ module, onNavigate }) {
	const [counts, setCounts] = useState({});
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		const entries = await Promise.all(
			(module.tables ?? []).map(async (table) => {
				const { count, error: failure } = await supabase
					.from(table.table)
					.select('id', { count: 'exact', head: true });
				if (failure) {
					console.error(`Count failed for ${table.table}`, failure);
					return [table.key, null];
				}
				return [table.key, count ?? 0];
			}),
		);
		setCounts(Object.fromEntries(entries));
	}, [module]);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>
						{module.icon} {module.title}
					</h2>
					<p>{module.description}</p>
				</div>
			</div>
			{error && <div className="error">{error}</div>}
			<div className="stats erp-stats">
				{(module.tables ?? []).map((table) => (
					<button
						type="button"
						className="stat stat-button"
						key={table.key}
						onClick={() => onNavigate?.(table.key)}
					>
						<strong>{counts[table.key] ?? '—'}</strong>
						<small>{table.title}</small>
					</button>
				))}
			</div>
			<div className="tiles">
				{(module.tables ?? []).map((table) => (
					<button
						type="button"
						className="tile"
						key={table.key}
						onClick={() => onNavigate?.(table.key)}
					>
						<span aria-hidden="true">📄</span>
						<b>{table.title}</b>
						<small>{table.description}</small>
					</button>
				))}
			</div>
			<p className="hint">
				Every list has its own search, filters, form, Excel export, Excel import
				and PDF output. Amounts are shown in rupees.
			</p>
		</section>
	);
}
