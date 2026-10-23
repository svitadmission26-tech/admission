<script lang="ts"> 
    import { supabase } from '$lib/supabase'; 
    import { PUBLIC_APP_URL, PUBLIC_SUPABASE_URL } from '$env/static/public';
    import CrystalAnimation from '$lib/components/CrystalAnimation.svelte';

    // DEBUG: Check Supabase Configuration
    console.log('Login Page Debug:');
    console.log('Supabase URL:', PUBLIC_SUPABASE_URL);
    console.log('Supabase Client:', supabase);

    let email = '';
    let password = '';
    let errorMessage = '';
    let loading = false;

    async function signInWithEmail() {
        loading = true;
        errorMessage = '';
        
        console.log('Attempting login with:', email);

        try {
            const { data: authData, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('Error signing in:', error);
                errorMessage = error.message || 'Failed to sign in. Check console for details.';
                loading = false;
                return;
            }

            console.log('Login successful:', authData);

            if (authData.user) {
                window.location.href = '/';
            } 
        } catch (err) {
            console.error('Unexpected error during login:', err);
            errorMessage = 'An unexpected error occurred. Please check your network connection.';
        } finally {
            loading = false;
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
            console.error('Error signing in with Google:', error.message);
            alert('Error signing in with Google: ' + error.message);
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

            <form on:submit|preventDefault={signInWithEmail}>
                <div class="mb-3">
                    <label for="email" class="form-label text-dark">Email address</label>
                    <input type="email" class="form-control" id="email" bind:value={email} required placeholder="name@example.com">
                </div>
                <div class="mb-3">
                    <label for="password" class="form-label text-dark">Password</label>
                    <input type="password" class="form-control" id="password" bind:value={password} required placeholder="********">
                </div>
                <button type="submit" class="btn btn-primary w-100 fw-bold" disabled={loading}>
                    {loading ? 'Signing In...' : 'Sign In'}
                </button>
            </form>

            <div class="mt-3 text-center">
                <div class="d-flex align-items-center my-3">
                    <hr class="flex-grow-1 border-dark">
                    <span class="px-2 text-dark small">OR</span>
                    <hr class="flex-grow-1 border-dark">
                </div>
                <button type="button" class="btn btn-light border w-100 fw-bold" on:click={signInWithGoogle}>
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
