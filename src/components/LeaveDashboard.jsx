import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function LeaveDashboard({ onNavigate, canManage, userRole }) {
	const todayString = new Date().toISOString().split('T')[0];
	const [selectedDate, setSelectedDate] = useState(todayString);
	const [leaves, setLeaves] = useState([]);
	const [proxies, setProxies] = useState([]);
	const [faculty, setFaculty] = useState([]);
	const [slots, setSlots] = useState([]);
	const [subjects, setSubjects] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [message, setMessage] = useState('');
	const [approverFilter, setApproverFilter] = useState('all');
	const [busy, setBusy] = useState(false);

	async function loadLeaveData() {
		setLoading(true);
		setError('');
		try {
			const [leavesRes, proxiesRes, facultyRes, slotsRes, subjectsRes] = await Promise.all([
				supabase.from('faculty_leaves').select('*, faculty(id, name, code, department)').order('created_at', { ascending: false }),
				supabase.from('lecture_proxies').select('*').order('created_at', { ascending: false }),
				supabase.from('faculty').select('*').order('name'),
				supabase.from('timetable_slots').select('*'),
				supabase.from('subjects').select('*'),
			]);

			if (leavesRes.error) setError(leavesRes.error.message);
			setLeaves(leavesRes.data || []);
			setProxies(proxiesRes.data || []);
			setFaculty(facultyRes.data || []);
			setSlots(slotsRes.data || []);
			setSubjects(subjectsRes.data || []);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void loadLeaveData();
	}, []);

	const facultyMap = Object.fromEntries(faculty.map((f) => [f.id, f]));
	const slotMap = Object.fromEntries(slots.map((s) => [s.id, s]));
	const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));

	// Faculty on leave on selectedDate
	const leavesOnSelectedDate = leaves.filter((leave) => {
		return leave.start_date <= selectedDate && leave.end_date >= selectedDate;
	});

	// Proxies scheduled on selectedDate
	const proxiesOnSelectedDate = proxies.filter((proxy) => {
		return proxy.lecture_date === selectedDate;
	});

	// Pending leave requests for hierarchical approval
	const pendingLeaves = leaves.filter((l) => l.status === 'pending');
	const filteredPendingLeaves = pendingLeaves.filter((l) => {
		if (approverFilter === 'all') return true;
		return (l.approver_post || 'hod') === approverFilter;
	});

	async function handleDecide(leaveId, decision) {
		setBusy(true);
		setMessage('');
		try {
			// Try RPC decide_faculty_leave or fallback to direct update
			const { error: rpcErr } = await supabase.rpc('decide_faculty_leave', {
				p_leave_id: leaveId,
				p_decision: decision,
			});

			if (rpcErr) {
				// Fallback to table update if permitted
				const { error: updateErr } = await supabase
					.from('faculty_leaves')
					.update({
						status: decision === 'approve' ? 'approved' : 'rejected',
						decided_at: new Date().toISOString(),
					})
					.eq('id', leaveId);

				if (updateErr) {
					setError(rpcErr.message || updateErr.message);
				} else {
					setMessage(`Leave request ${decision === 'approve' ? 'approved' : 'rejected'}.`);
					await loadLeaveData();
				}
			} else {
				setMessage(`Leave request ${decision === 'approve' ? 'approved' : 'rejected'}.`);
				await loadLeaveData();
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="panel leave-dashboard-panel">
			<div className="panelhead">
				<div>
					<small>FACULTY &amp; STAFF MANAGEMENT</small>
					<h2>◫ Faculty Leave &amp; Proxy Dashboard</h2>
					<p>Day-to-day faculty attendance, active lecture proxies, and hierarchical approval tracking</p>
				</div>
				<div className="actions" style={{ display: 'flex', gap: 8 }}>
					{onNavigate && (
						<button className="primary" type="button" onClick={() => onNavigate('Leave Management')}>
							🌴 Leave Management &amp; Apply
						</button>
					)}
				</div>
			</div>

			{error && <p className="dfb-message error" role="alert" style={{ color: 'crimson' }}>{error}</p>}
			{message && <p className="hint" role="status" style={{ color: 'green' }}>{message}</p>}

			{/* Date Control & Summary Cards */}
			<div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid #e2e8f0' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
					<label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontWeight: 600 }}>
						📅 Select Date (Day to Day):
						<input
							type="date"
							value={selectedDate}
							onChange={(e) => setSelectedDate(e.target.value)}
							style={{ padding: '6px 12px', fontSize: '0.95rem' }}
						/>
					</label>
					<button
						type="button"
						onClick={() => setSelectedDate(todayString)}
						style={{ fontSize: '0.85rem' }}
					>
						Set Today ({todayString})
					</button>
				</div>
			</div>

			<div className="stats" style={{ marginBottom: 24 }}>
				<div className="stat">
					<span>🌴</span>
					<strong>{leavesOnSelectedDate.length}</strong>
					<small>Faculty on Leave ({selectedDate})</small>
				</div>
				<div className="stat">
					<span>🔄</span>
					<strong>{proxiesOnSelectedDate.length}</strong>
					<small>Lecture Proxies Active</small>
				</div>
				<div className="stat">
					<span>⏳</span>
					<strong>{pendingLeaves.length}</strong>
					<small>Pending Leave Approvals</small>
				</div>
			</div>

			{/* Section 1: Today's / Selected Date Faculty On Leave */}
			<h3>Faculty On Leave for {selectedDate} ({leavesOnSelectedDate.length})</h3>
			{loading ? (
				<p>Loading records...</p>
			) : !leavesOnSelectedDate.length ? (
				<div style={{ padding: '20px 16px', background: '#fafafa', borderRadius: 8, marginBottom: 24, textAlign: 'center' }}>
					<p>No faculty on leave scheduled for {selectedDate}.</p>
				</div>
			) : (
				<div className="tablewrap" style={{ marginBottom: 28 }}>
					<table>
						<thead>
							<tr>
								<th>Faculty</th>
								<th>Department</th>
								<th>Post</th>
								<th>Period</th>
								<th>Leave Type</th>
								<th>Reason</th>
								<th>Status</th>
								<th>Document</th>
							</tr>
						</thead>
						<tbody>
							{leavesOnSelectedDate.map((leave) => {
								const fac = leave.faculty || facultyMap[leave.faculty_id];
								return (
									<tr key={leave.id}>
										<td><b>{fac?.name || 'Faculty Member'}</b></td>
										<td>{fac?.department || leave.department || 'General'}</td>
										<td>
											<span className="pill" style={{ textTransform: 'capitalize' }}>
												{leave.applicant_post || 'staff'}
											</span>
										</td>
										<td>{leave.start_date} to {leave.end_date}</td>
										<td><span className="pill">{leave.leave_type}</span></td>
										<td>{leave.reason || '—'}</td>
										<td>
											<span className={`pill ${leave.status === 'approved' ? 'pill-success' : leave.status === 'rejected' ? 'pill-danger' : 'pill-warning'}`}>
												{leave.status}
											</span>
										</td>
										<td>
											{leave.document_url ? (
												<a
													href={leave.document_url}
													target="_blank"
													rel="noopener noreferrer"
													style={{ color: '#0284c7', textDecoration: 'underline', fontWeight: 500 }}
												>
													📎 View Document
												</a>
											) : (
												<span style={{ color: '#94a3b8' }}>None</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* Section 2: Lecture Proxies for Selected Date */}
			<h3>Lecture Proxies for {selectedDate} ({proxiesOnSelectedDate.length})</h3>
			{!proxiesOnSelectedDate.length ? (
				<div style={{ padding: '20px 16px', background: '#fafafa', borderRadius: 8, marginBottom: 24, textAlign: 'center' }}>
					<p>No lecture proxies assigned for {selectedDate}.</p>
				</div>
			) : (
				<div className="tablewrap" style={{ marginBottom: 28 }}>
					<table>
						<thead>
							<tr>
								<th>Period</th>
								<th>Subject</th>
								<th>Class / Room</th>
								<th>Original Faculty (Absent)</th>
								<th>Assigned Proxy Faculty</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{proxiesOnSelectedDate.map((proxy) => {
								const slot = slotMap[proxy.slot_id];
								const sub = slot ? subjectMap[slot.subject_id] : null;
								const orig = facultyMap[proxy.original_faculty_id];
								const prox = facultyMap[proxy.proxy_faculty_id];
								return (
									<tr key={proxy.id}>
										<td><strong>Period {slot?.period || '—'}</strong></td>
										<td>
											<b>{sub?.name || 'Subject'}</b>
											{sub?.code && <small style={{ display: 'block', color: '#64748b' }}>{sub.code}</small>}
										</td>
										<td>
											{slot?.course} Sem {slot?.semester} ({slot?.division || 'A'})
											<small style={{ display: 'block', color: '#64748b' }}>Room: {slot?.room || 'TBD'}</small>
										</td>
										<td><span style={{ color: '#dc2626' }}>{orig?.name || 'Absent Faculty'}</span></td>
										<td><span style={{ color: '#16a34a', fontWeight: 600 }}>{prox?.name || 'Proxy Faculty'}</span></td>
										<td><span className="pill">{proxy.status}</span></td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* Section 3: Hierarchical Approval Queue */}
			{canManage && (
				<div style={{ marginTop: 24, paddingTop: 16, borderTop: '2px solid #e2e8f0' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
						<div>
							<h3 style={{ margin: 0 }}>Hierarchical Leave Approval Queue ({pendingLeaves.length} Pending)</h3>
							<small style={{ color: '#64748b' }}>
								Approval Chain: Staff ➔ HOD (Department) ➔ Principal ➔ Chairman
							</small>
						</div>
						<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
							<span style={{ fontSize: '0.85rem' }}>Filter by Approver Post:</span>
							<select
								value={approverFilter}
								onChange={(e) => setApproverFilter(e.target.value)}
								style={{ padding: '4px 8px', fontSize: '0.85rem' }}
							>
								<option value="all">All Approver Posts</option>
								<option value="hod">HOD Approvals (Staff Applications)</option>
								<option value="principal">Principal Approvals (HOD Applications)</option>
								<option value="chairman">Chairman Approvals (Principal Applications)</option>
							</select>
						</div>
					</div>

					{!filteredPendingLeaves.length ? (
						<p style={{ color: '#64748b' }}>No pending applications waiting for {approverFilter === 'all' ? 'approval' : `${approverFilter.toUpperCase()} approval`}.</p>
					) : (
						<div className="tablewrap">
							<table>
								<thead>
									<tr>
										<th>Faculty</th>
										<th>Department</th>
										<th>Applicant Post</th>
										<th>Assigned Approver Post</th>
										<th>Dates</th>
										<th>Leave Type &amp; Reason</th>
										<th>Document Link</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{filteredPendingLeaves.map((leave) => {
										const fac = leave.faculty || facultyMap[leave.faculty_id];
										return (
											<tr key={leave.id}>
												<td><b>{fac?.name || 'Faculty Member'}</b></td>
												<td>{fac?.department || leave.department || 'General'}</td>
												<td>
													<span className="pill" style={{ textTransform: 'capitalize' }}>
														{leave.applicant_post || 'staff'}
													</span>
												</td>
												<td>
													<span className="pill" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 600, textTransform: 'uppercase' }}>
														{leave.approver_post || 'hod'}
													</span>
												</td>
												<td>{leave.start_date} to {leave.end_date}</td>
												<td>
													<b>{leave.leave_type}</b>
													{leave.reason && <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#475569' }}>{leave.reason}</p>}
												</td>
												<td>
													{leave.document_url ? (
														<a
															href={leave.document_url}
															target="_blank"
															rel="noopener noreferrer"
															style={{ color: '#0284c7', textDecoration: 'underline', fontWeight: 500 }}
														>
															📎 View Document
														</a>
													) : (
														<span style={{ color: '#94a3b8' }}>None</span>
													)}
												</td>
												<td>
													<div style={{ display: 'flex', gap: 6 }}>
														<button
															type="button"
															disabled={busy}
															className="primary"
															onClick={() => handleDecide(leave.id, 'approve')}
															style={{ padding: '4px 10px', fontSize: '0.8rem' }}
														>
															Approve
														</button>
														<button
															type="button"
															disabled={busy}
															className="danger"
															onClick={() => handleDecide(leave.id, 'reject')}
															style={{ padding: '4px 10px', fontSize: '0.8rem' }}
														>
															Reject
														</button>
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
