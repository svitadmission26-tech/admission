<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    console.log('Total Amount Collected (frontend):', data.totalAmountCollected);

    let searchText = data.filters?.search || '';

    function applyFilter(status: string | null) {
        const url = new URL($page.url);
        if (status) {
            url.searchParams.set('status', status);
        } else {
            url.searchParams.delete('status');
        }
        // Keep search param if exists
        goto(url.toString());
    }

    function handleStatusToggle(status: string) {
        const url = new URL($page.url);
        let currentStatuses = url.searchParams.get('status')?.split(',').filter(Boolean) || [];
        
        if (currentStatuses.includes(status)) {
            currentStatuses = currentStatuses.filter(s => s !== status);
        } else {
            currentStatuses = [...currentStatuses, status];
        }

        if (currentStatuses.length > 0) {
            url.searchParams.set('status', currentStatuses.join(','));
        } else {
            url.searchParams.delete('status');
        }
        
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function handleSearch() {
        const url = new URL($page.url);
        if (searchText) {
            url.searchParams.set('search', searchText);
        } else {
            url.searchParams.delete('search');
        }
        // Reset status on new search? Optional. Let's keep it combined.
        goto(url.toString());
    }

    function clearFilters() {
        searchText = '';
        goto('/adm-officer/dashboard');
    }

    function handleSort(field: string) {
        const url = new URL($page.url);
        const currentSort = url.searchParams.get('sort');
        const currentOrder = url.searchParams.get('order') || 'desc';
        
        let newOrder = 'desc';
        if (currentSort === field && currentOrder === 'desc') {
            newOrder = 'asc';
        }
        
        url.searchParams.set('sort', field);
        url.searchParams.set('order', newOrder);
        goto(url.toString());
    }

    function handlePage(newPage: number) {
        if (newPage < 1 || newPage > data.pagination.totalPages) return;
        const url = new URL($page.url);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    function handleFilterChange(key: string, value: string) {
        const url = new URL($page.url);
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
        
        // If course changes, reset branch
        if (key === 'course') {
            url.searchParams.delete('branch');
        }

        url.searchParams.set('page', '1'); // Reset to first page
        goto(url.toString());
    }

    function handleFormTypeToggle(type: string) {
        const url = new URL($page.url);
        let currentTypes = url.searchParams.get('form_type')?.split(',').filter(Boolean) || [];
        
        // If param is missing, server defaults to 'Provisional'
        if (!url.searchParams.has('form_type')) {
            currentTypes = ['Provisional'];
        }

        if (currentTypes.includes(type)) {
            // Prevent removing last type if we want to avoid accidental "show all" if default was intended
            // But usually, it's better to allow it. 
            currentTypes = currentTypes.filter(t => t !== type);
        } else {
            currentTypes = [...currentTypes, type];
        }

        if (currentTypes.length > 0) {
            url.searchParams.set('form_type', currentTypes.join(','));
        } else {
            url.searchParams.delete('form_type');
        }
        
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function handleLimitChange(newLimit: number) {
        const url = new URL($page.url);
        url.searchParams.set('limit', newLimit.toString());
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    // Export URL builder
    $: exportUrl = `/adm-officer/export${$page.url.search}`;

    // Reactive branch filtering
    $: filteredBranchOptions = data.filters.course 
        ? data.options.branches.filter(b => b.course_id === data.filters.course)
        : data.options.branches;

    // Reactive branch stats filtering
    $: filteredBranchCounts = data.filters.course
        ? data.branchCounts.filter(b => b.course_id === data.filters.course)
        : data.branchCounts;

    // Dialog state for approval comment editing
    let showCommentDialog = false;
    let selectedApp: any = null;
    let commentText = '';

    function openCommentDialog(app: any) {
        selectedApp = app;
        commentText = app.approval_comment || '';
        showCommentDialog = true;
    }

    function closeCommentDialog() {
        showCommentDialog = false;
        selectedApp = null;
        commentText = '';
    }

    async function saveComment() {
        if (!selectedApp) return;

        try {
            const response = await fetch('/adm-officer/dashboard/update-comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    applicationId: selectedApp.id,
                    comment: commentText.trim() || null
                })
            });

            if (response.ok) {
                // Refresh the page to show updated data
                location.reload();
            } else {
                alert('Failed to update comment');
            }
        } catch (error) {
            console.error('Error updating comment:', error);
            alert('Error updating comment');
        }
    }

    // --- Configurable Columns Logic ---
    const allColumns = [
        { id: 'sr_no', label: 'Sr. No', default: true },
        { id: 'app_id', label: 'App ID', default: false },
        { id: 'college_id', label: 'College ID', default: true },
        { id: 'student', label: 'Student', default: true },
        { id: 'course', label: 'Course', default: true },
        { id: 'branch', label: 'Branch', default: true },
        { id: 'form_type', label: 'Form Type', default: true },
        { id: 'status', label: 'Status', default: true },
        { id: 'receipt', label: 'Receipt', default: true },
        { id: 'comment', label: 'Approval Comment', default: true },
        { id: 'date', label: 'Date', default: false },
        { id: 'fee_status', label: 'Fee Status', default: false },
        { id: 'actions', label: 'Actions', default: true }
    ];

    let visibleColumns = allColumns.filter(c => c.default).map(c => c.id);
    let showColumnDrawer = false;

    function toggleColumn(id: string) {
        if (visibleColumns.includes(id)) {
            // Prevent removing all columns
            if (visibleColumns.length > 1) {
                visibleColumns = visibleColumns.filter(c => c !== id);
            }
        } else {
            visibleColumns = [...visibleColumns, id];
        }
    }

</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="mb-0">Admission Officer Dashboard</h1>
        <div class="d-flex gap-2">
            <a href="/adm-officer/capacity-report" class="btn btn-outline-success">
                <i class="bi bi-bar-chart-line"></i> Capacity Report
            </a>
            <a href={exportUrl} class="btn btn-outline-primary" download>
                <i class="bi bi-file-earmark-spreadsheet"></i> Export List
            </a>
        </div>
    </div>

    <!-- Top Stats Rows -->
    <div class="row">
        <div class="col-md-3 mb-4">
            <div class="card text-white bg-primary mb-3 shadow-sm h-100">
                <div class="card-header fw-bold">Total Applications</div>
                <div class="card-body">
                    <h5 class="card-title display-6">{data.totalApplications}</h5>
                </div>
            </div>
        </div>
        <div class="col-md-3 mb-4">
            <div class="card text-white bg-success mb-3 shadow-sm h-100">
                <div class="card-header fw-bold">App Fees Collected</div>
                <div class="card-body">
                    <h5 class="card-title display-6">₹{data.totalAmountCollected.toLocaleString()}</h5>
                </div>
            </div>
        </div>
        <div class="col-md-3 mb-4">
            <div class="card text-white bg-info mb-3 shadow-sm h-100">
                <div class="card-header fw-bold">Prov. Fees Collected</div>
                <div class="card-body">
                    <h5 class="card-title display-6">₹{data.totalProvFeesCollected?.toLocaleString() || '0'}</h5>
                </div>
            </div>
        </div>
        <div class="col-md-3 mb-4">
            <a href="/adm-officer/inquiries" class="text-decoration-none">
                <div class="card text-white bg-secondary mb-3 shadow-sm h-100">
                    <div class="card-header fw-bold d-flex justify-content-between align-items-center">
                        <span>Inquiry Conversion</span>
                        <i class="bi bi-chat-left-dots"></i>
                    </div>
                    <div class="card-body">
                        <h5 class="card-title display-6">{data.processedInquiries} / {data.totalInquiries}</h5>
                        <p class="card-text small opacity-75 mb-0">Processed in {data.activeYearName}</p>
                        <p class="card-text smaller opacity-50">{data.totalInquiries - data.processedInquiries} students remaining</p>
                    </div>
                </div>
            </a>
        </div>
    </div>

    <div class="row">
        <!-- Status Filters (Clickable) -->
        <div class="col-md-4 mb-4">
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span>Applications by Status</span>
                    {#if $page.url.searchParams.has('status')}
                        <button class="btn btn-sm btn-outline-dark" on:click={() => applyFilter(null)}>Clear</button>
                    {/if}
                </div>
                <div class="card-body">
                    {#if data.statusCounts && data.statusCounts.length > 0}
                        {@const selectedStatuses = data.filters.status?.split(',') || []}
                        <div class="list-group list-group-flush">
                            {#each data.statusCounts as statusCount}
                                {@const isActive = selectedStatuses.includes(statusCount.status)}
                                <button 
                                    class="list-group-item list-group-item-action d-flex justify-content-between align-items-center {isActive ? 'active' : ''}"
                                    on:click={() => handleStatusToggle(statusCount.status)}
                                >
                                    {statusCount.status}
                                    <span class="badge {isActive ? 'bg-light text-dark' : 'bg-primary'} rounded-pill">
                                        {statusCount.count}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <p class="card-text">No application status data available.</p>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Form Type Filters (Clickable) -->
        <div class="col-md-4 mb-4">
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span>Applications by Type</span>
                    {#if $page.url.searchParams.has('form_type')}
                        <button class="btn btn-sm btn-outline-dark" on:click={() => handleFilterChange('form_type', '')}>Clear</button>
                    {/if}
                </div>
                <div class="card-body">
                    {#if data.formTypeCounts && data.formTypeCounts.length > 0}
                        {@const selectedTypes = data.filters.form_type?.split(',') || []}
                        <div class="list-group list-group-flush">
                            {#each data.formTypeCounts as typeCount}
                                {@const isActive = selectedTypes.includes(typeCount.form_type)}
                                <button 
                                    class="list-group-item list-group-item-action d-flex justify-content-between align-items-center {isActive ? 'active' : ''}"
                                    on:click={() => handleFormTypeToggle(typeCount.form_type)}
                                >
                                    {typeCount.form_type || 'N/A'}
                                    <span class="badge {isActive ? 'bg-light text-dark' : 'bg-primary'} rounded-pill">
                                        {typeCount.count}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <p class="card-text">No form type data available.</p>
                    {/if}
                </div>
            </div>
        </div>

        <div class="col-md-4 mb-4">
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span>Applications by Course</span>
                    {#if data.filters.course}
                        <button class="btn btn-sm btn-outline-dark" on:click={() => handleFilterChange('course', '')}>Clear</button>
                    {/if}
                </div>
                <div class="card-body">
                    {#if data.courseCounts && data.courseCounts.length > 0}
                        <div class="list-group list-group-flush">
                            {#each data.courseCounts as courseCount}
                                <button 
                                    class="list-group-item list-group-item-action d-flex justify-content-between align-items-center {data.filters.course === courseCount.course_name ? 'active' : ''}"
                                    on:click={() => {
                                        // Find course ID from name (since count returns name)
                                        // Wait, get_application_course_counts returns course_name. 
                                        // We need ID to filter. 
                                        // We can match name against allCourses options to get ID.
                                        const course = data.options.courses.find(c => c.name === courseCount.course_name);
                                        if (course) handleFilterChange('course', course.id);
                                    }}
                                >
                                    {courseCount.course_name}
                                    <span class="badge {data.filters.course === courseCount.course_name ? 'bg-light text-dark' : 'bg-primary'} rounded-pill">
                                        {courseCount.count}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <p class="card-text">No application course data available.</p>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <!-- Application Search & List -->
    <div class="card mt-4">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <h5 class="mb-0">
                                Application List 
                                {#if $page.url.searchParams.has('status')}
                                    <span class="badge bg-secondary ms-2">Status: {data.filters.status}</span>
                                {/if}
                                {#if data.filters.course}
                                    {@const cName = data.options.courses.find(c => c.id === data.filters.course)?.name}
                                    <span class="badge bg-info ms-2">Course: {cName}</span>
                                {/if}
                                {#if $page.url.searchParams.has('form_type')}
                                    <span class="badge bg-warning text-dark ms-2">Type: {data.filters.form_type}</span>
                                {/if}
                            </h5>
                            <span class="badge bg-light text-dark border">{data.pagination.total} Total</span>
                        </div>
                        
                        <div class="d-flex align-items-center gap-3">
                            <button class="btn btn-sm btn-outline-secondary" on:click={() => showColumnDrawer = true}>
                                <i class="bi bi-layout-three-columns me-1"></i> Columns
                            </button>
                            <div class="d-flex align-items-center gap-2">
                                <small class="text-muted">Per Page:</small>
                                <select class="form-select form-select-sm" style="width: auto;" value={data.pagination.limit} on:change={(e) => handleLimitChange(parseInt(e.currentTarget.value))}>
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </div>

                            {#if data.pagination.totalPages > 1}
                                <div class="d-flex align-items-center gap-2">
                                    <small class="text-muted text-nowrap">Page {data.pagination.page} of {data.pagination.totalPages}</small>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-outline-secondary" disabled={data.pagination.page === 1} on:click={() => handlePage(data.pagination.page - 1)}>
                                            <i class="bi bi-chevron-left"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-secondary" disabled={data.pagination.page >= data.pagination.totalPages} on:click={() => handlePage(data.pagination.page + 1)}>
                                            <i class="bi bi-chevron-right"></i>
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                        <div class="d-flex gap-2 flex-wrap align-items-center">
                            <!-- Filters -->
                            <select class="form-select form-select-sm" style="max-width: 250px;" value={data.filters.branch || ''} on:change={(e) => handleFilterChange('branch', e.currentTarget.value)}>
                                <option value="">All Branches</option>
                                {#each filteredBranchOptions as branch}
                                    {@const branchAny = branch as any}
                                    <option value={branch.id}>{branch.name} ({branchAny.courses?.name || 'Unknown'})</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                    
                    <!-- Search Row -->
                    <div class="d-flex gap-2">
                        <input 
                            type="text" 
                            class="form-control form-control-sm" 
                            style="max-width: 300px;"
                            placeholder="Search Name/Email..." 
                            bind:value={searchText}
                            on:keydown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <button class="btn btn-sm btn-primary" on:click={handleSearch}>Search</button>
                        {#if data.filters.status || data.filters.search || data.filters.course || data.filters.branch || data.filters.form_type}
                            <button class="btn btn-sm btn-outline-secondary" on:click={clearFilters}>Reset</button>
                        {/if}
                    </div>
                </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            {#if visibleColumns.includes('sr_no')} <th>Sr. No</th> {/if}
                            {#if visibleColumns.includes('app_id')} <th>App ID</th> {/if}
                            {#if visibleColumns.includes('college_id')} <th>College ID</th> {/if}
                            {#if visibleColumns.includes('student')}
                                <th style="cursor: pointer;" on:click={() => handleSort('student_name')}>
                                    Student {data.filters.sort === 'student_name' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            {/if}
                            {#if visibleColumns.includes('course')} <th>Course</th> {/if}
                            {#if visibleColumns.includes('branch')} <th>Branch</th> {/if}
                            {#if visibleColumns.includes('form_type')} <th>Form Type</th> {/if}
                            {#if visibleColumns.includes('status')}
                                <th style="cursor: pointer;" on:click={() => handleSort('status')}>
                                    Status {data.filters.sort === 'status' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            {/if}
                            {#if visibleColumns.includes('receipt')}
                                <th style="cursor: pointer;" on:click={() => handleSort('receipt_number')}>
                                    Receipt {data.filters.sort === 'receipt_number' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            {/if}
                            {#if visibleColumns.includes('comment')} <th>Approval Comment</th> {/if}
                            {#if visibleColumns.includes('date')}
                                <th style="cursor: pointer;" on:click={() => handleSort('updated_at')}>
                                    Date {data.filters.sort === 'updated_at' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            {/if}
                            {#if visibleColumns.includes('fee_status')} <th>Fee Status</th> {/if}
                            {#if visibleColumns.includes('actions')} <th>Actions</th> {/if}
                        </tr>
                    </thead>
                    <tbody>
                        {#if data.filteredApplications && data.filteredApplications.length > 0}
                            {#each data.filteredApplications as app, index}
                                {@const appAny = app as any}
                                {@const isProvType = data.formTypesMap?.[app.form_type] === true}
                                {@const appReceiptPayment = (appAny.payments || []).find(p => p.payment_type === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) || (appAny.payments || []).find(p => p.receipt_number)}
                                <tr>
                                    {#if visibleColumns.includes('sr_no')} <td>{(data.pagination.page - 1) * data.pagination.limit + index + 1}</td> {/if}
                                    {#if visibleColumns.includes('app_id')} <td><small>{app.id.slice(0, 8)}...</small></td> {/if}
                                    {#if visibleColumns.includes('college_id')}
                                        <td>
                                            {#if appAny.users?.student_profiles?.enrollment_number}
                                                <span class="badge bg-light text-dark border font-monospace">{appAny.users.student_profiles.enrollment_number}</span>
                                            {:else if appAny.users?.student_profiles?.[0]?.enrollment_number}
                                                <span class="badge bg-light text-dark border font-monospace">{appAny.users.student_profiles[0].enrollment_number}</span>
                                            {:else}
                                                <small class="text-muted">-</small>
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('student')}
                                        <td>
                                            <div>{appAny.users?.full_name || 'N/A'}</div>
                                            <small class="text-muted">{appAny.users?.email || 'N/A'}</small>
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('course')}
                                        <td>
                                            <div>{appAny.courses?.name || 'N/A'}</div>
                                            <small class="text-muted">{appAny.courses?.colleges?.name || ''}</small>
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('branch')}
                                        <td>
                                            {#if appAny.branches?.name}
                                                {appAny.branches.name}
                                            {:else if appAny.prov_branch_name}
                                                <span class="text-muted">{appAny.prov_branch_name}</span>
                                                <small class="badge bg-light text-dark border ms-1" style="font-size: 0.65rem;" title="Branch from provisional application">Prov</small>
                                            {:else}
                                                <small class="text-muted">-</small>
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('form_type')}
                                        <td>
                                            <span class="badge bg-light text-dark border">{app.form_type || 'N/A'}</span>
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('status')}
                                        <td>
                                            <span class="badge 
                                                {app.status === 'approved' ? 'bg-success' : ''}
                                                {app.status === 'rejected' ? 'bg-danger' : ''}
                                                {app.status === 'verified' ? 'bg-info' : ''}
                                                {app.status === 'submitted' ? 'bg-primary' : ''}
                                                {app.status === 'needs_correction' ? 'bg-warning' : ''}
                                                {app.status === 'draft' ? 'bg-secondary' : ''}
                                            ">
                                                {app.status}
                                            </span>
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('receipt')}
                                        <td class="text-nowrap">
                                            {#if appReceiptPayment?.receipt_number}
                                                <small class="fw-bold">{appReceiptPayment.receipt_number}</small>
                                            {:else}
                                                <small class="text-muted">-</small>
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('comment')}
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <small class="text-muted">{app.approval_comment || '-'}</small>
                                                <button 
                                                    class="btn btn-sm btn-outline-secondary p-1" 
                                                    on:click={() => openCommentDialog(app)}
                                                    title="Edit approval comment"
                                                >
                                                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                                                        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5H9v-.5a.5.5 0 0 1 .5-.5h.5V9a.5.5 0 0 1 .5-.5h.5v-.5a.5.5 0 0 1 .5-.5zM10 6.207V7h1v1h1v1H9V9H8V8H7V7h1V6.207l.146-.146z"/>
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('date')} <td>{new Date(app.updated_at).toLocaleDateString()}</td> {/if}
                                    {#if visibleColumns.includes('fee_status')}
                                        <td>
                                            <span class="badge 
                                                {app.application_fee_status === 'paid' ? 'bg-success' : ''}
                                                {app.application_fee_status === 'pending' ? 'bg-danger' : ''}
                                                {app.application_fee_status === 'not_applicable' ? 'bg-secondary' : ''}
                                                {app.application_fee_status === 'waived' ? 'bg-info' : ''}
                                            ">
                                                {app.application_fee_status === 'not_applicable' ? 'N/A' : app.application_fee_status}
                                            </span>
                                        </td>
                                    {/if}
                                    {#if visibleColumns.includes('actions')}
                                        <td>
                                            <a href="/adm-officer/applications/{app.id}" class="btn btn-sm btn-outline-primary">View</a>
                                        </td>
                                    {/if}
                                </tr>
                            {/each}
                        {:else}
                            <tr>
                                <td colspan={visibleColumns.length} class="text-center py-4">No applications found matching your filters.</td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        </div>
        <div class="card-footer">
            <nav aria-label="Page navigation">
                <ul class="pagination justify-content-center mb-0">
                    <li class="page-item {data.pagination.page === 1 ? 'disabled' : ''}">
                        <button class="page-link" on:click={() => handlePage(data.pagination.page - 1)}>Previous</button>
                    </li>
                    <li class="page-item disabled">
                        <span class="page-link">
                            Page {data.pagination.page} of {data.pagination.totalPages}
                        </span>
                    </li>
                    <li class="page-item {data.pagination.page >= data.pagination.totalPages ? 'disabled' : ''}">
                        <button class="page-link" on:click={() => handlePage(data.pagination.page + 1)}>Next</button>
                    </li>
                </ul>
            </nav>
        </div>
    </div>

    <!-- Approval Comment Edit Dialog -->
    {#if showCommentDialog}
        <div class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit Approval Comment</h5>
                        <button type="button" class="btn-close" on:click={closeCommentDialog}></button>
                    </div>
                    <div class="modal-body">
                        {#if selectedApp}
                            <div class="mb-3">
                                <label for="commentText" class="form-label">
                                    <strong>Application:</strong> {selectedApp.id.slice(0, 8)}... - {(selectedApp as any).users?.full_name || 'N/A'}
                                </label>
                                <textarea 
                                    id="commentText"
                                    class="form-control" 
                                    rows="4" 
                                    placeholder="Enter approval comment..."
                                    bind:value={commentText}
                                ></textarea>
                                <div class="form-text">
                                    Leave empty to remove the comment.
                                </div>
                            </div>
                        {/if}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={closeCommentDialog}>Cancel</button>
                        <button type="button" class="btn btn-primary" on:click={saveComment}>Save Comment</button>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Column Selection Modal -->
    {#if showColumnDrawer}
        <div class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);" tabindex="-1">
            <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Configure Columns</h5>
                        <button type="button" class="btn-close" on:click={() => showColumnDrawer = false}></button>
                    </div>
                    <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
                        <div class="list-group list-group-flush">
                            {#each allColumns as col}
                                <label class="list-group-item d-flex gap-2 align-items-center" style="cursor: pointer;">
                                    <input 
                                        type="checkbox" 
                                        class="form-check-input mt-0" 
                                        checked={visibleColumns.includes(col.id)}
                                        on:change={() => toggleColumn(col.id)}
                                    >
                                    <span>{col.label}</span>
                                </label>
                            {/each}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary w-100" on:click={() => showColumnDrawer = false}>Done</button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>