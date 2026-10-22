import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { erpModulePrimaryTable } from '../lib/erpModules';

// The ERP modules of the main page.
//
// Every card shows the module and the number of records that its main list
// holds, so the super admin can see the data of every module without opening
// it: the students module shows the number of students, the accounts module
// the number of ledger heads and so on.

export default function ErpModuleGrid({ modules, onOpen }) {
	const [counts, setCounts] = useState({});

	useEffect(() => {
		let cancelled = false;
		const wanted = modules ?? [];
		if (!wanted.length) {
			setCounts({});
			return undefined;
		}
		(async () => {
			const entries = await Promise.all(
				wanted.map(async (module) => {
					const table = erpModulePrimaryTable(module);
					if (!table) return [module.id, null];
					const { count, error } = await supabase
						.from(table.table)
						.select('id', { count: 'exact', head: true });
					if (error) {
						console.warn(`Module count failed for ${table.table}`, error);
						return [module.id, null];
					}
					return [module.id, count ?? 0];
				}),
			);
			if (!cancelled) setCounts(Object.fromEntries(entries));
		})();
		return () => {
			cancelled = true;
		};
	}, [modules]);

	return (
		<div className="module-cards">
			{(modules ?? []).map((module) => {
				const table = erpModulePrimaryTable(module);
				const value = counts[module.id];
				return (
					<button
						type="button"
						className="module-card erp-module-card"
						key={module.id}
						onClick={() => onOpen?.(module.id)}
					>
						<span className="module-icon" aria-hidden="true">
							{module.icon}
						</span>
						<span className="module-title">{module.title}</span>
						<span className="module-description">{module.description}</span>
						<span className="module-badge erp-module-count">
							{value === null || value === undefined
								? `Module ${module.number}`
								: `${value} ${table?.title ?? 'records'}`}
						</span>
					</button>
				);
			})}
		</div>
	);
}
