<script lang="ts">
    import type { PageData } from './$types';
    import { page } from '$app/stores';
    import { goto, invalidateAll } from '$app/navigation';
    import { enhance } from '$app/forms';

    export let data: PageData;

    let filters = {
        course: $page.url.searchParams.get('course') || '',
        branch: $page.url.searchParams.get('branch') || '',
        status: $page.url.searchParams.get('status') || '',
        start_date: $page.url.searchParams.get('start_date') || new Date().toISOString().split('T')[0],
        end_date: $page.url.searchParams.get('end_date') || new Date().toISOString().split('T')[0]
    };

    const availableFields = [
        { key: 'transaction_id', label: 'Transaction ID', default: true },
        { key: 'payment_date', label: 'Payment Date', default: true },
        { key: 'amount', label: 'Amount', default: true },
        { key: 'status', label: 'Payment Status', default: true },
        { key: 'student_name', label: 'Student Name', default: true },
        { key: 'admission_no', label: 'Admission Number', default: true },
        { key: 'course', label: 'Course', default: true },
        { key: 'branch', label: 'Branch', default: true },
        { key: 'college', label: 'College', default: false },
        { key: 'enrollment_number', label: 'College ID', default: false },
        { key: 'admission_type', label: 'Admission Type', default: false },
        { key: 'application_id', label: 'Application ID', default: false }
    ];

    let selectedKeys = availableFields.filter(f => f.default).map(f => f.key);
    
    // Vars for Template UI
    let showSaveModal = false;
    let templateName = '';
    let templateDesc = '';
    let selectedTemplateId = '';

    // Sync filters with URL params
    $: {
        filters.course = $page.url.searchParams.get('course') || '';
        filters.branch = $page.url.searchParams.get('branch') || '';
        filters.status = $page.url.searchParams.get('status') || '';
        filters.start_date = $page.url.searchParams.get('start_date') || new Date().toISOString().split('T')[0];
        filters.end_date = $page.url.searchParams.get('end_date') || new Date().toISOString().split('T')[0];
    }

    $: filteredBranchOptions = filters.course 
        ? data.options.branches.filter(b => b.course_id === filters.course)
        : data.options.branches;
    
    // Generate Report URL
    $: reportUrl = (() => {
        const params = new URLSearchParams($page.url.searchParams);
        if (selectedKeys.length > 0) {
            params.set('fields', selectedKeys.join(','));
        } else {
            params.delete('fields');
        }
        return `/fee-collector/export?${params.toString()}`;
    })();

    $: paymentSummaryExcelUrl = (() => {
        const params = new URLSearchParams();
        if (filters.course) params.set('course', filters.course);
        params.set('start_date', filters.start_date);
        params.set('end_date', filters.end_date);
        return `/api/export/payment-summary?${params.toString()}`;
    })();

    function applyFilters() {
        const params = new URLSearchParams();
        if (filters.course) params.set('course', filters.course);
        if (filters.branch) params.set('branch', filters.branch);
        if (filters.status) params.set('status', filters.status);
        if (filters.start_date) params.set('start_date', filters.start_date);
        if (filters.end_date) params.set('end_date', filters.end_date);
        goto(`?${params.toString()}`);
    }

    function clearFilters() {
        goto('/fee-collector/reports');
    }

    function selectAll() {
        selectedKeys = availableFields.map(f => f.key);
    }

    function deselectAll() {
        selectedKeys = [];
    }

    function loadTemplate() {
        if (!selectedTemplateId) return;
        const template = data.templates.find(t => t.id === selectedTemplateId);
        if (template) {
            if (template.columns && Array.isArray(template.columns)) {
                selectedKeys = template.columns;
            }
            if (template.filters) {
                filters = { ...filters, ...template.filters };
                applyFilters();
            }
        }
    }

    function openSaveModal() {
        templateName = '';
        templateDesc = '';
        showSaveModal = true;
    }

    async function deleteTemplate() {
        if (!selectedTemplateId) return;
        if (!confirm('Are you sure you want to delete this template?')) return;
        
        const form = new FormData();
        form.append('id', selectedTemplateId);
        
        const response = await fetch('?/deleteTemplate', {
            method: 'POST',
            body: form
        });
        
        if (response.ok) {
            selectedTemplateId = '';
            await invalidateAll();
        } else {
            alert('Failed to delete template');
        }
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h1>Fee & Admission Reports</h1>
        
        <div class="d-flex align-items-center gap-2">
            <label class="fw-bold mb-0">Load Template:</label>
            <select class="form-select form-select-sm w-auto" bind:value={selectedTemplateId} on:change={loadTemplate}>
                <option value="">-- Select --</option>
                {#each data.templates as template (template.id)}
                    <option value={template.id}>{template.name}</option>
                {/each}
            </select>
            {#if selectedTemplateId}
                <button class="btn btn-sm btn-outline-danger" on:click={deleteTemplate} title="Delete selected template">
                    <i class="bi bi-trash"></i>
                </button>
            {/if}
        </div>
    </div>

    <div class="row">
        <!-- Filters Column -->
        <div class="col-md-4">
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <span>Filters</span>
                    <button class="btn btn-sm btn-link text-decoration-none" on:click={clearFilters}>Reset</button>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label for="date-range" class="form-label">Payment Date Range</label>
                        <div class="input-group">
                            <input type="date" class="form-control" bind:value={filters.start_date} />
                            <span class="input-group-text">to</span>
                            <input type="date" class="form-control" bind:value={filters.end_date} />
                        </div>
                    </div>

                    <div class="mb-3">
                        <label for="status" class="form-label">Payment Status</label>
                        <select class="form-select" id="status" bind:value={filters.status}>
                            <option value="">All Statuses</option>
                            <option value="completed">Completed</option>
                            <option value="pending">Pending</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="course" class="form-label">Course</label>
                        <select class="form-select" id="course" bind:value={filters.course} on:change={() => filters.branch = ''}>
                            <option value="">All Courses</option>
                            {#each data.options.courses as course (course.id)}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="branch" class="form-label">Branch</label>
                        <select class="form-select" id="branch" bind:value={filters.branch}>
                            <option value="">All Branches</option>
                            {#each filteredBranchOptions as branch (branch.id)}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        </select>
                    </div>
                    
                    <button class="btn btn-primary w-100" on:click={applyFilters}>Apply Filters & Refresh</button>
                </div>
            </div>
        </div>

        <!-- Columns & Preview Column -->
        <div class="col-md-8">
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-light">
                    <div class="d-flex justify-content-between align-items-center">
                        <span>Report Columns</span>
                        <div>
                            <button class="btn btn-sm btn-outline-secondary" on:click={selectAll}>Select All</button>
                            <button class="btn btn-sm btn-outline-secondary" on:click={deselectAll}>Deselect All</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row g-2">
                        {#each availableFields as field (field.key)}
                        <div class="col-md-4 col-6">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="col-{field.key}" value={field.key} bind:group={selectedKeys}>
                                <label class="form-check-label" for="col-{field.key}">
                                    {field.label}
                                </label>
                            </div>
                        </div>
                        {/each}
                    </div>
                </div>
                <div class="card-footer text-end">
                    <button class="btn btn-outline-primary me-2" on:click={openSaveModal}>
                        <i class="bi bi-save"></i> Save Template
                    </button>
                    <div class="btn-group">
                        <a href={reportUrl} target="_blank" class="btn btn-success">
                            <i class="bi bi-download me-2"></i> CSV
                        </a>
                        <a href={paymentSummaryExcelUrl} target="_blank" class="btn btn-primary">
                            <i class="bi bi-file-earmark-excel me-2"></i> Summary Excel
                        </a>
                    </div>
                </div>
            </div>
            
            <!-- Preview Table -->
            <div class="card shadow-sm">
                <div class="card-header bg-light">
                    Report Preview <small class="text-muted">(Top 10 matching records)</small>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Transaction ID</th>
                                    <th>Date</th>
                                    <th>Student</th>
                                    <th>Course</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#if data.previewPayments && data.previewPayments.length > 0}
                                    {#each data.previewPayments as pay (pay.id)}
                                        {@const payAny = pay as any}
                                        {@const app = payAny.applications}
                                        {@const user = app?.student_user}
                                        <tr>
                                            <td class="font-monospace small">{payAny.transaction_id || '-'}</td>
                                            <td>{payAny.payment_date ? new Date(payAny.payment_date).toLocaleDateString() : '-'}</td>
                                            <td>
                                                <div>{user?.full_name || 'N/A'}</div>
                                                <small class="text-muted">{user?.student_profiles?.enrollment_number || '-'}</small>
                                            </td>
                                            <td>
                                                {app?.courses?.name}
                                                {#if app?.branches?.name} <br/><small class="text-muted">{app.branches.name}</small> {/if}
                                            </td>
                                            <td>{payAny.amount}</td>
                                            <td>
                                                <span class="badge {payAny.status === 'completed' ? 'bg-success' : payAny.status === 'pending' ? 'bg-warning text-dark' : 'bg-danger'}">
                                                    {payAny.status}
                                                </span>
                                            </td>
                                        </tr>
                                    {/each}
                                {:else}
                                    <tr>
                                        <td colspan="6" class="text-center py-3">No payments found matching filters.</td>
                                    </tr>
                                {/if}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Save Template Modal -->
{#if showSaveModal}
<div class="modal show d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <form method="POST" action="?/saveTemplate" use:enhance={() => {
                return async ({ result }) => {
                    if (result.type === 'success') {
                        showSaveModal = false;
                        await invalidateAll(); 
                    }
                };
            }}>
                <div class="modal-header">
                    <h5 class="modal-title">Save Report Template</h5>
                    <button type="button" class="btn-close" on:click={() => showSaveModal = false}></button>
                </div>
                <div class="modal-body">
                    <input type="hidden" name="columns" value={JSON.stringify(selectedKeys)}>
                    <input type="hidden" name="filters" value={JSON.stringify(filters)}>
                    
                    <div class="mb-3">
                        <label class="form-label" for="tplName">Template Name</label>
                        <input type="text" id="tplName" name="name" class="form-control" bind:value={templateName} required>
                    </div>
                    <div class="mb-3">
                         <label class="form-label" for="tplDesc">Description</label>
                         <textarea id="tplDesc" name="description" class="form-control" bind:value={templateDesc}></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showSaveModal = false}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}
