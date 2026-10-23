<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    import { invalidateAll, goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    // Selection State
    let selectedAppIds = new Set<string>();
    let expandedAppId: string | null = null;
    let signingUrls = new Map<string, string>(); // Local cache for signed URLs
    let isSigning = new Map<string, boolean>(); // Loading state for signing

    // Filter and Search State
    let filterSearch = data.search || '';
    let filterCourseId = data.courseFilter || '';
    let filterStatus = data.statusFilter || 'submitted';
    let filterFormType = data.formTypeFilter || '';

    // Modals
    let selectedDocument: any = null;
    let showRejectModal = false;
    let rejectionReason = '';
    let previewDoc: any = null;

    async function fetchSignedUrl(doc: any) {
        if (signingUrls.has(doc.id)) return signingUrls.get(doc.id);
        
        isSigning.set(doc.id, true);
        isSigning = isSigning; // trigger reactivity

        try {
            const response = await fetch('/api/documents/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: doc.file_path })
            });
            const result = await response.json();
            if (result.signedUrl) {
                signingUrls.set(doc.id, result.signedUrl);
                signingUrls = signingUrls; // trigger reactivity
                return result.signedUrl;
            }
        } catch (err) {
            console.error('Failed to sign URL:', err);
            toastStore.error('Could not load document preview');
        } finally {
            isSigning.set(doc.id, false);
            isSigning = isSigning;
        }
    }

    function toggleExpand(appId: string) {
        if (expandedAppId === appId) {
            expandedAppId = null;
        } else {
            expandedAppId = appId;
            // Pre-fetch first few doc URLs when expanded
            const app = data.applications.find(a => a.id === appId);
            if (app?.documents) {
                app.documents.slice(0, 3).forEach(doc => fetchSignedUrl(doc));
            }
        }
    }

    function toggleSelectAll() {
        if (selectedAppIds.size === data.applications.length) {
            selectedAppIds.clear();
        } else {
            selectedAppIds = new Set(data.applications.map(a => a.id));
        }
        selectedAppIds = selectedAppIds;
    }

    function toggleSelect(appId: string) {
        if (selectedAppIds.has(appId)) {
            selectedAppIds.delete(appId);
        } else {
            selectedAppIds.add(appId);
        }
        selectedAppIds = selectedAppIds;
    }

    function openPreview(doc: any) {
        previewDoc = doc;
        if (!signingUrls.has(doc.id)) {
            fetchSignedUrl(doc);
        }
    }

    function openReject(doc: any) {
        selectedDocument = doc;
        rejectionReason = '';
        showRejectModal = true;
    }

    function applyFilters() {
        const query = new URLSearchParams($page.url.searchParams);
        if (filterSearch) query.set('search', filterSearch); else query.delete('search');
        if (filterCourseId) query.set('courseId', filterCourseId); else query.delete('courseId');
        if (filterStatus) query.set('status', filterStatus); else query.delete('status');
        query.set('formType', filterFormType); // Always set to distinguish from fresh load
        query.set('page', '1');
        goto(`?${query.toString()}`);
    }

    function clearFilters() {
        goto('?');
    }

    $: totalPages = Math.ceil((data.count || 0) / (data.limit || 50));
</script>

