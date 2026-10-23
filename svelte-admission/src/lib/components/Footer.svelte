<script lang="ts">
    export let university: { footer_text?: string } | null;
</script>

<footer class="app-footer border-top bg-light text-center py-2">
    <small class="text-muted">
        {#if university && university.footer_text && !university.footer_text.includes('My University')}
            {university.footer_text}
        {:else}
            &copy; {new Date().getFullYear()} SVIT, Vasad. All Rights Reserved.
        {/if}
    </small>
</footer>

<style>
    .app-footer {
        flex-shrink: 0; /* Prevent footer from shrinking */
    }
</style>