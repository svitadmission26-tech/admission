import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { downloadExcel } from '../lib/excel';
import './SmartIdCards.css';

const emptyForm = {
	application_id: '',
	student_name: '',
	enrollment_number: '',
	course_name: '',
	branch_name: '',
	academic_year: '',
	expires_on: '',
	photo_path: '',
};

function getErrorMessage(error) {
	if (
		error?.code === 'PGRST205' ||
		error?.code === '42P01' ||
		error?.message?.includes("public.id_cards")
	) {
		return 'ID card tables are missing. Run supabase/migrations/004_smart_id_cards.sql after 003_staff_roles.sql in the Supabase SQL Editor, then reload.';
	}
	return error?.message || 'An unexpected error occurred.';
}

export default function SmartIdCards() {
	const [cards, setCards] = useState([]);
	const [applications, setApplications] = useState([]);
	const [form, setForm] = useState(emptyForm);
	const [selectedCard, setSelectedCard] = useState(null);
	const [qrCode, setQrCode] = useState('');
	const [photoUrl, setPhotoUrl] = useState('');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);

	async function load() {
		try {
			const [cardsResult, applicationsResult] = await Promise.all([
				supabase
					.from('id_cards')
					.select('*')
					.order('created_at', { ascending: false }),
				supabase
					.from('applications')
					.select('id,application_number,status,answers')
					.eq('status', 'approved')
					.order('created_at', { ascending: false })
					.limit(200),
			]);
			const error = cardsResult.error || applicationsResult.error;
			if (error) {
				setMessage(getErrorMessage(error));
				return;
			}
			setCards(cardsResult.data ?? []);
			setApplications(applicationsResult.data ?? []);
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
	}, []);

	async function exportCards() {
		try {
			await downloadExcel({
				fileName: 'svit-issued-id-cards',
				sheetName: 'ID cards',
				columns: [
					{ key: 'card_number', label: 'Card number' },
					{ key: 'student_name', label: 'Student name' },
					{ key: 'enrollment_number', label: 'Enrollment number' },
					{ key: 'course_name', label: 'Course' },
					{ key: 'branch_name', label: 'Branch' },
					{ key: 'academic_year', label: 'Academic year' },
					{ key: 'status', label: 'Status' },
					{ key: 'expires_on', label: 'Expires on' },
					{ key: 'created_at', label: 'Issued at' },
				],
				rows: cards,
			});
		} catch (error) {
			setMessage(getErrorMessage(error));
		}
	}

	useEffect(() => {
		let cancelled = false;
		async function preparePreview() {
			setQrCode('');
			setPhotoUrl('');
			if (!selectedCard) return;
			try {
				const { default: QRCode } = await import('qrcode');
				const qr = await QRCode.toDataURL(selectedCard.card_number, {
					margin: 1,
					width: 170,
					errorCorrectionLevel: 'M',
				});
				if (!cancelled) setQrCode(qr);
				if (selectedCard.photo_path) {
					const { data, error } = await supabase.storage
						.from('student-documents')
						.createSignedUrl(selectedCard.photo_path, 60);
					if (error) throw error;
					if (!cancelled) setPhotoUrl(data.signedUrl);
				}
			} catch (error) {
				if (!cancelled) setMessage(getErrorMessage(error));
			}
		}
		void preparePreview();
		return () => {
			cancelled = true;
		};
	}, [selectedCard]);

	function selectApplication(applicationId) {
		const application = applications.find((item) => item.id === applicationId);
		const answers = application?.answers ?? {};
		setForm({
			...emptyForm,
			application_id: applicationId,
			student_name: answers.full_name || answers.name || '',
		});
	}

	async function issueCard(event) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setMessage('');
		try {
			const args = Object.fromEntries(
				Object.entries(form).map(([key, value]) => [`p_${key}`, value || null]),
			);
			const { error } = await supabase.rpc('issue_id_card', args);
			if (error) throw error;
			setMessage('ID card issued successfully.');
			setForm(emptyForm);
			await load();
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function cardAction(action) {
		if (!selectedCard || busy) return;
		if (
			action === 'revoke' &&
			!window.confirm('Revoke this ID card? This cannot be undone.')
		)
			return;
		setBusy(true);
		setMessage('');
		try {
			const rpc =
				action === 'reprint' ? 'log_id_card_reprint' : 'revoke_id_card';
			const { error } = await supabase.rpc(rpc, {
				p_card_id: selectedCard.id,
			});
			if (error) throw error;
			setMessage(
				action === 'reprint'
					? 'Reprint recorded. Use Print Card to print.'
					: 'Card revoked.',
			);
			if (action === 'revoke')
				setSelectedCard({ ...selectedCard, status: 'revoked' });
			await load();
		} catch (error) {
			setMessage(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="id-layout">
			<section className="panel">
				<h2>Smart ID Card Studio</h2>
				<p>
					Issue cards only for approved admissions. Card numbers and QR codes
					contain no personal data.
				</p>
				<form className="editgrid" onSubmit={issueCard}>
					<label>
						Approved application
						<select
							required
							value={form.application_id}
							onChange={(event) => selectApplication(event.target.value)}
						>
							<option value="">Select application</option>
							{applications.map((application) => (
								<option key={application.id} value={application.id}>
									{application.application_number}
								</option>
							))}
						</select>
					</label>
					{[
						['student_name', 'Student name'],
						['enrollment_number', 'Enrollment number'],
						['course_name', 'Course'],
						['branch_name', 'Branch'],
						['academic_year', 'Academic year'],
					].map(([key, label]) => (
						<label key={key}>
							{label}
							<input
								required
								value={form[key]}
								onChange={(event) =>
									setForm({ ...form, [key]: event.target.value })
								}
							/>
						</label>
					))}
					<label>
						Expiry date
						<input
							required
							type="date"
							min={new Date().toISOString().slice(0, 10)}
							value={form.expires_on}
							onChange={(event) =>
								setForm({ ...form, expires_on: event.target.value })
							}
						/>
					</label>
					<label>
						Private photo storage path (optional)
						<input
							value={form.photo_path}
							placeholder="student-uuid/photo.jpg"
							onChange={(event) =>
								setForm({ ...form, photo_path: event.target.value })
							}
						/>
					</label>
					<div className="actions">
						<button className="primary" disabled={busy}>
							{busy ? 'Issuing...' : 'Issue Smart ID Card'}
						</button>
					</div>
				</form>
				{message && (
					<p className="dfb-message" role="status">
						{message}
					</p>
				)}
			</section>
			<section className="panel">
				<div className="panelhead">
					<h2>Issued ID Cards</h2>
					<button type="button" onClick={() => void exportCards()}>
						Export Excel
					</button>
				</div>
				{loading ? (
					<p>Loading cards...</p>
				) : (
					<div className="tablewrap">
						<table>
							<thead>
								<tr>
									<th>Card number</th>
									<th>Student</th>
									<th>Enrollment</th>
									<th>Status</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody>
								{cards.map((card) => (
									<tr key={card.id}>
										<td>{card.card_number}</td>
										<td>{card.student_name}</td>
										<td>{card.enrollment_number}</td>
										<td>{card.status}</td>
										<td>
											<button
												type="button"
												onClick={() => setSelectedCard(card)}
											>
												Preview
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{!cards.length && (
							<div className="empty">No ID cards have been issued.</div>
						)}
					</div>
				)}
			</section>
			{selectedCard && (
				<section className="panel">
					<div className="panelhead">
						<h2>Print preview</h2>
						<div className="actions">
							<button
								type="button"
								disabled={busy || selectedCard.status !== 'active'}
								onClick={() => void cardAction('reprint')}
							>
								Log reprint
							</button>
							<button
								type="button"
								className="primary"
								onClick={() => window.print()}
							>
								Print card
							</button>
							<button
								type="button"
								className="danger"
								disabled={busy || selectedCard.status !== 'active'}
								onClick={() => void cardAction('revoke')}
							>
								Revoke
							</button>
						</div>
					</div>
					<div className="id-print-area">
						<article className="svit-card">
							<div className="card-top">
								<div className="id-logo">S</div>
								<div>
									<strong>SVIT</strong>
									<small>STUDENT IDENTITY CARD</small>
								</div>
							</div>
							<div className="card-body">
								<div className="student-photo">
									{photoUrl ? (
										<img src={photoUrl} alt="Student" />
									) : (
										<span>PHOTO</span>
									)}
								</div>
								<div>
									<h3>{selectedCard.student_name}</h3>
									<p>
										<b>Enrollment:</b> {selectedCard.enrollment_number}
									</p>
									<p>
										<b>Course:</b> {selectedCard.course_name}
									</p>
									<p>
										<b>Branch:</b> {selectedCard.branch_name}
									</p>
									<p>
										<b>Academic year:</b> {selectedCard.academic_year}
									</p>
								</div>
							</div>
							<div className="card-bottom">
								<div>
									<b>{selectedCard.card_number}</b>
									<small>Valid until {selectedCard.expires_on}</small>
									<small>Status: {selectedCard.status}</small>
								</div>
								{qrCode && (
									<img src={qrCode} alt="QR containing opaque card number" />
								)}
							</div>
						</article>
					</div>
					<p className="hint">
						The QR contains only an opaque card number, not personal data. Photo
						links expire after 60 seconds. Print promptly.
					</p>
				</section>
			)}
		</div>
	);
}