<div class="container-fluid mt-4 pb-5">
    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <h1>Officer Verification Center <span class="badge bg-secondary">{data.count}</span></h1>
        
        <div class="d-flex gap-2 align-items-center flex-wrap">
            <input type="text" class="form-control form-control-sm" style="width: 200px;" placeholder="Search..." bind:value={filterSearch} on:keydown={(e) => e.key === 'Enter' && applyFilters()}>
            <select class="form-select form-select-sm" style="width: 150px;" bind:value={filterCourseId} on:change={applyFilters}>
                <option value="">All Courses</option>
                {#each data.courses as course}
                    <option value={course.id}>{course.name}</option>
                {/each}
            </select>
            <select class="form-select form-select-sm" style="width: 150px;" bind:value={filterFormType} on:change={applyFilters}>
                <option value="">All Form Types</option>
                {#each data.formTypes as ft}
                    <option value={ft.name}>{ft.name}</option>
                {/each}
            </select>
            <select class="form-select form-select-sm" style="width: 150px;" bind:value={filterStatus} on:change={applyFilters}>
                <option value="submitted">Pending</option>
                <option value="verified">Verified</option>
                <option value="needs_correction">Corrections</option>
            </select>
            <button class="btn btn-sm btn-primary" on:click={applyFilters}>Apply</button>
            <button class="btn btn-sm btn-outline-secondary" on:click={clearFilters}>Reset</button>
        </div>
    </div>

    <div class="card shadow-sm border-0 overflow-hidden">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th style="width: 40px">
                            <input type="checkbox" class="form-check-input" 
                                checked={selectedAppIds.size > 0 && selectedAppIds.size === data.applications.length}
                                on:change={toggleSelectAll}>
                        </th>
                        <th>Student Details</th>
                        <th>Form Type</th>
                        <th>Course</th>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Documents</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.applications as app (app.id)}
                        {@const isExpanded = expandedAppId === app.id}
                        {@const approvedCount = app.documents?.filter(d => d.status === 'approved').length || 0}
                        {@const totalDocs = app.documents?.length || 0}
                        <tr class={isExpanded ? 'table-primary-subtle' : ''}>
                            <td>
                                <input type="checkbox" class="form-check-input" 
                                    checked={selectedAppIds.has(app.id)}
                                    on:change={() => toggleSelect(app.id)}>
                            </td>
                            <td>
                                <div class="fw-bold">{app.student_user?.full_name}</div>
                                {#if app.student_user?.student_profiles?.enrollment_number}
                                    <div class="small fw-bold text-primary">ID: {app.student_user.student_profiles.enrollment_number}</div>
                                {/if}
                                <small class="text-muted">{app.student_user?.email}</small>
                            </td>
                            <td>
                                <span class="badge bg-light text-dark border">{app.form_type}</span>
                            </td>
                            <td>
                                <div>{app.courses?.name}</div>
                            </td>
                            <td>
                                {#if app.branches?.name}
                                    <div class="text-dark small">{app.branches.name}</div>
                                {:else if (app as any).prov_branch_name}
                                    <div class="text-muted small" title="Branch from provisional application">
                                        {(app as any).prov_branch_name} <small class="badge bg-light text-dark border ms-1" style="font-size: 0.6rem;">Prov</small>
                                    </div>
                                {:else}
                                    <div class="text-muted small">-</div>
                                {/if}
                            </td>
                            <td>
                                <span class="badge {app.status === 'verified' ? 'bg-success' : app.status === 'needs_correction' ? 'bg-danger' : 'bg-warning text-dark'}">
                                    {app.status}
                                </span>
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-1">
                                    <div class="progress w-100" style="height: 6px; min-width: 60px;">
                                        <div class="progress-bar bg-success" style="width: {(approvedCount/totalDocs)*100}%"></div>
                                    </div>
                                    <small class="ms-1 text-muted">{approvedCount}/{totalDocs}</small>
                                </div>
                            </td>
                            <td class="text-end">
                                <button class="btn btn-sm {isExpanded ? 'btn-primary' : 'btn-outline-primary'}" on:click={() => toggleExpand(app.id)}>
                                    <i class="bi {isExpanded ? 'bi-chevron-up' : 'bi-eye'}"></i> {isExpanded ? 'Review' : 'Review'}
                                </button>
                            </td>
                        </tr>
                        
                        {#if isExpanded}
                            <tr>
                                <td colspan="8" class="p-0 border-0">
                                    <div class="p-4 bg-light border-start border-primary border-4">
                                        <div class="row">
                                            <div class="col-md-9">
                                                <h6 class="mb-3">Document Verification</h6>
                                                <div class="d-flex flex-wrap gap-3">
                                                    {#each app.documents || [] as doc}
                                                        <div class="doc-item d-flex flex-column" style="width: 130px;">
                                                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                                                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                                                            <div 
                                                                class="card border-2 {doc.status === 'rejected' ? 'border-danger' : doc.status === 'approved' ? 'border-success' : 'border-light'} shadow-sm mb-2"
                                                                style="cursor: pointer; height: 140px;"
                                                                on:click={() => openPreview(doc)}
                                                            >
                                                                <div class="card-body p-1 d-flex align-items-center justify-content-center position-relative overflow-hidden" style="height: 100px;">
                                                                    {#if isSigning.get(doc.id)}
                                                                        <div class="spinner-border spinner-border-sm text-primary"></div>
                                                                    {:else if signingUrls.has(doc.id)}
                                                                        {#if doc.file_name.toLowerCase().endsWith('.pdf')}
                                                                            <i class="bi bi-file-earmark-pdf fs-1 text-danger"></i>
                                                                        {:else}
                                                                            <img src={signingUrls.get(doc.id)} alt="Preview" class="img-fluid rounded" style="max-height: 100%; width: 100%; object-fit: cover;">
                                                                        {/if}
                                                                    {:else}
                                                                        <i class="bi bi-file-earmark fs-1 text-secondary"></i>
                                                                    {/if}

                                                                    {#if doc.status === 'rejected'}
                                                                        <div class="position-absolute top-0 start-0 w-100 h-100 bg-danger bg-opacity-10 d-flex align-items-center justify-content-center">
                                                                            <i class="bi bi-x-circle-fill text-danger fs-3 shadow-sm"></i>
                                                                        </div>
                                                                    {:else if doc.status === 'approved'}
                                                                        <div class="position-absolute top-0 start-0 w-100 h-100 bg-success bg-opacity-10 d-flex align-items-center justify-content-center">
                                                                            <i class="bi bi-check-circle-fill text-success fs-3 shadow-sm"></i>
                                                                        </div>
                                                                    {/if}
                                                                </div>
                                                                <div class="card-footer p-1 bg-white border-0 mt-auto">
                                                                    <div class="text-truncate small text-center fw-bold" style="font-size: 0.7rem;" title={doc.document_type}>{doc.document_type}</div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div class="d-flex justify-content-center gap-1 mt-auto">
                                                                {#if doc.status === 'rejected'}
                                                                    <form method="POST" action="?/undoRejectDocument" use:enhance class="w-100">
                                                                        <input type="hidden" name="document_id" value={doc.id}>
                                                                        <input type="hidden" name="application_id" value={app.id}>
                                                                        <button class="btn btn-xs btn-warning w-100 d-flex align-items-center justify-content-center py-1" title="Undo Rejection">
                                                                            <i class="bi bi-arrow-counterclockwise me-1"></i> Undo
                                                                        </button>
                                                                    </form>
                                                                {:else}
                                                                    {#if doc.status !== 'approved'}
                                                                        <form method="POST" action="?/approveDocument" use:enhance class="flex-grow-1">
                                                                            <input type="hidden" name="document_id" value={doc.id}>
                                                                            <input type="hidden" name="application_id" value={app.id}>
                                                                            <button class="btn btn-xs btn-outline-success w-100 d-flex align-items-center justify-content-center py-1" title="Approve">
                                                                                <i class="bi bi-check-lg"></i>
                                                                            </button>
                                                                        </form>
                                                                    {/if}
                                                                    <button class="btn btn-xs btn-outline-danger {doc.status === 'approved' ? 'w-100' : 'flex-grow-1'} d-flex align-items-center justify-content-center py-1" on:click|stopPropagation={() => openReject(doc)} title="Reject">
                                                                        <i class="bi bi-x-lg"></i>
                                                                    </button>
                                                                {/if}
                                                            </div>
                                                        </div>
                                                    {/each}
                                                </div>
                                            </div>
                                            <div class="col-md-3 border-start">
                                                <h6>Verification Decision</h6>
                                                <div class="d-grid gap-2 mt-3">
                                                    {#if app.status !== 'verified'}
                                                        <form method="POST" action="?/verifyStudent" use:enhance={() => {
                                                            return async ({ result }) => {
                                                                if (result.type === 'success') {
                                                                    toastStore.success('Application Verified Successfully');
                                                                    invalidateAll();
                                                                }
                                                            };
                                                        }}>
                                                            <input type="hidden" name="application_id" value={app.id}>
                                                            <button class="btn btn-success w-100" disabled={app.status === 'needs_correction'}>
                                                                <i class="bi bi-patch-check"></i> Verify & Approve
                                                            </button>
                                                        </form>
                                                    {/if}
                                                    <a href="/adm-officer/applications/{app.id}" class="btn btn-outline-primary">
                                                        <i class="bi bi-person-lines-fill"></i> Detailed Profile
                                                    </a>
                                                </div>
                                                {#if app.status === 'needs_correction'}
                                                    <div class="alert alert-danger small mt-3 p-2">
                                                        <i class="bi bi-exclamation-triangle"></i> Rejection active. Student must correct documents.
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="d-flex justify-content-center mt-4">
            <nav aria-label="Page navigation">
                <ul class="pagination pagination-sm mb-0">
                    <li class="page-item" class:disabled={data.page <= 1}>
                        <button class="page-link" on:click={() => goto(`?page=${data.page - 1}&limit=${data.limit}&status=${filterStatus}&courseId=${filterCourseId}&search=${filterSearch}&formType=${filterFormType}`)}>Previous</button>
                    </li>
                    <li class="page-item disabled">
                        <span class="page-link text-dark">Page {data.page} of {totalPages}</span>
                    </li>
                    <li class="page-item" class:disabled={data.page >= totalPages}>
                        <button class="page-link" on:click={() => goto(`?page=${data.page + 1}&limit=${data.limit}&status=${filterStatus}&courseId=${filterCourseId}&search=${filterSearch}&formType=${filterFormType}`)}>Next</button>
                    </li>
                </ul>
            </nav>
        </div>
    {/if}
</div>

<!-- Sticky Bulk Action Bar -->
{#if selectedAppIds.size > 0}
    <div class="fixed-bottom bg-dark text-white p-3 shadow-lg d-flex justify-content-between align-items-center animate-slide-up" style="z-index: 1060;">
        <div>
            <span class="fs-5 fw-bold">{selectedAppIds.size}</span> applications selected
            <button class="btn btn-link btn-sm text-white-50 ms-2" on:click={() => selectedAppIds.clear()}>Deselect All</button>
        </div>
        <div class="d-flex gap-2">
            <form method="POST" action="?/bulkVerify" use:enhance={() => {
                return async ({ result }) => {
                    if (result.type === 'success') {
                        toastStore.success(result.data?.message);
                        selectedAppIds.clear();
                        invalidateAll();
                    }
                };
            }}>
                <input type="hidden" name="application_ids" value={JSON.stringify(Array.from(selectedAppIds))}>
                <button type="submit" class="btn btn-success">
                    <i class="bi bi-patch-check-fill"></i> Bulk Verify & Approve
                </button>
            </form>
        </div>
    </div>
{/if}

<!-- Lightbox Modal -->
{#if previewDoc}
    <div class="modal d-block" style="background: rgba(0,0,0,0.9); z-index: 2000;" on:click|self={() => previewDoc = null}>
        <div class="modal-dialog modal-xl modal-dialog-centered h-100 my-0">
            <div class="modal-content h-100 bg-transparent border-0 shadow-none">
                <div class="modal-header border-0 p-3">
                    <h5 class="modal-title text-white">{previewDoc.document_type}</h5>
                    <button type="button" class="btn-close btn-close-white" on:click={() => previewDoc = null}></button>
                </div>
                <div class="modal-body d-flex align-items-center justify-content-center p-0 overflow-hidden">
                    {#if signingUrls.get(previewDoc.id)}
                        {#if previewDoc.file_name.toLowerCase().endsWith('.pdf')}
                            <iframe src={signingUrls.get(previewDoc.id)} class="w-100 h-100 bg-white rounded" title="PDF Preview"></iframe>
                        {:else}
                            <img src={signingUrls.get(previewDoc.id)} class="img-fluid rounded" style="max-height: 90vh; object-fit: contain;" alt="Full Preview">
                        {/if}
                    {:else}
                        <div class="spinner-border text-light"></div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Reject Modal -->
{#if showRejectModal}
    <div class="modal d-block" style="background: rgba(0,0,0,0.5); z-index: 2100;">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Reject Document</h5>
                    <button type="button" class="btn-close" on:click={() => showRejectModal = false}></button>
                </div>
                <form method="POST" action="?/rejectDocument" use:enhance={() => {
                    return async ({ result }) => {
                        if (result.type === 'success') {
                            toastStore.warning('Document rejected');
                            showRejectModal = false;
                            invalidateAll();
                        }
                    };
                }}>
                    <div class="modal-body">
                        <input type="hidden" name="document_id" value={selectedDocument?.id}>
                        <input type="hidden" name="application_id" value={selectedDocument?.application_id}>
                        <p>Student: <strong>{data.applications.find(a => a.id === selectedDocument?.application_id)?.student_user?.full_name}</strong></p>
                        <p>Document: <strong>{selectedDocument?.document_type}</strong></p>
                        <label class="form-label">Reason for Rejection</label>
                        <textarea name="reason" class="form-control" rows="3" bind:value={rejectionReason} required placeholder="Why is this document being rejected?"></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={() => showRejectModal = false}>Cancel</button>
                        <button type="submit" class="btn btn-danger">Confirm Rejection</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

<style>
    .btn-xs {
        font-size: 0.75rem;
        padding: 0.1rem 0.3rem;
    }
    .animate-slide-up {
        animation: slideUp 0.3s ease-out;
    }
    @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
    }
    .table-primary-subtle {
        background-color: #e7f1ff;
    }
</style>
