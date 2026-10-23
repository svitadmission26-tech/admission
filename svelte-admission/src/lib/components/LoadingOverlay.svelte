<script lang="ts">
    import { navigating } from '$app/stores';
    import { fade } from 'svelte/transition';
    import { isLoading } from '$lib/stores/loadingStore'; // Import the custom store
    
    // Combine SvelteKit's navigation state with our custom manual loading state
    $: showOverlay = $navigating || $isLoading;
</script>

{#if showOverlay}
    <div class="loading-overlay" transition:fade={{ duration: 200 }}>
        <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
            <span class="visually-hidden">Loading...</span>
        </div>
        <h5 class="mt-3 text-white text-shadow">Processing...</h5>
    </div>
{/if}

<style>
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent black */
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999; /* High z-index to sit on top of everything */
        backdrop-filter: blur(2px); /* Optional: slight blur for modern feel */
    }
    .text-shadow {
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
</style>