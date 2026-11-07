import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

const API_BASE =
	import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';

const emptyFaq = {
	question: '',
	answer: '',
	category: 'admission',
	department: '',
	language: 'gu',
	enabled: true,
	display_order: 0,
};

export default function ChatbotFaqManager() {
	const [colleges, setColleges] = useState([]);
	const [collegeId, setCollegeId] = useState('');
	const [faqs, setFaqs] = useState([]);
	const [form, setForm] = useState(emptyFaq);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [isError, setIsError] = useState(false);

	const adminRequest = useCallback(async (path, options = {}) => {
		const {
			data: { session },
			error: sessionError,
		} = await supabase.auth.getSession();
		if (sessionError) throw sessionError;
		if (!session?.access_token) throw new Error('Sign in again to manage chatbot FAQs.');

		const response = await fetch(`${API_BASE}${path}`, {
			...options,
			headers: {
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
				Authorization: `Bearer ${session.access_token}`,
				...options.headers,
			},
		});
		const body = await response.text();
		let result;
		try {
			result = JSON.parse(body);
		} catch (error) {
			if (!(error instanceof SyntaxError)) throw error;
			const responseDetail = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
			throw new Error(
				body.trim()
					? `FAQ API returned invalid JSON (${responseDetail}).`
					: `FAQ API returned an empty response (${responseDetail}). Restart or redeploy the Express API with the latest server code, and make sure ${response.url} is routed to it.`,
			);
		}
		if (!response.ok) {
			throw new Error(result?.error || `Request failed (${response.status}).`);
		}
		return result;
	}, []);

	const loadFaqs = useCallback(async () => {
		if (!collegeId) {
			setFaqs([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const result = await adminRequest(
				`/admin/admission/faqs?college_id=${encodeURIComponent(collegeId)}`,
			);
			setFaqs(result.faqs ?? []);
			setMessage('');
			setIsError(false);
		} catch (error) {
			setMessage(error.message || 'Could not load chatbot FAQs.');
			setIsError(true);
		} finally {
			setLoading(false);
		}
	}, [adminRequest, collegeId]);

	useEffect(() => {
		let cancelled = false;
		const loadColleges = async () => {
			const { data, error } = await supabase
				.from('colleges')
				.select('id,name')
				.eq('active', true)
				.order('name');
			if (cancelled) return;
			if (error) {
				setMessage(`Could not load colleges: ${error.message}`);
				setIsError(true);
			} else {
				const available = data ?? [];
				setColleges(available);
				if (available.length) setCollegeId(available[0].id);
			}
			setLoading(false);
		};
		void loadColleges();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		void loadFaqs();
	}, [loadFaqs]);

	async function saveFaq(event) {
		event.preventDefault();
		if (!collegeId || busy) return;
		setBusy(true);
		setMessage('');
		try {
			await adminRequest('/admin/admission/faqs', {
				method: 'POST',
				body: JSON.stringify({ ...form, college_id: collegeId }),
			});
			setForm(emptyFaq);
			await loadFaqs();
			setMessage('FAQ added.');
			setIsError(false);
		} catch (error) {
			setMessage(error.message || 'Could not add chatbot FAQ.');
			setIsError(true);
		} finally {
			setBusy(false);
		}
	}

	async function deleteFaq(faq) {
		if (!window.confirm(`Delete “${faq.question}”?`)) return;
		setBusy(true);
		setMessage('');
		try {
			await adminRequest(
				`/admin/admission/faqs/${encodeURIComponent(faq.id)}?college_id=${encodeURIComponent(collegeId)}`,
				{ method: 'DELETE' },
			);
			setFaqs((current) => current.filter((entry) => entry.id !== faq.id));
			setMessage('FAQ deleted.');
			setIsError(false);
		} catch (error) {
			setMessage(error.message || 'Could not delete chatbot FAQ.');
			setIsError(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="panel">
			<div className="panelhead">
				<div>
					<h2>Admission Chatbot FAQs</h2>
					<p>Add questions and answers shown in the public admission chatbot.</p>
				</div>
			</div>
			{message && (
				<p className={isError ? 'error' : 'success'} role={isError ? 'alert' : 'status'}>
					{message}
				</p>
			)}
			<label>
				College
				<select
					value={collegeId}
					onChange={(event) => setCollegeId(event.target.value)}
					disabled={!colleges.length}
				>
					{colleges.map((college) => (
						<option key={college.id} value={college.id}>
							{college.name}
						</option>
					))}
				</select>
			</label>
			{!colleges.length && !loading && <p>No active colleges are available.</p>}

			<form onSubmit={saveFaq}>
				<h3>Add FAQ</h3>
				<div className="editgrid">
					<label>
						Question
						<input
							required
							maxLength={500}
							value={form.question}
							onChange={(event) =>
								setForm((current) => ({ ...current, question: event.target.value }))
							}
						/>
					</label>
					<label>
						Answer
						<textarea
							required
							maxLength={5000}
							rows={4}
							value={form.answer}
							onChange={(event) =>
								setForm((current) => ({ ...current, answer: event.target.value }))
							}
						/>
					</label>
					<label>
						Category
						<input
							maxLength={80}
							value={form.category}
							onChange={(event) =>
								setForm((current) => ({ ...current, category: event.target.value }))
							}
						/>
					</label>
					<label>
						Department (optional)
						<input
							maxLength={120}
							value={form.department}
							onChange={(event) =>
								setForm((current) => ({ ...current, department: event.target.value }))
							}
						/>
					</label>
					<label>
						Language
						<select
							value={form.language}
							onChange={(event) =>
								setForm((current) => ({ ...current, language: event.target.value }))
							}
						>
							<option value="gu">Gujarati</option>
							<option value="en">English</option>
							<option value="hi">Hindi</option>
						</select>
					</label>
					<label>
						Display order
						<input
							type="number"
							step="1"
							value={form.display_order}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									display_order: Number(event.target.value),
								}))
							}
						/>
					</label>
					<label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<input
							type="checkbox"
							checked={form.enabled}
							onChange={(event) =>
								setForm((current) => ({ ...current, enabled: event.target.checked }))
							}
						/>
						Published in chatbot
					</label>
				</div>
				<button className="primary" type="submit" disabled={!collegeId || busy}>
					{busy ? 'Saving…' : 'Add FAQ'}
				</button>
			</form>

			<h3>Existing FAQs</h3>
			{loading ? (
				<p>Loading FAQs…</p>
			) : faqs.length ? (
				<div className="tablewrap">
					<table>
						<thead>
							<tr>
								<th>Question / Answer</th>
								<th>Language</th>
								<th>Category</th>
								<th>Order</th>
								<th>Status</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{faqs.map((faq) => (
								<tr key={faq.id}>
									<td>
										<strong>{faq.question}</strong>
										<div>{faq.answer}</div>
									</td>
									<td>{faq.language}</td>
									<td>{faq.category}</td>
									<td>{faq.display_order}</td>
									<td>{faq.enabled ? 'Published' : 'Draft'}</td>
									<td>
										<button type="button" disabled={busy} onClick={() => void deleteFaq(faq)}>
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p>No FAQs have been added for this college yet.</p>
			)}
		</section>
	);
}
