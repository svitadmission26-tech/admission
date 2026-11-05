<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { supabase } from '$lib/supabase';

	let password = $state('');
	let confirmPassword = $state('');
	let sessionReady = $state(false);
	let sessionAvailable = $state(false);
	let saving = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	onMount(async () => {
		const { data, error } = await supabase.auth.getSession();
		sessionAvailable = !error && Boolean(data.session);
		sessionReady = true;
		if (page.url.searchParams.has('expired')) {
			errorMessage = 'This reset link has expired or was already used. Request a new one from the login page.';
		}
	});

	async function updatePassword(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		successMessage = '';

		if (password.length < 6) {
			errorMessage = 'Choose a password with at least 6 characters.';
			return;
		}
		if (password !== confirmPassword) {
			errorMessage = 'The passwords do not match.';
			return;
		}

		saving = true;
		try {
			const { error } = await supabase.auth.updateUser({ password });
			if (error) {
				errorMessage = error.message || 'Unable to update your password. Request a new reset link.';
				return;
			}
			successMessage = 'Your password has been updated. Redirecting to sign in...';
			await supabase.auth.signOut();
			window.setTimeout(() => goto('/login'), 900);
		} catch {
			errorMessage = 'Unable to update your password. Check your connection and try again.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Reset password | SVIT Admission</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="reset-page">
	<section class="reset-card" aria-labelledby="reset-title">
		<div class="reset-mark" aria-hidden="true">S</div>
		<p class="eyebrow">STUDENT ACCOUNT</p>
		<h1 id="reset-title">Choose a new password</h1>
		<p class="intro">Use a password you have not used for this account before.</p>

		{#if errorMessage}<div class="notice error" role="alert">{errorMessage}</div>{/if}
		{#if successMessage}<div class="notice success" role="status">{successMessage}</div>{/if}

		{#if !sessionReady}
			<p class="loading">Checking your reset link...</p>
		{:else if sessionAvailable}
			<form onsubmit={updatePassword}>
				<label for="new-password">New password</label>
				<input id="new-password" type="password" bind:value={password} required minlength="6" autocomplete="new-password" />
				<label for="confirm-password">Confirm new password</label>
				<input id="confirm-password" type="password" bind:value={confirmPassword} required minlength="6" autocomplete="new-password" />
				<button type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update password'}</button>
			</form>
		{:else}
			<p class="expired-copy">Open the reset link from your email, or request a new one.</p>
		{/if}

		<a class="back-link" href="/login">Back to login</a>
	</section>
</main>

<style>
	.reset-page { min-height: calc(100vh - 60px); display: grid; place-items: center; padding: 24px; background: radial-gradient(ellipse at 18% 12%, #e8f1e9 0, transparent 34%), radial-gradient(ellipse at 85% 84%, #f6e8df 0, transparent 31%), #f5f6f2; }
	.reset-card { width: min(100%, 410px); padding: 34px; border: 1px solid #e1e6df; border-radius: 10px; background: rgba(255,255,255,.94); box-shadow: 0 18px 56px #26392b12; }
	.reset-mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 9px; background: #276b51; color: white; font: 800 17px 'Manrope', sans-serif; }
	.eyebrow { margin: 22px 0 7px; color: #63806b; font: 500 10px 'DM Mono', monospace; }
	h1 { margin: 0; color: #27322a; font: 700 22px 'Manrope', sans-serif; }
	.intro, .expired-copy { margin: 8px 0 22px; color: #778078; font-size: 13px; line-height: 1.55; }
	form { display: grid; gap: 9px; }
	label { margin-top: 5px; color: #4a554c; font-size: 12px; font-weight: 600; }
	input { width: 100%; min-height: 40px; padding: 9px 11px; border: 1px solid #dfe5dd; border-radius: 5px; color: #27322a; font: inherit; }
	input:focus { outline: 2px solid #7aac89; outline-offset: 1px; border-color: #7aac89; }
	button { min-height: 41px; margin-top: 9px; border: 0; border-radius: 5px; background: #276b51; color: white; font: 600 12px 'DM Sans', sans-serif; cursor: pointer; }
	button:disabled { opacity: .6; cursor: wait; }
	.notice { margin: 18px 0; padding: 10px 12px; border-radius: 5px; font-size: 12px; line-height: 1.5; }
	.notice.error { border: 1px solid #f0d2cc; background: #fff5f2; color: #9c493a; }
	.notice.success { border: 1px solid #cfe2d2; background: #f1f8f2; color: #326b48; }
	.loading { margin: 24px 0; color: #778078; font-size: 12px; }
	.back-link { display: inline-block; margin-top: 20px; color: #286d50; font-size: 12px; text-decoration: none; }
	.back-link:hover { text-decoration: underline; }
	@media (max-width: 480px) { .reset-card { padding: 26px 21px; } }
</style>