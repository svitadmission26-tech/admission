<script lang="ts">
    import { toastStore } from '../stores/toastStore';
    import { fade, fly } from 'svelte/transition';

    // Bootstrap colors
    const typeClasses = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        info: 'bg-info text-dark',
        warning: 'bg-warning text-dark'
    };
</script>

<div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 1090;">
    {#each $toastStore as toast (toast.id)}
        <div class="toast show align-items-center {typeClasses[toast.type]} border-0 mb-2" 
             role="alert" aria-live="assertive" aria-atomic="true"
             in:fly={{ y: -20, duration: 300 }} out:fade>
            <div class="d-flex">
                <div class="toast-body">
                    {toast.message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" 
                        on:click={() => toastStore.remove(toast.id)} aria-label="Close"></button>
            </div>
        </div>
    {/each}
</div>
