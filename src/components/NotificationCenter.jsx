import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

// The notification centre of the ERP.
//
// Every module can publish a notification through public.erp_notify(). The
// bell shows the unread count of the signed-in account and the panel lists the
// notifications that the account may read.

export default function NotificationCenter({ onNavigate }) {
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState([]);
	const [unread, setUnread] = useState(0);
	const [error, setError] = useState('');
	const panelRef = useRef(null);

	const load = useCallback(async () => {
		try {
			const { data, error: failure } = await supabase
				.from('erp_notifications')
				.select('id, module_id, title, body, severity, created_at')
				.order('created_at', { ascending: false })
				.limit(50);
			if (failure) throw failure;
			const notifications = data ?? [];
			setItems(notifications);
			if (!notifications.length) {
				setUnread(0);
				return;
			}
			const { data: reads } = await supabase
				.from('erp_notification_reads')
				.select('notification_id')
				.in(
					'notification_id',
					notifications.map((notification) => notification.id),
				);
			setUnread(
				notifications.length - (reads ?? []).length,
			);
		} catch (failure) {
			setError(failure.message ?? 'The notifications could not be loaded.');
		}
	}, []);

	useEffect(() => {
		load();
		const timer = setInterval(load, 120000);
		return () => clearInterval(timer);
	}, [load]);

	useEffect(() => {
		if (!open) return undefined;
		function onClick(event) {
			if (panelRef.current && !panelRef.current.contains(event.target)) {
				setOpen(false);
			}
		}
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, [open]);

	async function markAllRead() {
		try {
			const { data: user } = await supabase.auth.getUser();
			const userId = user?.user?.id;
			if (!userId) return;
			const pending = items.filter((item) => !item.read);
			if (!pending.length) return;
			await supabase.from('erp_notification_reads').upsert(
				pending.map((item) => ({
					notification_id: item.id,
					user_id: userId,
				})),
				{ onConflict: 'notification_id,user_id' },
			);
			setUnread(0);
			load();
		} catch (failure) {
			setError(failure.message ?? 'The notifications could not be updated.');
		}
	}

	return (
		<div className="notification-center" ref={panelRef}>
			<button
				type="button"
				className="notification-bell"
				onClick={() => setOpen((current) => !current)}
				aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
			>
				<span aria-hidden="true">🔔</span>
				{unread > 0 && <span className="notification-badge">{unread}</span>}
			</button>
			{open && (
				<div className="notification-panel">
					<div className="notification-head">
						<b>Notifications</b>
						{unread > 0 && (
							<button type="button" onClick={() => void markAllRead()}>
								Mark all read
							</button>
						)}
					</div>
					{error && <div className="error">{error}</div>}
					{items.length === 0 && (
						<p className="hint">There is no notification for your account.</p>
					)}
					<ul className="notification-list">
						{items.map((item) => (
							<li key={item.id}>
								<span className={`notification-severity ${item.severity}`} />
								<div>
									<b>{item.title}</b>
									{item.body && <p>{item.body}</p>}
									<small>
										{item.created_at
											? new Date(item.created_at).toLocaleString()
											: ''}
										{item.module_id && onNavigate ? (
											<button
												type="button"
												className="link"
												onClick={() => {
													onNavigate(item.module_id);
													setOpen(false);
												}}
											>
												Open module
											</button>
										) : null}
									</small>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
