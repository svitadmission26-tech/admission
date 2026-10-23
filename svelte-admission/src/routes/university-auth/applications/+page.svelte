<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance, deserialize } from '$app/forms';
    import { writable } from 'svelte/store';
    import { invalidate, invalidateAll } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';
    import { goto } from '$app/navigation';
    import { page as sveltePage } from '$app/stores';
    import { getBranchDisplayCode } from '$lib/utils/display_helpers';
    import { supabase } from '$lib/supabase';

    export let data: PageData;
    export let form: ActionData;

    // State
    let selectedApplication: any | null = null;
    let showDetailsModal = false;
    let showRejectionReasonModal = false;
    let showApproveModal = false;
    let showWaitlistModal = false;
    
    let applicationRejectionReason = '';
    let applicationApprovalComment = '';
    let selectedBranchId = '';
    
    // Params
    $: activeTab = data.activeTab || 'verified';
    $: searchQuery = data.search || '';
    $: totalPages = Math.ceil((data.count || 0) / data.limit);
    $: sortField = data.sortField || 'merit_rank';
    $: sortOrder = data.sortOrder || 'asc';
    $: formTypeFilter = data.formTypeFilter || 'all';
    $: offset = ((data.page || 1) - 1) * (data.limit || 50);

    // Helpers
    function updateQuery(updates: Record<string, string>) {
        const params = new URLSearchParams($sveltePage.url.searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
    }

    function triggerSearch() { updateQuery({ search: searchQuery, page: '1' }); }
    function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter') triggerSearch(); }
    function handleFormTypeChange(e: Event) {
        const val = (e.currentTarget as HTMLSelectElement).value;
        updateQuery({ form_type: val === 'all' ? '' : val, page: '1' });
    }
    
    function handleCourseChange(e: Event) {
        const val = (e.currentTarget as HTMLSelectElement).value;
        updateQuery({ course_id: val === 'all' ? '' : val, branch_id: '', page: '1' });
    }
    
    function handleBranchChange(e: Event) {
        const val = (e.currentTarget as HTMLSelectElement).value;
        updateQuery({ branch_id: val === 'all' ? '' : val, page: '1' });
    }

    function getTabUrl(t: string) {
        const params = new URLSearchParams($sveltePage.url.searchParams);
        params.set('tab', t);
        params.set('page', '1');
        return `?${params.toString()}`;
    }

    $: filteredBranches = (data.courseId && data.courseId !== 'all')
        ? (data.branches || []).filter((b: any) => b.course_id === data.courseId)
        : [];
    function switchTab(t: string) { updateQuery({ tab: t, page: '1', search: '' }); }

    function handleSort(field: string) {
        const currentSort = data.sortField || 'merit_rank';
        const currentOrder = data.sortOrder || 'asc';
        let defaultOrder = field === 'merit_rank' ? 'asc' : 'desc';
        const newOrder = currentSort === field
            ? (currentOrder === 'asc' ? 'desc' : 'asc')
            : defaultOrder;
        updateQuery({ sort: field, order: newOrder, page: '1' });
    }

    async function viewDetails(app: any) {
        selectedApplication = app;
        showDetailsModal = true;
        
        if (selectedApplication && selectedApplication.documents && selectedApplication.documents.length > 0) {
            const promises = selectedApplication.documents.map(async (doc: any) => {
                if (!doc.signed_url) {
                    try {
                        const { data: signedData, error } = await supabase.storage
                            .from('documents')
                            .createSignedUrl(doc.file_path, 3600);
                        if (signedData) {
                            doc.signed_url = signedData.signedUrl;
                        }
                    } catch (e) {
                        console.error('Error signing document client-side:', e);
                    }
                }
            });
            await Promise.all(promises);
            selectedApplication = selectedApplication;
        }
    }

    function openApproveModal(app: any) {
        selectedApplication = app;
        selectedBranchId = app.branch_id || ''; // Pre-select existing branch
        applicationApprovalComment = '';
        
        const hasBranches = (app.courses as any)?.branches && (app.courses as any).branches.length > 0;

        if (hasBranches) {
            showApproveModal = true;
        } else {
            // Confirm direct approval
            if(confirm(`Approve application for ${(app.users as any)?.full_name}?`)) {
                submitApproval();
            }
        }
    }

    async function submitApproval() {
        if (!selectedApplication) return;
        const formData = new FormData();
        formData.append('application_id', selectedApplication.id);
        if (selectedBranchId) formData.append('branch_id', selectedBranchId);
        if (applicationApprovalComment) formData.append('approval_comment', applicationApprovalComment);
 
        const response = await fetch('?/approveApplication', { method: 'POST', body: formData });
        const res = deserialize(await response.text()) as any;
        
        showApproveModal = false;
        if (res.type === 'success') {
            toastStore.success('Application approved!');
            const appId = selectedApplication?.id;
            if (appId && confirm('Application approved successfully! Would you like to print the Admission Slip now?')) {
                window.open(`/receipts/admission/${appId}?print=1`, '_blank');
            }
            await invalidateAll();
        } else {
            const errorMsg = res.data?.message || 'Error approving.';
            toastStore.error(errorMsg);
        }
    }

    async function waitlistApp(app: any) {
        if(!confirm(`Waitlist application for ${(app.users as any)?.full_name}?`)) return;
        const fd = new FormData();
        fd.append('application_id', app.id);
        const res = await fetch('?/waitlistApplication', { method: 'POST', body: fd });
        const result = deserialize(await res.text()) as any;
        if (result.type === 'success') {
            toastStore.success('Waitlisted');
            await invalidateAll();
        } else {
            toastStore.error(result.data?.message || 'Error waitlisting.');
        }
    }

    function openWaitlistModal(app: any) {
        selectedApplication = app;
        applicationApprovalComment = '';
        showWaitlistModal = true;
    }

    async function submitWaitlist() {
        if (!selectedApplication) return;
        const fd = new FormData();
        fd.append('application_id', selectedApplication.id);
        if (applicationApprovalComment) fd.append('approval_comment', applicationApprovalComment);
        
        const res = await fetch('?/waitlistApplication', { method: 'POST', body: fd });
        const result = deserialize(await res.text()) as any;
        showWaitlistModal = false;
        if (result.type === 'success') {
            toastStore.success('Waitlisted');
            await invalidateAll();
        } else {
            toastStore.error(result.data?.message || 'Error waitlisting.');
        }
    }

    function openRejectModal(app: any) {
        selectedApplication = app;
        applicationRejectionReason = '';
        showRejectionReasonModal = true;
    }

    async function submitReject() {
        if (!applicationRejectionReason) return;
        const fd = new FormData();
        fd.append('application_id', selectedApplication.id);
        fd.append('rejection_reason', applicationRejectionReason);
        
        const res = await fetch('?/rejectApplication', { method: 'POST', body: fd });
        const result = deserialize(await res.text()) as any;
        showRejectionReasonModal = false;
        if (result.type === 'success') {
            toastStore.success('Rejected');
            await invalidateAll();
        } else {
            toastStore.error(result.data?.message || 'Error rejecting.');
        }
    }

    async function revertApp(app: any) {
        if(!confirm(`Revert approval for ${(app.users as any)?.full_name}? This will revoke admission.`)) return;
        const fd = new FormData();
        fd.append('application_id', app.id);
        
        const res = await fetch('?/revertApproval', { method: 'POST', body: fd });
        const result = deserialize(await res.text()) as any;
        if (result.type === 'success') {
            toastStore.success('Reverted');
            await invalidateAll();
        } else {
            toastStore.error(result.data?.message || 'Error reverting.');
        }
    }

    function formatKey(key: string) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function isMeritField(value: any): value is { value: any; max_score: any } {
        return typeof value === 'object' && value !== null && 'value' in value && 'max_score' in value;
    }

    function getMeritNumber(app: any): string | number {
        if (!app) return '-';
        
        // Prioritize calculated merit rank from merit_list_entries table (even if unpublished)
        const meritEntry = Array.isArray((app as any).merit_list_entries) 
            ? (app as any).merit_list_entries[0] 
            : (app as any).merit_list_entries;
        if (meritEntry?.merit_rank !== undefined && meritEntry?.merit_rank !== null && meritEntry?.merit_rank !== '') {
            return meritEntry.merit_rank;
        }

        // Fallback to manual/ACPC merit number in form_data
        const formData = app.form_data;
        if (!formData) return '-';
        let data = formData;
        if (typeof formData === 'string') {
            try {
                data = JSON.parse(formData);
            } catch (e) {
                return '-';
            }
        }
        if (!data || typeof data !== 'object') return '-';
        const candidateKeys = ['acpc_merit_number', 'merit_number', 'merit_no', 'merit'];
        for (const key of candidateKeys) {
            const val = data[key];
            if (val !== undefined && val !== null && val !== '') {
                if (typeof val === 'object' && val !== null) {
                    if ('value' in val) {
                        return val.value ?? '-';
                    }
                }
                return val;
            }
        }
        return '-';
    }

    // --- Print Profile Logic ---
    let showPrintModal = false;
    let selectedPrintTemplate = '';
    let filteredPrintTemplates: any[] = [];
    let printTargetAppId = '';

    function handlePrintClick(app: any) {
        printTargetAppId = app.id;
        const appFormTypeId = data.formTypesMap[app.form_type];
        const appCourseId = app.course_id;
        
        const acYearRaw = app.admission_cycles?.academic_years;
        const acYear = Array.isArray(acYearRaw) ? acYearRaw[0] : acYearRaw;
        const appAcademicYearId = acYear?.id;
        
        filteredPrintTemplates = (data.printTemplates || []).filter((t: any) => {
            const matchesFormType = !t.target_form_type_id || t.target_form_type_id === appFormTypeId;
            const matchesAcademicYear = !t.target_academic_year_id || t.target_academic_year_id === appAcademicYearId;
            const matchesCourse = !t.target_course_id || t.target_course_id === appCourseId;
            return matchesFormType && matchesAcademicYear && matchesCourse;
        });

        if (filteredPrintTemplates.length === 0) {
            toastStore.error('No print templates available for this application.');
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
            toastStore.error('Please select a template.');
            return;
        }
        window.open(`/print-profile/${printTargetAppId}?templateId=${selectedPrintTemplate}`, '_blank');
        showPrintModal = false;
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Applications Management</h1>
    </div>

    <!-- Controls -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-4">
                    <div class="input-group">
                        <input type="text" class="form-control" placeholder="Search Name, Email..." 
                               bind:value={searchQuery} on:keydown={handleKeydown}>
                        <button class="btn btn-primary" on:click={triggerSearch}>
                            <i class="bi bi-search"></i> Search
                        </button>
                    </div>
                </div>
                <div class="col-md-3">
                    <select class="form-select" value={data.formTypeFilter || 'all'} on:change={handleFormTypeChange}>
                        <option value="all">All Form Types</option>
                        {#if data.formTypesMap}
                            {#each Object.keys(data.formTypesMap) as type}
                                <option value={type}>{type}</option>
                            {/each}
                        {/if}
                    </select>
                </div>
                <div class="col-md-3">
                    <select class="form-select" value={data.courseId || 'all'} on:change={handleCourseChange}>
                        <option value="all">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name} ({course.code})</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <select class="form-select" value={data.branchId || 'all'} disabled={!data.courseId || data.courseId === 'all'} on:change={handleBranchChange}>
                        {#if !data.courseId || data.courseId === 'all'}
                            <option value="all">Select course first</option>
                        {:else}
                            <option value="all">All Branches</option>
                            {#each filteredBranches as branch}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>
            </div>
        </div>
    </div>

    <!-- Tabs -->
    <div class="card">
        <div class="card-header">
            <ul class="nav nav-tabs card-header-tabs">
                <li class="nav-item">
                    <a 
                        href={getTabUrl('verified')}
                        class="nav-link {activeTab === 'verified' ? 'active' : ''}"
                        data-sveltekit-noscroll
                        data-sveltekit-keepfocus
                    >
                        Pending Verification
                    </a>
                </li>
                <li class="nav-item">
                    <a 
                        href={getTabUrl('approved')}
                        class="nav-link {activeTab === 'approved' ? 'active' : ''}"
                        data-sveltekit-noscroll
                        data-sveltekit-keepfocus
                    >
                        Approved List
                    </a>
                </li>
            </ul>
        </div>
    </div>

    <!-- Table View -->
    <div class="card shadow-sm border-top-0 rounded-top-0">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th>Sr. No.</th>
                            <th>Student</th>
                            <th>Course / Branch</th>
                            <th>Cycle</th>
                            <th style="cursor: pointer; user-select: none;" on:click={() => handleSort('submitted_at')}>
                                Submitted
                                {#if sortField === 'submitted_at'}
                                    <i class="bi bi-arrow-{sortOrder === 'asc' ? 'up' : 'down'} ms-1"></i>
                                {/if}
                            </th>
                            <th style="cursor: pointer; user-select: none;" on:click={() => handleSort('merit_rank')}>
                                Merit No
                                {#if sortField === 'merit_rank'}
                                    <i class="bi bi-arrow-{sortOrder === 'asc' ? 'up' : 'down'} ms-1"></i>
                                {/if}
                            </th>
                            <th>Status</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.applications as app, i}
                            <tr>
                                <td class="text-muted fw-semibold">{offset + i + 1}</td>
                                <td>
                                    <div class="fw-bold">{(app.users as any)?.full_name || 'Unknown'}</div>
                                    <small class="text-muted">{(app.users as any)?.email}</small>
                                </td>
                                <td>
                                    {(app.courses as any)?.name}
                                    {#if (app.branches as any)?.name}
                                        <br><span class="badge bg-secondary text-light">{(app.branches as any).name}</span>
                                    {:else if (app as any).prov_branch_name}
                                        <br>
                                        <span class="text-muted small">{(app as any).prov_branch_name}</span>
                                        <small class="badge bg-light text-dark border ms-1" style="font-size: 0.65rem;" title="Branch from provisional application">Prov</small>
                                    {/if}
                                    <div class="small text-muted">{(app.courses as any)?.colleges?.name}</div>
                                </td>
                                <td>{Array.isArray(app.admission_cycles) ? (app.admission_cycles as any)[0]?.name : (app.admission_cycles as any)?.name}</td>
                                <td>{new Date(app.submitted_at).toLocaleDateString()}</td>
                                <td>{getMeritNumber(app)}</td>
                                <td>
                                    <span class="badge {app.status === 'approved' ? 'bg-success' : 'bg-info'}">
                                        {app.status}
                                    </span>
                                    {#if app.approval_comment}
                                        <span class="badge bg-light text-dark border ms-1" title="Approval Comment">
                                            <i class="bi bi-chat-left-text me-1"></i>{app.approval_comment}
                                        </span>
                                    {/if}
                                </td>
                                <td class="text-end text-nowrap">
                                    <button class="btn btn-sm btn-outline-info me-1" on:click={() => handlePrintClick(app)} title="Print Profile">
                                        <i class="bi bi-printer"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => viewDetails(app)} title="View Details">
                                        <i class="bi bi-eye"></i>
                                    </button>
 
                                    {#if activeTab === 'verified'}
                                        <button class="btn btn-sm btn-success me-1" on:click={() => openApproveModal(app)} title="Approve">
                                            <i class="bi bi-check-lg"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning me-1" on:click={() => openWaitlistModal(app)} title="Waitlist">
                                            <i class="bi bi-hourglass"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" on:click={() => openRejectModal(app)} title="Reject">
                                            <i class="bi bi-x-lg"></i>
                                        </button>
                                    {:else if activeTab === 'approved'}
                                        <a href="/receipts/admission/{app.id}?print=1" target="_blank" class="btn btn-sm btn-outline-primary me-1" title="Print Admission Slip">
                                            <i class="bi bi-printer"></i> Slip
                                        </a>
                                        <button class="btn btn-sm btn-outline-danger" on:click={() => revertApp(app)} title="Revert Approval">
                                            <i class="bi bi-arrow-counterclockwise"></i>
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="8" class="text-center py-5 text-muted">No applications found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
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

<!-- Details Modal -->
{#if showDetailsModal && selectedApplication}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Application Details</h5>
                <button type="button" class="btn-close" on:click={() => showDetailsModal = false}></button>
            </div>
            <div class="modal-body">
                <div class="row mb-3">
                    <div class="col-md-6">
                        <h6>Student Info</h6>
                        <p class="mb-1"><strong>Name:</strong> {(selectedApplication.users as any)?.full_name}</p>
                        <p class="mb-1"><strong>Email:</strong> {(selectedApplication.users as any)?.email}</p>
                    </div>
                    <div class="col-md-6">
                        <h6>Status & Course</h6>
                        <p class="mb-1"><strong>Current:</strong> {selectedApplication.status}</p>
                        <p class="mb-1"><strong>Form Type:</strong> {selectedApplication.form_type}</p>
                        <p class="mb-1"><strong>Course:</strong> {(selectedApplication.courses as any)?.name} 
                            {#if (selectedApplication.branches as any)?.name} 
                                <span class="badge bg-secondary">{(selectedApplication.branches as any).name}</span>
                            {:else if (selectedApplication as any).prov_branch_name}
                                <span class="badge bg-light text-dark border" title="Branch from provisional application">{(selectedApplication as any).prov_branch_name} <small class="text-muted ms-1">Prov</small></span>
                            {/if}
                        </p>
                    </div>
                </div>
                
                <h6>Form Data</h6>
                <div class="bg-light p-3 rounded mb-3">
                    {#if selectedApplication.form_data && Object.keys(selectedApplication.form_data).length > 0}
                        <dl class="row mb-0">
                            {#each Object.entries(selectedApplication.form_data) as [key, value]}
                                <dt class="col-sm-4 text-muted small text-uppercase">{formatKey(key)}</dt>
                                <dd class="col-sm-8">
                                    {#if isMeritField(value)}
                                        <span class="fw-bold">{value.value}</span> / {value.max_score}
                                    {:else if typeof value === 'object' && value !== null}
                                        <pre class="mb-0 small">{JSON.stringify(value)}</pre>
                                    {:else}
                                        {value}
                                    {/if}
                                </dd>
                            {/each}
                        </dl>
                    {:else}
                        <p class="text-muted mb-0">No data available.</p>
                    {/if}
                </div>

                <h6>Documents</h6>
                {#if selectedApplication.documents?.length > 0}
                    <div class="table-responsive">
                        <table class="table table-striped table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>View</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each selectedApplication.documents as doc}
                                    <tr>
                                        <td>{doc.document_type}</td>
                                        <td>
                                            <a href={doc.signed_url || '#'} target="_blank" class="btn btn-sm btn-outline-primary py-0">
                                                View <i class="bi bi-box-arrow-up-right ms-1"></i>
                                            </a>
                                        </td>
                                        <td><span class="badge {doc.status === 'approved' ? 'bg-success' : doc.status === 'rejected' ? 'bg-danger' : 'bg-warning'}">{doc.status}</span></td>
                                        <td>{doc.rejection_reason || 'N/A'}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {:else}
                    <p class="text-muted">No documents.</p>
                {/if}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showDetailsModal = false}>Close</button>
                {#if activeTab === 'verified'}
                    <button class="btn btn-success" on:click={() => openApproveModal(selectedApplication)}>Approve</button>
                {/if}
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Approve Modal -->
{#if showApproveModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Confirm Approval</h5>
                <button type="button" class="btn-close" on:click={() => showApproveModal = false}></button>
            </div>
            <div class="modal-body">
                <p>Select Branch for {(selectedApplication?.users as any)?.full_name}:</p>
                {#if (selectedApplication?.courses as any)?.branches}
                    <select class="form-select mb-3" bind:value={selectedBranchId}>
                        <option value="">-- Select Branch --</option>
                        {#each (selectedApplication.courses as any).branches as branch}
                            <option value={branch.id}>{branch.name} ({getBranchDisplayCode(branch.name, branch.code)})</option>
                        {/each}
                    </select>
                {/if}
                <label class="form-label">Approval Comment (Optional)</label>
                <textarea class="form-control" bind:value={applicationApprovalComment} placeholder="Add a comment..." rows="2"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showApproveModal = false}>Cancel</button>
                <button class="btn btn-success" on:click={submitApproval} disabled={!selectedBranchId && (selectedApplication?.courses as any)?.branches?.length > 0}>Confirm</button>
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Waitlist Modal -->
{#if showWaitlistModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Waitlist Application</h5>
                <button type="button" class="btn-close" on:click={() => showWaitlistModal = false}></button>
            </div>
            <div class="modal-body">
                <p>Waitlist application for {(selectedApplication?.users as any)?.full_name}?</p>
                <label class="form-label">Comment (Optional)</label>
                <textarea class="form-control" bind:value={applicationApprovalComment} placeholder="Add a comment..." rows="2"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showWaitlistModal = false}>Cancel</button>
                <button class="btn btn-warning" on:click={submitWaitlist}>Waitlist</button>
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Reject Modal -->
{#if showRejectionReasonModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Reject Application</h5>
                <button type="button" class="btn-close" on:click={() => showRejectionReasonModal = false}></button>
            </div>
            <div class="modal-body">
                <textarea class="form-control" bind:value={applicationRejectionReason} placeholder="Reason for rejection..." rows="3"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showRejectionReasonModal = false}>Cancel</button>
                <button class="btn btn-danger" on:click={submitReject}>Reject</button>
            </div>
        </div>
    </div>
</div>
{/if}

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
