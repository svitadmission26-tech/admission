<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    function changePage(newPage: number) {
        const url = new URL($page.url);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    $: totalPages = Math.ceil((data.count || 0) / (data.limit || 10));
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Circulars & Notices</h1>
        <span class="text-muted">Updates from University</span>
    </div>

    <div class="card shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle">
                    <thead class="bg-light">
                        <tr>
                            <th>Title</th>
                            <th>Description</th>
                            <th>Scope</th>
                            <th>Date</th>
                            <th>Attachment</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if !data.circulars || data.circulars.length === 0}
                            <tr>
                                <td colspan="5" class="text-center py-5 text-muted">
                                    No active circulars.
                                </td>
                            </tr>
                        {:else}
                            {#each data.circulars as circular}
                                <tr>
                                    <td class="fw-bold">{circular.title}</td>
                                    <td>
                                        <div class="text-muted text-truncate" style="max-width: 400px;">
                                            {circular.description || '-'}
                                        </div>
                                    </td>
                                    <td>
                                        {#if circular.courses}
                                            <span class="badge bg-info text-dark">{circular.courses.code}</span>
                                        {:else}
                                            <span class="badge bg-secondary">Global</span>
                                        {/if}
                                    </td>
                                    <td>{new Date(circular.created_at).toLocaleDateString()}</td>
                                    <td>
                                        {#if circular.signedUrl}
                                            <a href={circular.signedUrl} target="_blank" class="btn btn-sm btn-outline-primary">
                                                <i class="bi bi-download me-1"></i> Download
                                            </a>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        {/if}
                    </tbody>
                </table>
            </div>
            
            <!-- Pagination -->
            {#if totalPages > 1}
                <div class="d-flex justify-content-center py-3 border-top">
                    <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                    <span class="align-self-center">Page {data.page} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
                </div>
            {/if}
        </div>
    </div>
</div>
