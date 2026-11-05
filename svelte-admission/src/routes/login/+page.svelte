<script lang="ts"> 
    import { supabase } from '$lib/supabase'; 
    import { PUBLIC_APP_URL } from '$env/static/public';
    import CrystalAnimation from '$lib/components/CrystalAnimation.svelte';

    let email = '';
    let password = '';
    let errorMessage = '';
    let successMessage = '';
    let loading = false;
    let resetLoading = false;

    async function signInWithEmail(event: SubmitEvent) {
        event.preventDefault();
        loading = true;
        errorMessage = '';
        successMessage = '';

        try {
            const { data: authData, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password
            });

            if (error) {
                const message = error.message.toLowerCase();
                if (message.includes('invalid login credentials')) {
                    errorMessage = 'Email or password is incorrect. Check both, or use “Forgot password?” to reset it.';
                } else if (message.includes('email not confirmed')) {
                    errorMessage = 'Please verify your email address before signing in.';
                } else {
                    errorMessage = 'Unable to sign in. Please try again or contact your administrator.';
                }
                loading = false;
                return;
            }

            if (authData.user) {
                window.location.href = '/';
            } 
        } catch (err) {
            console.error('Unexpected error during login:', err);
            errorMessage = 'Unable to sign in. Check your connection and try again.';
        } finally {
            loading = false;
        }
    }

    async function sendPasswordReset() {
        errorMessage = '';
        successMessage = '';
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            errorMessage = 'Enter your email address first, then request a password reset.';
            return;
        }

        resetLoading = true;
        try {
            const redirectTo = new URL('/reset-password', window.location.origin).toString();
            const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
            if (error) {
                console.error('Password reset request failed:', error.code || error.status || 'unknown error');
                errorMessage = 'Unable to send a reset link right now. Please try again or contact your administrator.';
                return;
            }
            successMessage = 'If an account exists for this email, a password reset link will be sent.';
        } catch (err) {
            console.error('Unexpected error requesting password reset:', err);
            errorMessage = 'Unable to send a reset link. Check your connection and try again.';
        } finally {
            resetLoading = false;
        }
    }

    async function signInWithGoogle() {
        const redirectBase = PUBLIC_APP_URL || window.location.origin;
        
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${redirectBase}/auth/callback` 
            }
        });

        if (error) {
            console.error('Google sign-in failed:', error.code || error.status || 'unknown error');
            errorMessage = 'Unable to sign in with Google. Please try again or use email and password.';
        }
    }
</script>

<div class="login-page">
    <CrystalAnimation />
    <div class="overlay"></div>
    <div class="content container d-flex justify-content-center align-items-center">
        <div class="card shadow-lg p-4 border-0" style="max-width: 400px; width: 100%; background-color: #ffffff; border-radius: 1rem; border: 1px solid rgba(0,0,0,0.1);">
            <div class="text-center mb-4">
                <h2 class="fw-bold text-dark">Login</h2>
                <p class="text-dark small">Access your dashboard</p>
            </div>

            {#if errorMessage}
                <div class="alert alert-danger" role="alert">
                    {errorMessage}
                </div>
            {/if}
            {#if successMessage}
                <div class="alert alert-success" role="status">
                    {successMessage}
                </div>
            {/if}

            <form onsubmit={signInWithEmail}>
                <div class="mb-3">
                    <label for="email" class="form-label text-dark">Email address</label>
                    <input type="email" class="form-control" id="email" bind:value={email} required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="name@example.com">
                </div>
                <div class="mb-3">
                    <label for="password" class="form-label text-dark">Password</label>
                    <input type="password" class="form-control" id="password" bind:value={password} required autocomplete="current-password" placeholder="********">
                </div>
                <button type="submit" class="btn btn-primary w-100 fw-bold" disabled={loading}>
                    {loading ? 'Signing In...' : 'Sign In'}
                </button>
            </form>

            <div class="text-end mt-2">
                <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none" onclick={sendPasswordReset} disabled={resetLoading || loading}>
                    {resetLoading ? 'Sending reset link...' : 'Forgot password?'}
                </button>
            </div>

            <div class="mt-3 text-center">
                <div class="d-flex align-items-center my-3">
                    <hr class="flex-grow-1 border-dark">
                    <span class="px-2 text-dark small">OR</span>
                    <hr class="flex-grow-1 border-dark">
                </div>
                <button type="button" class="btn btn-light border w-100 fw-bold" onclick={signInWithGoogle}>
                    <i class="bi bi-google me-2 text-danger"></i> Sign in with Google
                </button>
            </div>

            <div class="mt-4 text-center">
                <p class="mb-0 text-dark">Don't have an account? <a href="/register" class="fw-bold link-primary">Register here</a></p>
            </div>
        </div>
    </div>
</div>

<style>
    .login-page {
        background-color: #1e2b4a;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        min-height: calc(100vh - 60px);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        z-index: 1;
    }

    .content {
        position: relative;
        z-index: 2;
        width: 100%;
        padding-top: 2rem;
        padding-bottom: 2rem;
    }
</style>
