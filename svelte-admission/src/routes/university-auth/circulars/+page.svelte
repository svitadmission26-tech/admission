<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { invalidateAll, goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    let showCreateModal = false;
    let isSubmitting = false;

    function changePage(newPage: number) {
        const url = new URL($page.url);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    $: totalPages = Math.ceil((data.count || 0) / (data.limit || 10));
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>University Circulars</h1>
        <button class="btn btn-primary" on:click={() => showCreateModal = true}>
            <i class="bi bi-plus-lg me-2"></i>Publish New Circular
        </button>
    </div>

    <!-- List View -->
    <div class="card shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle">
                    <thead class="bg-light">
                        <tr>
                            <th>Title</th>
                            <th>Target Course</th>
                            <th>Status</th>
                            <th>Attachment</th>
                            <th>Created At</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if data.circulars.length === 0}
                            <tr>
                                <td colspan="6" class="text-center py-5 text-muted">
                                    No circulars found. Create one to get started.
                                </td>
                            </tr>
                        {:else}
                            {#each data.circulars as circular (circular.id)}
                                <tr>
                                    <td>
                                        <div class="fw-bold">{circular.title}</div>
                                        {#if circular.description}
                                            <small class="text-muted d-block text-truncate" style="max-width: 300px;">
                                                {circular.description}
                                            </small>
                                        {/if}
                                    </td>
                                    <td>
                                        {#if circular.courses}
                                            <span class="badge bg-info text-dark">{circular.courses.code}</span>
                                        {:else}
                                            <span class="badge bg-secondary">All Courses</span>
                                        {/if}
                                    </td>
                                    <td>
                                        <form method="POST" action="?/toggleStatus" use:enhance>
                                            <input type="hidden" name="id" value={circular.id}>
                                            <input type="hidden" name="current_status" value={circular.is_active}>
                                            <button class="btn btn-sm badge {circular.is_active ? 'bg-success' : 'bg-warning text-dark'} border-0" style="cursor: pointer;">
                                                {circular.is_active ? 'Active' : 'Hidden'}
                                            </button>
                                        </form>
                                    </td>
                                    <td>
                                        {#if circular.signedUrl}
                                            <a href={circular.signedUrl} target="_blank" class="btn btn-sm btn-outline-secondary">
                                                <i class="bi bi-file-earmark-arrow-down me-1"></i> View
                                            </a>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td>
                                        {new Date(circular.created_at).toLocaleDateString()}
                                    </td>
                                    <td class="text-end">
                                        <form method="POST" action="?/delete" use:enhance={() => {
                                            return async ({ result }) => {
                                                if (result.type === 'success') await invalidateAll();
                                            };
                                        }} class="d-inline">
                                            <input type="hidden" name="id" value={circular.id}>
                                            <input type="hidden" name="file_path" value={circular.file_path || ''}>
                                            <button 
                                                class="btn btn-sm btn-outline-danger" 
                                                on:click={(e) => { if (!confirm('Are you sure you want to delete this circular?')) e.preventDefault(); }}
                                            >
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </form>
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

<!-- Create Modal -->
{#if showCreateModal}
<div class="modal show d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <form method="POST" action="?/create" enctype="multipart/form-data" use:enhance={() => {
                isSubmitting = true;
                return async ({ result }) => {
                    isSubmitting = false;
                    if (result.type === 'success') {
                        showCreateModal = false;
                        await invalidateAll();
                    }
                };
            }}>
                <div class="modal-header">
                    <h5 class="modal-title">Publish Circular</h5>
                    <button type="button" class="btn-close" on:click={() => showCreateModal = false}></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="title" class="form-label">Title <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="title" name="title" required>
                    </div>

                    <div class="mb-3">
                        <label for="description" class="form-label">Description</label>
                        <textarea class="form-control" id="description" name="description" rows="3"></textarea>
                    </div>

                    <div class="mb-3">
                        <label for="course" class="form-label">Target Course (Optional)</label>
                        <select class="form-select" id="course" name="course_id">
                            <option value="">All Courses in University</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name} ({course.code})</option>
                            {/each}
                        </select>
                        <div class="form-text">Limit visibility to specific course students/colleges.</div>
                    </div>

                    <div class="mb-3">
                        <label for="file" class="form-label">Attachment (PDF/Image)</label>
                        <input type="file" class="form-control" id="file" name="file" accept=".pdf,.jpg,.jpeg,.png">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showCreateModal = false} disabled={isSubmitting}>Cancel</button>
                    <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
                        {#if isSubmitting}
                            <span class="spinner-border spinner-border-sm me-2"></span>Publishing...
                        {:else}
                            Publish
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}
