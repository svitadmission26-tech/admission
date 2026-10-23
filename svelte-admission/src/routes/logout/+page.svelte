<script lang="ts">
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { goto } from '$app/navigation';

    onMount(async () => {
        // Ensure client-side session is cleared to prevent "zombie" sessions
        await supabase.auth.signOut();
        // Redirect to home/landing page
        goto('/', { replaceState: true });
    });
</script>

<div class="d-flex justify-content-center align-items-center vh-100">
    <div class="text-center">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Logging out...</span>
        </div>
        <p class="mt-3">Logging out...</p>
    </div>
</div>