<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;
    export let form: ActionData;

    let selectedCourseId = data.filters?.courseId || '';
    let selectedBranchId = '';
    // Default to the first active cycle if available
    let selectedCycleId = data.filters?.cycleId || (data.cycles.length > 0 ? data.cycles[0].id : '');
    let selectedFormType = data.filters?.formType || ''; 
    let targetStatus = 'verified'; // New: For selection
    let searchTerm = ''; // Search by name or email

    function applyFilters() {
        const query = new URLSearchParams($page.url.searchParams.toString());
        
        if (selectedCourseId) query.set('courseId', selectedCourseId);
        else query.delete('courseId');

        if (selectedCycleId) query.set('cycleId', selectedCycleId);
        else query.delete('cycleId');

        if (selectedFormType) query.set('formType', selectedFormType);
        else query.delete('formType');

        goto(`?${query.toString()}`, { keepFocus: true, noScroll: true });
    }

    // Derived filtered list of applications based on selection
    $: filteredApplications = data.applications.filter(app => {
        // Server-side already filtered by Course, Cycle, Form Type.
        // We only do Branch and Search term filtering in-memory here.
        
        // Search term filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            const fullName = (app.student_user?.full_name || '').toLowerCase();
            const email = (app.student_user?.email || '').toLowerCase();
            if (!fullName.includes(search) && !email.includes(search)) return false;
        }

        // Branch filter - Check current branch OR provisional fallback branch
        if (selectedBranchId) {
            const currentBranchId = app.branch_id;
            const provBranchName = (app as any).prov_branch_name;
            const selectedBranchName = data.branches.find(b => b.id === selectedBranchId)?.name;

            const matchesBranch = (currentBranchId === selectedBranchId) || 
                                 (provBranchName && selectedBranchName && provBranchName === selectedBranchName);
            
            if (!matchesBranch) return false;
        }

        // Apply target status filter for preview
        // ENHANCEMENT: If an application already has a merit_rank, we ALWAYS show it in the preview 
        // to avoid "missing ranks" confusion when viewing a list generated with different criteria.
        if (app.merit_rank) return true;

        if (targetStatus === 'verified') return app.status === 'verified' || app.status === 'approved' || app.status === 'waitlisted';
        if (targetStatus === 'submitted_paid') return app.status === 'submitted' && app.application_fee_status === 'paid';
        if (targetStatus === 'both') return true; // Already pre-filtered in server load to only show relevant statuses
        
        return true;
    });

    // Pagination
    let currentPage = 1;
    let pageSize = 20;
    
    $: totalPages = Math.ceil(filteredApplications.length / pageSize);
    $: paginatedApplications = filteredApplications.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Reset page on filter change
    $: if (filteredApplications) currentPage = 1;

    $: canCalculate = selectedCourseId && selectedCycleId && selectedFormType;

    // Determine publication status
    // Refactored to match strict form_type check now that we are dynamic
    $: isPublished = data.admissionForms?.find(f => 
        f.course_id === selectedCourseId && 
        f.cycle_id === selectedCycleId && 
        f.form_type === selectedFormType
    )?.is_merit_published || false;

    async function exportToExcel() {
        const XLSX = await import('xlsx');
        if (!filteredApplications || filteredApplications.length === 0) {
            alert('No data to export');
            return;
        }

        const exportData = filteredApplications.map(app => ({
            'Rank': app.merit_rank || '-',
            'Score': app.merit_score !== undefined && app.merit_score !== null ? app.merit_score.toFixed(5) : '-',
            'Student Name': app.student_user?.full_name || 'N/A',
            'Email': app.student_user?.email || 'N/A',
            'Course': app.courses?.name || '-',
            'Branch': app.branches?.name || (app as any).prov_branch_name || '-',
            'Status': app.status,
            'Fee Status': app.application_fee_status || 'N/A',
            'Comment': app.approval_comment || (app as any).prov_approval_comment || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Merit List');

        const courseName = data.courses.find(c => c.id === selectedCourseId)?.name || 'Course';
        const fileName = `Merit_List_${courseName.replace(/\s+/g, '_')}_${selectedFormType}_${new Date().toISOString().split('T')[0]}.xlsx`;

        XLSX.writeFile(workbook, fileName);
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Admission Officer: Merit List Management</h1>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-header">Merit Generation Configuration</div>
        <div class="card-body">
            <div class="row g-3 align-items-end">
                <div class="col-md-3">
                    <label for="cycle-select" class="form-label">Cycle</label>
                    <select class="form-select" id="cycle-select" bind:value={selectedCycleId} on:change={applyFilters}>
                        <option value="">Select Cycle</option>
                        {#each data.cycles as cycle}
                            <option value={cycle.id}>{cycle.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label for="course-select" class="form-label">Course</label>
                    <select class="form-select" id="course-select" bind:value={selectedCourseId} on:change={() => { selectedBranchId = ''; applyFilters(); }}>
                        <option value="">Select Course</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label for="branch-select" class="form-label">Branch (Preview)</label>
                    <select class="form-select" id="branch-select" bind:value={selectedBranchId} disabled={!selectedCourseId}>
                        <option value="">All Branches</option>
                        {#each data.branches.filter(b => b.course_id === selectedCourseId) as branch}
                            <option value={branch.id}>{branch.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label for="type-select" class="form-label">Form Type</label>
                    <select class="form-select" id="type-select" bind:value={selectedFormType} on:change={applyFilters}>
                        <option value="">Select Type</option>
                        {#if data.formTypes}
                            {#each data.formTypes as ft}
                                <option value={ft.name}>{ft.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>
            </div>

            <div class="row g-3 align-items-end mt-2">
                <div class="col-md-4">
                    <label for="status-target" class="form-label">Target Applications</label>
                    <select class="form-select" id="status-target" bind:value={targetStatus}>
                        <option value="verified">Verified Only</option>
                        <option value="submitted_paid">Submitted (Paid) Only</option>
                        <option value="both">Both (Verified & Paid)</option>
                    </select>
                    <div class="form-text x-small">Selection for Merit Calculation.</div>
                </div>
                <div class="col-md-4">
                    <form method="POST" action="?/generateMerit" use:enhance={() => {
                        startLoading();
                        return async ({ update }) => { await update(); stopLoading(); }
                    }}>
                        <input type="hidden" name="course_id" value={selectedCourseId}>
                        <input type="hidden" name="cycle_id" value={selectedCycleId}>
                        <input type="hidden" name="form_type" value={selectedFormType}>
                        <input type="hidden" name="target_status" value={targetStatus}>
                        <button type="submit" class="btn btn-primary w-100" disabled={!canCalculate}>
                            <i class="bi bi-calculator"></i> Generate Merit List
                        </button>
                    </form>
                </div>
                <div class="col-md-4 text-end">
                    <div class="x-small text-muted mb-2">Branch filter applies to preview only.</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Results Table -->
    <div class="card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div class="d-flex align-items-center gap-3 flex-grow-1">
                <span>Merit List Preview ({filteredApplications.length})</span>
                {#if isPublished}
                    <span class="badge bg-success">Published</span>
                {:else if filteredApplications.length > 0 && filteredApplications[0].merit_rank}
                    <span class="badge bg-warning text-dark">Draft Generated</span>
                {:else}
                    <span class="badge bg-secondary">Not Generated</span>
                {/if}
            </div>

            <div class="flex-grow-1" style="max-width: 300px;">
                <div class="input-group input-group-sm">
                    <span class="input-group-text bg-white border-end-0">
                        <i class="bi bi-search text-muted"></i>
                    </span>
                    <input 
                        type="text" 
                        class="form-control border-start-0 ps-0" 
                        placeholder="Search name or email..." 
                        bind:value={searchTerm}
                    >
                    {#if searchTerm}
                        <button class="btn btn-outline-secondary border-start-0" type="button" on:click={() => searchTerm = ''}>
                            <i class="bi bi-x"></i>
                        </button>
                    {/if}
                </div>
            </div>
            
            <div class="d-flex gap-2">
                <button class="btn btn-outline-success btn-sm" on:click={exportToExcel} disabled={filteredApplications.length === 0}>
                    <i class="bi bi-file-earmark-excel me-1"></i> Export to Excel
                </button>

                {#if isPublished}
                    <form method="POST" action="?/unpublishMerit" use:enhance={() => {
                        if(!confirm('Unpublishing will hide ranks from students. Continue?')) return cancel();
                        startLoading();
                        return async ({ update }) => { await update(); stopLoading(); }
                    }}>
                        <input type="hidden" name="course_id" value={selectedCourseId}>
                        <input type="hidden" name="cycle_id" value={selectedCycleId}>
                        <input type="hidden" name="form_type" value={selectedFormType}>
                        <button class="btn btn-danger btn-sm">
                            <i class="bi bi-eye-slash"></i> Unpublish
                        </button>
                    </form>
                {:else if filteredApplications.length > 0 && filteredApplications[0].merit_rank}
                    <form method="POST" action="?/publishMerit" use:enhance={() => {
                        if(!confirm('Publishing will make these ranks visible to students. Continue?')) return cancel();
                        startLoading();
                        return async ({ update }) => { await update(); stopLoading(); }
                    }}>
                        <input type="hidden" name="course_id" value={selectedCourseId}>
                        <input type="hidden" name="cycle_id" value={selectedCycleId}>
                        <input type="hidden" name="form_type" value={selectedFormType}>
                        <button class="btn btn-success btn-sm">
                            <i class="bi bi-check-circle"></i> Publish List
                        </button>
                    </form>
                {/if}
            </div>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Score</th>
                            <th>Student</th>
                            <th>Course</th>
                            <th>Branch</th>
                            <th>Status</th>
                            <th>Fee</th>
                            <th>Comment</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if paginatedApplications.length > 0}
                            {#each paginatedApplications as app}
                                <tr>
                                    <td>
                                        {#if app.merit_rank}
                                            <span class="badge bg-primary rounded-pill">{app.merit_rank}</span>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td>
                                        {#if app.merit_score !== undefined && app.merit_score !== null}
                                            {app.merit_score.toFixed(5)}
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td>
                                        {app.student_user?.full_name || 'N/A'} <br>
                                        <small class="text-muted">{app.student_user?.email}</small>
                                    </td>
                                    <td>{app.courses?.name || '-'}</td>
                                    <td>
                                        {#if app.branches?.name}
                                            {app.branches.name}
                                        {:else if app.prov_branch_name}
                                            <span class="text-muted">{app.prov_branch_name}</span>
                                            <small class="badge bg-light text-dark border ms-1" style="font-size: 0.65rem;" title="Branch from provisional application">Prov</small>
                                        {:else}
                                            <small class="text-muted">-</small>
                                        {/if}
                                    </td>
                                    <td><span class="badge bg-secondary">{app.status}</span></td>
                                    <td>
                                        <span class="badge {app.application_fee_status === 'paid' ? 'bg-success' : (['pending', 'waived', 'partial'].includes(app.application_fee_status) ? 'bg-warning text-dark' : 'bg-secondary')}">
                                            {app.application_fee_status || 'N/A'}
                                        </span>
                                    </td>
                                    <td>
                                        {#if app.approval_comment}
                                            <div class="text-truncate" style="max-width: 150px;" title={app.approval_comment}>
                                                {app.approval_comment}
                                            </div>
                                        {/if}
                                        {#if (app as any).prov_approval_comment}
                                            <div class="text-muted x-small mt-1" title="Comment from provisional application">
                                                <span class="badge bg-light text-dark border me-1" style="font-size: 0.55rem;">Prov</span>
                                                <span class="text-truncate d-inline-block align-middle" style="max-width: 120px;">{(app as any).prov_approval_comment}</span>
                                            </div>
                                        {/if}
                                        {#if !app.approval_comment && !(app as any).prov_approval_comment}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td class="text-end">
                                        <a href="/adm-officer/applications/{app.id}" class="btn btn-sm btn-outline-primary" target="_blank">
                                            <i class="bi bi-eye"></i> View
                                        </a>
                                    </td>
                                </tr>
                            {/each}
                        {:else}
                            <tr>
                                <td colspan="8" class="text-center py-4">
                                    {#if canCalculate}
                                        No applications found for this selection.
                                    {:else}
                                        Please select options to view or generate list.
                                    {/if}
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
            {#if totalPages > 1}
                <div class="card-footer d-flex justify-content-center">
                    <button class="btn btn-sm btn-secondary me-2" disabled={currentPage <= 1} on:click={() => currentPage--}>Prev</button>
                    <span class="align-self-center">Page {currentPage} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={currentPage >= totalPages} on:click={() => currentPage++}>Next</button>
                </div>
            {/if}
        </div>
    </div>
</div>
