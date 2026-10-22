import React, { useMemo, useState } from 'react';
import ErpModuleOverview from './ErpModuleOverview';
import ErpModuleScreen from './ErpModuleScreen';
import { legacyPageNames } from '../lib/accessControl';
import { erpModulePrimaryTable } from '../lib/erpModules';

// The workspace of one ERP module.
//
// A module opens on the record list that holds its main data, so the students
// module opens on the students, the faculty module on the faculty, the
// accounts module on the ledger and the transport module on the routes. The
// tabs above the list open the other record lists of the same module and the
// overview of the module, which shows how many records every list holds.
//
// A list that belongs to one of the original screens keeps that screen, so the
// notice board of the communication module still opens the original notice
// board.

const legacyTitles = new Set(legacyPageNames);

export default function ErpModuleWorkspace({
	module,
	permissions,
	canManage = false,
	onBackToMain,
	onOpenLegacyPage,
}) {
	const primary = erpModulePrimaryTable(module);
	const tables = module.tables ?? [];
	const [activeKey, setActiveKey] = useState(primary?.key ?? '');
	const activeTable = useMemo(
		() => tables.find((table) => table.key === activeKey) ?? null,
		[tables, activeKey],
	);

	function openTable(table) {
		if (!table) return;
		if (legacyTitles.has(table.title)) {
			onOpenLegacyPage?.(table.title);
			return;
		}
		setActiveKey(table.key);
	}

	function openTableByKey(tableKey) {
		openTable(tables.find((table) => table.key === tableKey));
	}

	return (
		<div className="erp-module-workspace">
			<section className="panel erp-module-head">
				<div className="panelhead">
					<div>
						<span className="erp-module-icon" aria-hidden="true">
							{module.icon}
						</span>
						<h2>{module.title}</h2>
						<p>{module.description}</p>
					</div>
					<div className="actions">
						{onBackToMain && (
							<button
								type="button"
								className="erp-back-main"
								onClick={onBackToMain}
							>
								← Main Dashboard
							</button>
						)}
					</div>
				</div>
				<div className="erp-tabs" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={activeKey === ''}
						className={activeKey === '' ? 'selected' : ''}
						onClick={() => setActiveKey('')}
					>
						Overview
					</button>
					{tables.map((table) => (
						<button
							type="button"
							role="tab"
							key={table.key}
							aria-selected={activeKey === table.key}
							className={activeKey === table.key ? 'selected' : ''}
							onClick={() => openTable(table)}
						>
							{table.title}
						</button>
					))}
				</div>
			</section>

			{activeKey === '' ? (
				<ErpModuleOverview module={module} onNavigate={openTableByKey} />
			) : activeTable ? (
				<ErpModuleScreen
					module={module}
					tableKey={activeKey}
					permissions={permissions}
					canManage={canManage}
					onNavigate={openTableByKey}
				/>
			) : (
				<section className="panel">
					<h2>{module.title}</h2>
					<p className="hint">Choose a record list from the tabs above.</p>
				</section>
			)}
		</div>
	);
}
