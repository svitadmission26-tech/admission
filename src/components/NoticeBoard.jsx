import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function NoticeBoard({ canManage, isAdmin, userRole }) {
	const [notices, setNotices] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [search, setSearch] = useState('');
	const [filterAudience, setFilterAudience] = useState('all');
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState(null);
	const [busy, setBusy] = useState(false);

	const initialForm = {
		title: '',
		content: '',
		target_audience: 'all',
		attachment_url: '',
		pinned: false,
		published: true,
	};
	const [form, setForm] = useState(initialForm);

	async function loadNotices() {
		setLoading(true);
		setError('');
		try {
			let query = supabase
				.from('notices')
				.select('*')
				.order('pinned', { ascending: false })
				.order('created_at', { ascending: false });

			const { data, error: err } = await query;
			if (err) {
				// If table does not exist or empty yet
				if (err.code === '42P01') {
					setNotices([]);
					setError('Notice board table not initialized yet. Apply migration 024.');
				} else {
					setError(err.message);
				}
			} else {
				setNotices(data || []);
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void loadNotices();
	}, []);

	async function handleSubmit(e) {
		e.preventDefault();
		if (!form.title.trim() || !form.content.trim()) {
			setError('Notice title and content are required.');
			return;
		}
		setBusy(true);
		setError('');
		setSuccess('');

		try {
			const payload = {
				title: form.title.trim(),
				content: form.content.trim(),
				target_audience: form.target_audience,
				attachment_url: form.attachment_url.trim() || null,
				pinned: Boolean(form.pinned),
				published: Boolean(form.published),
			};

			let result;
			if (editingId) {
				result = await supabase.from('notices').update(payload).eq('id', editingId);
			} else {
				result = await supabase.from('notices').insert(payload);
			}

			if (result.error) {
				setError(result.error.message);
			} else {
				setSuccess(editingId ? 'Notice updated successfully!' : 'Notice posted successfully!');
				setForm(initialForm);
				setEditingId(null);
				setShowForm(false);
				await loadNotices();
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	function handleEdit(notice) {
		setForm({
			title: notice.title || '',
			content: notice.content || '',
			target_audience: notice.target_audience || 'all',
			attachment_url: notice.attachment_url || '',
			pinned: Boolean(notice.pinned),
			published: Boolean(notice.published),
		});
		setEditingId(notice.id);
		setShowForm(true);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	async function handleDelete(id) {
		if (!window.confirm('Are you sure you want to delete this notice?')) return;
		setBusy(true);
		try {
			const { error: err } = await supabase.from('notices').delete().eq('id', id);
			if (err) setError(err.message);
			else {
				setSuccess('Notice deleted.');
				await loadNotices();
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	const filteredNotices = notices.filter((n) => {
		const matchesSearch =
			(n.title && n.title.toLowerCase().includes(search.toLowerCase())) ||
			(n.content && n.content.toLowerCase().includes(search.toLowerCase()));
		const matchesAudience =
			filterAudience === 'all' ||
			n.target_audience === filterAudience ||
			n.target_audience === 'all';
		return matchesSearch && matchesAudience;
	});

	const canEditNotice = canManage || isAdmin;

	return (
		<section className="panel notice-board-panel">
			<div className="panelhead">
				<div>
					<small>CAMPUS ANNOUNCEMENTS &amp; UPDATES</small>
					<h2>📢 College Notice Board</h2>
					<p>Public &amp; Student Circulars, Admission Updates, Exam &amp; Event Notifications</p>
				</div>
				<div className="actions">
					{canEditNotice && (
						<button
							className="primary"
							type="button"
							onClick={() => {
								if (showForm) {
									setShowForm(false);
									setEditingId(null);
									setForm(initialForm);
								} else {
									setShowForm(true);
								}
							}}
						>
							{showForm ? 'Close Form' : '+ Post New Notice'}
						</button>
					)}
				</div>
			</div>

			{error && <p className="dfb-message error" role="alert" style={{ color: 'crimson' }}>{error}</p>}
			{success && <p className="hint" role="status" style={{ color: 'green' }}>{success}</p>}

			{showForm && canEditNotice && (
				<form onSubmit={handleSubmit} className="editgrid notice-form" style={{ marginBottom: 24, padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
					<h3>{editingId ? 'Edit Notice' : 'Post New Notice for Students & Public'}</h3>
					<label>
						Notice Title *
						<input
							type="text"
							required
							placeholder="e.g. Final Admission Verification Schedule 2026-27"
							value={form.title}
							onChange={(e) => setForm({ ...form, title: e.target.value })}
						/>
					</label>
					<label>
						Target Audience *
						<select
							value={form.target_audience}
							onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
						>
							<option value="all">All (Public, Students, Faculty)</option>
							<option value="students">Students Only</option>
							<option value="public">Public / Prospective Candidates</option>
							<option value="faculty">Faculty &amp; Staff Only</option>
						</select>
					</label>
					<label style={{ gridColumn: '1 / -1' }}>
						Notice Content / Message *
						<textarea
							rows="4"
							required
							placeholder="Write notice details, instructions, dates, or guidelines..."
							value={form.content}
							onChange={(e) => setForm({ ...form, content: e.target.value })}
						/>
					</label>
					<label style={{ gridColumn: '1 / -1' }}>
						Attachment URL (PDF, Document link, Google Drive, or Image)
						<input
							type="url"
							placeholder="https://... or upload link"
							value={form.attachment_url}
							onChange={(e) => setForm({ ...form, attachment_url: e.target.value })}
						/>
					</label>
					<div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
						<label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
							<input
								type="checkbox"
								checked={form.pinned}
								onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
							/>
							📌 Pin to Top (Important Notice)
						</label>
						<label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
							<input
								type="checkbox"
								checked={form.published}
								onChange={(e) => setForm({ ...form, published: e.target.checked })}
							/>
							Visible / Published
						</label>
					</div>
					<div className="actions" style={{ gridColumn: '1 / -1', marginTop: 12 }}>
						<button className="primary" type="submit" disabled={busy}>
							{busy ? 'Saving...' : editingId ? 'Update Notice' : 'Publish Notice'}
						</button>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
								setForm(initialForm);
							}}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
				<input
					type="search"
					placeholder="Search notices..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					style={{ maxWidth: 280 }}
				/>
				<div style={{ display: 'flex', gap: 6 }}>
					{[
						['all', 'All Notices'],
						['students', 'Students'],
						['public', 'Public'],
						['faculty', 'Faculty'],
					].map(([key, label]) => (
						<button
							key={key}
							type="button"
							className={filterAudience === key ? 'primary' : ''}
							style={{ padding: '6px 12px', fontSize: '0.85rem' }}
							onClick={() => setFilterAudience(key)}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{loading ? (
				<p>Loading notices...</p>
			) : !filteredNotices.length ? (
				<div style={{ padding: '32px 16px', textAlign: 'center', background: '#f9f9f9', borderRadius: 8 }}>
					<h3>No notices found</h3>
					<p>There are no active notices for the selected filter.</p>
				</div>
			) : (
				<div style={{ display: 'grid', gap: 16 }}>
					{filteredNotices.map((n) => (
						<article
							key={n.id}
							style={{
								padding: 18,
								borderRadius: 8,
								border: n.pinned ? '2px solid #3b82f6' : '1px solid #e5e7eb',
								backgroundColor: n.pinned ? '#eff6ff' : '#ffffff',
								boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
							}}
						>
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
								<div>
									{n.pinned && (
										<span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: 12, marginRight: 8 }}>
											📌 PINNED
										</span>
									)}
									<span style={{ background: '#e5e7eb', color: '#374151', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 12, marginRight: 8, textTransform: 'uppercase' }}>
										{n.target_audience}
									</span>
									{!n.published && (
										<span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>
											DRAFT
										</span>
									)}
									<h3 style={{ margin: '6px 0 0', fontSize: '1.2rem', color: '#111827' }}>{n.title}</h3>
								</div>
								<div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
									{new Date(n.created_at).toLocaleDateString(undefined, {
										year: 'numeric',
										month: 'short',
										day: 'numeric',
									})}
								</div>
							</div>

							<div style={{ whiteSpace: 'pre-line', color: '#374151', lineHeight: '1.6', margin: '12px 0' }}>
								{n.content}
							</div>

							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid #e5e7eb', flexWrap: 'wrap', gap: 8 }}>
								<div>
									{n.attachment_url ? (
										<a
											href={n.attachment_url}
											target="_blank"
											rel="noopener noreferrer"
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 6,
												background: '#10b981',
												color: '#ffffff',
												padding: '6px 14px',
												borderRadius: 6,
												fontSize: '0.85rem',
												fontWeight: 500,
												textDecoration: 'none',
											}}
										>
											📎 View / Download Attachment
										</a>
									) : (
										<span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No attachment</span>
									)}
								</div>
								{canEditNotice && (
									<div style={{ display: 'flex', gap: 8 }}>
										<button type="button" onClick={() => handleEdit(n)} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
											Edit
										</button>
										<button
											type="button"
											className="danger"
											onClick={() => handleDelete(n.id)}
											style={{ padding: '4px 10px', fontSize: '0.8rem' }}
										>
											Delete
										</button>
									</div>
								)}
							</div>
						</article>
					))}
				</div>
			)}
		</section>
	);
}
