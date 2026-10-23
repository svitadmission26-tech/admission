<script lang="ts">
    interface Props {
        title?: string;
        children?: import('svelte').Snippet;
    }

    let { title = "Help", children }: Props = $props();
</script>

<div class="container mt-4 mb-5">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="display-6 m-0">{title}</h1>
        <button class="btn btn-outline-secondary" onclick={() => history.back()}>
            <i class="bi bi-arrow-left me-2"></i>Back
        </button>
    </div>
    
    <div class="card shadow-sm">
        <div class="card-body p-4 article-content">
            {@render children?.()}
        </div>
    </div>
</div>

<style>
    /* Add some typography improvements for long text */
    :global(.article-content h2) {
        margin-top: 2rem;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #eee;
        color: #333;
    }
    
    :global(.article-content h3) {
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        color: #555;
    }
    
    :global(.article-content p) {
        margin-bottom: 1rem;
        line-height: 1.6;
        color: #444;
    }
    
    :global(.article-content ul, .article-content ol) {
        margin-bottom: 1rem;
        padding-left: 1.5rem;
    }
    
    :global(.article-content li) {
        margin-bottom: 0.5rem;
    }
    
    :global(.article-content strong) {
        color: #222;
    }
</style>
