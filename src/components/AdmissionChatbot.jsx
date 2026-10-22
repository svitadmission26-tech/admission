import React, { useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export default function AdmissionChatbot() {
	const college = import.meta.env.VITE_PUBLIC_COLLEGE_ID;
	const [open, setOpen] = useState(false);
	const [faqs, setFaqs] = useState([]);
	const [selected, setSelected] = useState(null);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!open || !college) return;
		let active = true;
		fetch(`${API}/api/admission/faqs?college_id=${encodeURIComponent(college)}&language=gu`)
			.then((r) => {
				if (!r.ok) throw Error('FAQs unavailable');
				return r.json();
			})
			.then((d) => {
				if (active) setFaqs(d.faqs || []);
			})
			.catch(() => {
				if (active) setError('Questions could not be loaded.');
			});
		return () => {
			active = false;
		};
	}, [open, college]);

	return (
		<div
			style={{
				position: 'fixed',
				bottom: 20,
				right: 20,
				zIndex: 1000,
				maxWidth: 'min(380px, calc(100vw - 30px))',
			}}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				style={{
					background: '#1459b5',
					color: '#fff',
					border: 0,
					borderRadius: 999,
					padding: '10px 16px',
					fontWeight: 700,
					cursor: 'pointer',
					boxShadow: '0 4px 12px #0003',
				}}
			>
				💬 Admission Help {open ? '×' : ''}
			</button>
			{open && (
				<div
					style={{
						background: 'white',
						color: '#17202a',
						padding: 16,
						border: '1px solid #ddd',
						borderRadius: 12,
						boxShadow: '0 4px 20px #0002',
						maxHeight: '65vh',
						overflow: 'auto',
						marginTop: 8,
					}}
				>
					<h3>Admission Help Desk</h3>
					<p>તમને શું જાણવું છે?</p>
					{!college ? (
						<p>College chatbot configuration pending.</p>
					) : error ? (
						<p role="alert">{error}</p>
					) : faqs.length === 0 ? (
						<p>No questions published yet.</p>
					) : (
						faqs.map((f) => (
							<div key={f.id} style={{ marginBottom: 8 }}>
								<button
									type="button"
									onClick={() =>
										setSelected(selected === f.id ? null : f.id)
									}
									style={{
										width: '100%',
										textAlign: 'left',
										background: '#f5f9ff',
										border: '1px solid #d9e3ee',
										borderRadius: 8,
										padding: 8,
										cursor: 'pointer',
									}}
								>
									{f.question}
								</button>
								{selected === f.id && (
									<p
										style={{
											whiteSpace: 'pre-wrap',
											margin: '8px 0 0',
											lineHeight: 1.5,
										}}
									>
										{f.answer}
									</p>
								)}
							</div>
						))
					)}
					<a
						href="#inquiry-form"
						onClick={() => setOpen(false)}
						style={{ display: 'inline-block', marginTop: 8, color: '#1459b5' }}
					>
						Fill inquiry form
					</a>
				</div>
			)}
		</div>
	);
}
