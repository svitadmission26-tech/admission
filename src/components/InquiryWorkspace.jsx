import React, { lazy, Suspense, useState } from 'react';
import './InquiryWorkspace.css';

const InquiryDashboard = lazy(() =>
	import('./InquiryModule').then((module) => ({
		default: module.InquiryDashboard,
	})),
);
const InquiryFormBuilder = lazy(() => import('./InquiryFormBuilder'));
const CollegeTiming = lazy(() => import('./CollegeTiming'));
const InquiryAdmissions = lazy(() => import('./InquiryAdmissions'));

const tabs = [
	{ id: 'inquiries', label: 'Inquiries' },
	{ id: 'form', label: 'Inquiry Form' },
	{ id: 'slots', label: 'Dates & Times' },
	{ id: 'admissions', label: 'Final Admissions' },
];

export default function InquiryWorkspace({
	initialTab = 'inquiries',
	canReadInquiries,
	canManageInquiries,
	canViewFeedback,
	canViewHistory,
	canSubmitFeedback,
	canReadAcademics,
	canManageAcademics,
	canReadAdmissions,
	canPrepareAdmissions,
	canDecideAdmissions,
	canManageIntakes,
	admin,
}) {
	const availableTabs = tabs.filter((tab) => {
		if (tab.id === 'inquiries') return canReadInquiries;
		if (tab.id === 'form') return admin;
		if (tab.id === 'slots') return canReadAcademics;
		if (tab.id === 'admissions') return canReadAdmissions;
		return false;
	});
	const [activeTab, setActiveTab] = useState(
		availableTabs.some((tab) => tab.id === initialTab)
			? initialTab
			: availableTabs[0]?.id || '',
	);
	const selectedTab = availableTabs.some((tab) => tab.id === activeTab)
		? activeTab
		: availableTabs[0]?.id || '';

	return (
		<section className="inquiry-workspace">
			<nav className="inquiry-workspace-tabs" aria-label="Inquiry sections">
				{availableTabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={selectedTab === tab.id ? 'active' : ''}
						aria-current={selectedTab === tab.id ? 'page' : undefined}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</nav>
			<Suspense fallback={<section className="panel">Loading inquiry section...</section>}>
				{selectedTab === 'inquiries' && (
					<InquiryDashboard
						canManage={canManageInquiries}
						canViewFeedback={canViewFeedback}
						canViewHistory={canViewHistory}
						canSubmitFeedback={canSubmitFeedback}
					/>
				)}
				{selectedTab === 'form' && <InquiryFormBuilder />}
				{selectedTab === 'slots' && (
					<CollegeTiming canManage={canManageAcademics} />
				)}
				{selectedTab === 'admissions' && (
					<InquiryAdmissions
						canPrepare={canPrepareAdmissions || canDecideAdmissions}
						canDecide={canDecideAdmissions}
						canManageIntakes={canManageIntakes}
					/>
				)}
			</Suspense>
		</section>
	);
}
