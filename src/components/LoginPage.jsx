import React, { useEffect, useMemo, useState } from 'react';

export const LOGIN_REMEMBER_KEY = 'svit-login-remember';
const STUDENT_MODULE_ID = 'student';

function readRememberedLogin() {
	try {
		const raw = window.localStorage.getItem(LOGIN_REMEMBER_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

export function clearRememberedLogin() {
	try {
		window.localStorage.removeItem(LOGIN_REMEMBER_KEY);
	} catch {
		/* storage is not available, remembering is simply skipped */
	}
}

function rememberLogin(identifier, moduleId) {
	try {
		window.localStorage.setItem(
			LOGIN_REMEMBER_KEY,
			JSON.stringify({ identifier, moduleId }),
		);
	} catch {
		/* storage is not available, remembering is simply skipped */
	}
}

export default function LoginPage({
	modules = [],
	branding = null,
	selectedModuleId = '',
	onSelectModule,
	error = '',
	notice = '',
	warning = '',
	busy = false,
	signup = false,
	onToggleSignup,
	onLogin,
	onSignup,
	onForgotPassword,
	onResetPassword,
	recoveryMode = false,
	onBack,
}) {
	const [identifier, setIdentifier] = useState('');
	const [password, setPassword] = useState('');
	const [fullName, setFullName] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [remember, setRemember] = useState(false);
	const [mode, setMode] = useState('signin');
	const [localError, setLocalError] = useState('');

	const activeModule = useMemo(
		() => modules.find((item) => item.id === selectedModuleId) ?? null,
		[modules, selectedModuleId],
	);
	const isStudentModule = activeModule?.id === STUDENT_MODULE_ID;

	useEffect(() => {
		if (recoveryMode) setMode('reset');
	}, [recoveryMode]);

	// Restore the remembered user id and login module.
	useEffect(() => {
		const remembered = readRememberedLogin();
		if (!remembered) return;
		if (remembered.identifier) setIdentifier(remembered.identifier);
		if (remembered.moduleId) {
			const exists = modules.some((item) => item.id === remembered.moduleId);
			if (exists) onSelectModule?.(remembered.moduleId);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [modules]);

	function switchMode(nextMode) {
		setMode(nextMode);
		setLocalError('');
	}

	async function handleSignIn(event) {
		event.preventDefault();
		setLocalError('');
		if (!selectedModuleId) {
			setLocalError('Select a login module to continue.');
			return;
		}
		if (!identifier.trim()) {
			setLocalError('Enter your user id or email address.');
			return;
		}
		if (!password) {
			setLocalError('Enter your password.');
			return;
		}
		if (remember) rememberLogin(identifier.trim(), selectedModuleId);
		else clearRememberedLogin();
		await onLogin?.({
			moduleId: selectedModuleId,
			identifier: identifier.trim(),
			password,
		});
	}

	async function handleSignup(event) {
		event.preventDefault();
		setLocalError('');
		if (!fullName.trim()) {
			setLocalError('Enter your full name.');
			return;
		}
		if (!identifier.trim()) {
			setLocalError('Enter your email address.');
			return;
		}
		if (password.length < 8) {
			setLocalError('Use a password of at least 8 characters.');
			return;
		}
		await onSignup?.({
			fullName: fullName.trim(),
			email: identifier.trim(),
			password,
		});
	}

	async function handleForgotPassword(event) {
		event.preventDefault();
		setLocalError('');
		if (!identifier.trim()) {
			setLocalError('Enter the email address registered for your account.');
			return;
		}
		await onForgotPassword?.({ identifier: identifier.trim() });
	}

	async function handleResetPassword(event) {
		event.preventDefault();
		setLocalError('');
		if (password.length < 8) {
			setLocalError('Use a password of at least 8 characters.');
			return;
		}
		const saved = await onResetPassword?.({ password });
		if (saved) {
			setPassword('');
			switchMode('signin');
		}
	}

	const collegeName = branding?.name || 'SVIT';
	const collegeLogo = branding?.logo_url || '';
	const collegePhotos = Array.isArray(branding?.photos)
		? branding.photos.filter(Boolean)
		: [];
	const [photoIndex, setPhotoIndex] = useState(0);

	useEffect(() => {
		if (collegePhotos.length <= 1) return undefined;
		const timer = window.setInterval(() => {
			setPhotoIndex((current) => (current + 1) % collegePhotos.length);
		}, 3200);
		return () => window.clearInterval(timer);
	}, [collegePhotos.length]);

	useEffect(() => {
		if (photoIndex >= collegePhotos.length) setPhotoIndex(0);
	}, [photoIndex, collegePhotos.length]);

	return (
		<div className="authwrap">
			<div className="authbrand">
				{collegeLogo ? (
					<img className="auth-logo" src={collegeLogo} alt={`${collegeName} logo`} />
				) : (
					<div className="logo">S</div>
				)}
				<p className="module-eyebrow">SVIT ERP · DYNAMIC LOGIN</p>
				<h1>{collegeName}</h1>
				<p>
					Select your login module and sign in to continue to your
					workspace.
				</p>
				<div className="authart auth-photo-stage">
					{collegePhotos.length > 0 ? (
						<>
							<img
								className="auth-photo"
								src={collegePhotos[photoIndex]}
								alt={`${collegeName} photo ${photoIndex + 1}`}
							/>
							<div className="auth-photo-dots">
								{collegePhotos.map((_, index) => (
									<button
										key={index}
										type="button"
										className={index === photoIndex ? 'active' : ''}
										onClick={() => setPhotoIndex(index)}
										aria-label={`Show photo ${index + 1}`}
									>
										{index + 1}
									</button>
								))}
							</div>
						</>
					) : (
						activeModule
							? `${activeModule.name} login module`
							: 'SVIT ERP'
					)}
				</div>
			</div>
			{mode === 'reset' ? (
				<form className="authcard" onSubmit={handleResetPassword}>
					<h2>Set a new password</h2>
					<p>Choose a new password for your {collegeName} account.</p>
					<label>
						New password
						<div className="auth-password">
							<input
								type={showPassword ? 'text' : 'password'}
								minLength="8"
								required
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
							<button
								type="button"
								onClick={() => setShowPassword((current) => !current)}
							>
								{showPassword ? 'Hide' : 'Show'}
							</button>
						</div>
					</label>
					{localError && <div className="error">{localError}</div>}
					{error && <div className="error">{error}</div>}
					{notice && <div className="success">{notice}</div>}
					<button className="primary" disabled={busy}>
						{busy ? 'Saving...' : 'Update password'}
					</button>
					<button
						type="button"
						className="link"
						onClick={() => switchMode('signin')}
					>
						← Back to sign in
					</button>
				</form>
			) : mode === 'forgot' ? (
				<form className="authcard" onSubmit={handleForgotPassword}>
					<h2>Reset your password</h2>
					<p>
						Enter the email address registered with your account and we
						will send a reset link.
					</p>
					<label>
						User ID / Email
						<input
							type="text"
							required
							autoComplete="username"
							value={identifier}
							onChange={(event) => setIdentifier(event.target.value)}
						/>
					</label>
					{localError && <div className="error">{localError}</div>}
					{error && <div className="error">{error}</div>}
					{notice && <div className="success">{notice}</div>}
					<button className="primary" disabled={busy}>
						{busy ? 'Sending...' : 'Send reset link'}
					</button>
					<button
						type="button"
						className="link"
						onClick={() => switchMode('signin')}
					>
						← Back to sign in
					</button>
				</form>
			) : signup ? (
				<form className="authcard" onSubmit={handleSignup}>
					<h2>Student Registration</h2>
					<p>Create a student account to apply for admission.</p>
					<label>
						Full Name
						<input
							required
							minLength="2"
							autoComplete="name"
							value={fullName}
							onChange={(event) => setFullName(event.target.value)}
						/>
					</label>
					<label>
						Email
						<input
							type="email"
							required
							autoComplete="username"
							value={identifier}
							onChange={(event) => setIdentifier(event.target.value)}
						/>
					</label>
					<label>
						Password
						<div className="auth-password">
							<input
								type={showPassword ? 'text' : 'password'}
								minLength="8"
								required
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
							<button
								type="button"
								onClick={() => setShowPassword((current) => !current)}
							>
								{showPassword ? 'Hide' : 'Show'}
							</button>
						</div>
					</label>
					{localError && <div className="error">{localError}</div>}
					{error && <div className="error">{error}</div>}
					{notice && <div className="success">{notice}</div>}
					<button className="primary" disabled={busy}>
						{busy ? 'Creating...' : 'Create student account'}
					</button>
					<button
						type="button"
						className="link"
						onClick={() => {
							onToggleSignup?.();
							setLocalError('');
						}}
					>
						Already registered? Sign in
					</button>
					<button
						type="button"
						className="link"
						onClick={onBack}
					>
						← Choose another module
					</button>
				</form>
			) : (
				<form className="authcard" onSubmit={handleSignIn}>
					<h2>Welcome back</h2>
					<p>Sign in to continue to your workspace.</p>
					{warning && <div className="warning">{warning}</div>}
					<label>
						Select Login Module
						<select
							required
							value={selectedModuleId}
							onChange={(event) => onSelectModule?.(event.target.value)}
						>
							<option value="">Select a login module</option>
							{modules.map((item) => (
								<option key={item.id} value={item.id}>
									{item.icon ? `${item.icon} ` : ''}
									{item.name}
								</option>
							))}
						</select>
					</label>
					{activeModule?.description && (
						<p className="auth-hint">{activeModule.description}</p>
					)}
					<label>
						User ID / Email
						<input
							type="text"
							required
							autoComplete="username"
							value={identifier}
							onChange={(event) => setIdentifier(event.target.value)}
						/>
					</label>
					<label>
						Password
						<div className="auth-password">
							<input
								type={showPassword ? 'text' : 'password'}
								required
								autoComplete="current-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
							<button
								type="button"
								onClick={() => setShowPassword((current) => !current)}
							>
								{showPassword ? 'Hide' : 'Show'}
							</button>
						</div>
					</label>
					<div className="auth-inline">
						<label className="auth-checkbox">
							<input
								type="checkbox"
								checked={remember}
								onChange={(event) => {
									setRemember(event.target.checked);
									if (!event.target.checked) clearRememberedLogin();
								}}
							/>
							Remember me
						</label>
						<button
							type="button"
							className="link"
							onClick={() => switchMode('forgot')}
						>
							Forgot password?
						</button>
					</div>
					{localError && <div className="error">{localError}</div>}
					{error && <div className="error">{error}</div>}
					{notice && <div className="success">{notice}</div>}
					{!modules.length && (
						<div className="error">
							No login module is available right now. Contact the
							administrator.
						</div>
					)}
					<button className="primary" disabled={busy || !modules.length}>
						{busy ? 'Signing in...' : 'Sign In'}
					</button>
					{isStudentModule && (
						<button
							type="button"
							className="link"
							onClick={() => {
								onToggleSignup?.();
								setLocalError('');
							}}
						>
							New student? Register here
						</button>
					)}
					<button type="button" className="link" onClick={onBack}>
						← Choose another module
					</button>
					{isStudentModule && (
						<a className="link" href="#/inquiry">
							Ask about admission
						</a>
					)}
				</form>
			)}
		</div>
	);
}
