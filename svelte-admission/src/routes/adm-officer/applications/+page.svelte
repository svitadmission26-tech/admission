<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    let searchQuery = data.search;

    function triggerSearch() {
        updateQuery({ search: searchQuery, page: '1' });
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') triggerSearch();
    }

    function changePage(newPage: number) {
        updateQuery({ page: newPage.toString() });
    }

    function setStatus(status: string) {
        updateQuery({ status, page: '1', search: '' });
    }

    function handleLimitChange(newLimit: number) {
        updateQuery({ limit: newLimit.toString(), page: '1' });
    }

    function handleFormTypeChange(formType: string) {
        updateQuery({ form_type: formType, page: '1' });
    }

    function handleCourseChange(courseId: string) {
        updateQuery({ course_id: courseId === 'all' ? '' : courseId, branch_id: '', page: '1' });
    }

    function handleBranchChange(branchId: string) {
        updateQuery({ branch_id: branchId === 'all' ? '' : branchId, page: '1' });
    }

    $: filteredBranches = (data.courseId && data.courseId !== 'all')
        ? (data.branches || []).filter((b: any) => b.course_id === data.courseId)
        : [];

    function handleSort(field: string) {
        const currentSort = data.sort;
        const currentOrder = data.order || 'desc';
        let newOrder = 'desc';
        if (currentSort === field && currentOrder === 'desc') {
            newOrder = 'asc';
        }
        updateQuery({ sort: field, order: newOrder, page: '1' });
    }

    function updateQuery(updates: Record<string, string>) {
        const params = new URLSearchParams($page.url.searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        goto(`?${params.toString()}`);
    }

    $: totalPages = Math.ceil((data.count || 0) / data.limit);

    // --- Print Profile Logic ---
    let showPrintModal = false;
    let selectedPrintTemplate = '';
    let filteredPrintTemplates: any[] = [];
    let printTargetAppId = '';

    function handlePrintClick(event: MouseEvent, app: any) {
        event.preventDefault();
        event.stopPropagation();
        
        printTargetAppId = app.id;
        const appFormTypeId = data.formTypeIdentityMap[(app.form_type || '').toLowerCase()];
        const appCourseId = app.course_id;
        const appAcademicYearId = app.admission_cycles?.academic_year_id;
        
        filteredPrintTemplates = (data.printTemplates || []).filter((t: any) => {
            const matchesFormType = !t.target_form_type_id || t.target_form_type_id === appFormTypeId;
            const matchesAcademicYear = !t.target_academic_year_id || t.target_academic_year_id === appAcademicYearId;
            const matchesCourse = !t.target_course_id || t.target_course_id === appCourseId;
            return matchesFormType && matchesAcademicYear && matchesCourse;
        });

        if (filteredPrintTemplates.length === 0) {
            alert('No print templates available for this application.');
            return;
        }

        if (filteredPrintTemplates.length === 1) {
            window.open(`/print-profile/${app.id}?templateId=${filteredPrintTemplates[0].id}`, '_blank');
        } else {
            showPrintModal = true;
        }
    }

    function confirmPrintProfile() {
        if (!selectedPrintTemplate) {
            alert('Please select a template.');
            return;
        }
        window.open(`/print-profile/${printTargetAppId}?templateId=${selectedPrintTemplate}`, '_blank');
        showPrintModal = false;
    }
</script>

<div class="container-fluid mt-4">
    <h1 class="mb-4">Applications</h1>

    <!-- Search & Filter -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-4">
                    <div class="input-group">
                        <input type="text" class="form-control" placeholder="Search Name, College ID..." 
                               bind:value={searchQuery} on:keydown={handleKeydown}>
                        <button class="btn btn-primary" on:click={triggerSearch}>
                            <i class="bi bi-search"></i>
                        </button>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted fw-bold text-nowrap">Type:</small>
                        <select class="form-select" value={data.formTypeFilter || 'all'} on:change={(e) => handleFormTypeChange(e.currentTarget.value)}>
                            <option value="all">All</option>
                            {#each data.availableFormTypes as ft}
                                <option value={ft.name}>{ft.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted fw-bold text-nowrap">Course:</small>
                        <select class="form-select" value={data.courseId || 'all'} on:change={(e) => handleCourseChange(e.currentTarget.value)}>
                            <option value="all">All</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name} ({course.code})</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="col-md-2">
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted fw-bold text-nowrap">Branch:</small>
                        <select class="form-select" value={data.branchId || 'all'} disabled={!data.courseId || data.courseId === 'all'} on:change={(e) => handleBranchChange(e.currentTarget.value)}>
                            {#if !data.courseId || data.courseId === 'all'}
                                <option value="all">Select course first</option>
                            {:else}
                                <option value="all">All</option>
                                {#each filteredBranches as branch}
                                    <option value={branch.id}>{branch.name}</option>
                                {/each}
                            {/if}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3">
        <li class="nav-item">
            <button class="nav-link {data.status === 'submitted' ? 'active' : ''}" on:click={() => setStatus('submitted')}>
                Pending Verification
            </button>
        </li>
        <li class="nav-item">
            <button class="nav-link {data.status === 'processed' ? 'active' : ''}" on:click={() => setStatus('processed')}>
                Processed History
            </button>
        </li>
    </ul>

    <!-- List -->
    <div class="card shadow-sm">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2">
                <span class="fw-bold">Applications</span>
                <span class="badge bg-secondary">{data.count} Found</span>
            </div>
            
            <div class="d-flex align-items-center gap-3">
                <div class="d-flex align-items-center gap-2">
                    <small class="text-muted text-nowrap">Sort By:</small>
                    <div class="btn-group btn-group-sm">
                        <button class="btn {data.sort === 'submitted_at' ? 'btn-primary' : 'btn-outline-secondary'}" on:click={() => handleSort('submitted_at')}>
                            Date {data.sort === 'submitted_at' ? (data.order === 'asc' ? '↑' : '↓') : ''}
                        </button>
                        <button class="btn {data.sort === 'receipt_number' ? 'btn-primary' : 'btn-outline-secondary'}" on:click={() => handleSort('receipt_number')}>
                            Receipt {data.sort === 'receipt_number' ? (data.order === 'asc' ? '↑' : '↓') : ''}
                        </button>
                    </div>
                </div>

                <div class="d-flex align-items-center gap-2">
                    <small class="text-muted">Per Page:</small>
                    <select class="form-select form-select-sm" style="width: auto;" value={data.limit} on:change={(e) => handleLimitChange(parseInt(e.currentTarget.value))}>
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>

                {#if totalPages > 1}
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted">Page {data.page} of {totalPages}</small>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" disabled={data.page === 1} on:click={() => changePage(data.page - 1)}>
                                <i class="bi bi-chevron-left"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>
                                <i class="bi bi-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
        <div class="list-group list-group-flush">
            {#each data.applications as app}
                {@const isProvType = data.formTypesMap?.[app.form_type] === true}
                {@const appReceiptPayment = (app.payments || []).find(p => p.payment_type === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) || (app.payments || []).find(p => p.receipt_number)}
                <a href="/adm-officer/applications/{app.id}" class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between align-items-center">
                        <h5 class="mb-1">{app.student_user?.full_name || 'Unknown User'}</h5>
                        <div class="d-flex align-items-center gap-2">
                            <button class="btn btn-sm btn-outline-info" on:click={(e) => handlePrintClick(e, app)} title="Print Profile">
                                <i class="bi bi-printer"></i>
                            </button>
                            <small class="text-muted">{new Date(app.submitted_at).toLocaleDateString()}</small>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <p class="mb-1 text-muted">
                                {app.courses?.name} 
                                {#if app.branches} - {app.branches.name}{/if}
                                <span class="badge bg-secondary ms-2">{app.form_type}</span>
                                {#if app.admission_type && app.admission_type !== 'Regular'}
                                    <span class="badge bg-dark ms-1">{app.admission_type}</span>
                                {/if}
                            </p>
                            {#if appReceiptPayment?.receipt_number}
                                <small class="text-muted text-nowrap">Receipt: <span class="fw-bold text-dark">{appReceiptPayment.receipt_number}</span></small>
                            {/if}
                        </div>
                        <span class="badge 
                            {app.status?.toLowerCase() === 'approved' ? 'bg-success' : 
                             app.status?.toLowerCase() === 'verified' ? 'bg-info' : 
                             app.status?.toLowerCase() === 'rejected' ? 'bg-danger' : 
                             app.status?.toLowerCase() === 'submitted' ? 'bg-warning text-dark' : 'bg-secondary'}">
                            {app.status}
                        </span>
                    </div>
                </a>
            {:else}
                <div class="p-4 text-center text-muted">
                    No applications found.
                </div>
            {/each}
        </div>
        
        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="card-footer d-flex justify-content-center">
                <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                <span class="align-self-center">Page {data.page} of {totalPages}</span>
                <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
            </div>
        {/if}
    </div>
</div>

<!-- Print Selection Modal -->
{#if showPrintModal}
    <div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5); z-index: 1060;">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content shadow">
                <div class="modal-header">
                    <h5 class="modal-title">Select Print Template</h5>
                    <button type="button" class="btn-close" on:click={() => showPrintModal = false}></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Template</label>
                        <select class="form-select" bind:value={selectedPrintTemplate}>
                            <option value="">Select a template...</option>
                            {#each filteredPrintTemplates as t}
                                <option value={t.id}>{t.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showPrintModal = false}>Cancel</button>
                    <button type="button" class="btn btn-primary" on:click={confirmPrintProfile} disabled={!selectedPrintTemplate}>
                        <i class="bi bi-printer me-1"></i> Print Selected
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
