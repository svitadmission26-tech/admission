<script lang="ts">
    import type { PageData } from './$types';
    import { page } from '$app/stores';
    import { goto, invalidateAll } from '$app/navigation';
    import { enhance } from '$app/forms';

    export let data: PageData;

    let filters = {
        course: $page.url.searchParams.get('course') || '',
        branch: $page.url.searchParams.get('branch') || '',
        form_type: $page.url.searchParams.get('form_type') || '',
        start_date: $page.url.searchParams.get('start_date') || '',
        end_date: $page.url.searchParams.get('end_date') || ''
    };

    const staticFields = [
        { key: 'id', label: 'Application ID', default: true },
        { key: 'student_name', label: 'Student Name', default: true },
        { key: 'email', label: 'Email', default: true },
        { key: 'course', label: 'Course', default: true },
        { key: 'branch', label: 'Branch', default: true },
        { key: 'form_type', label: 'Form Type', default: true },
        { key: 'college', label: 'College', default: false },
        { key: 'cycle', label: 'Admission Cycle', default: false },
        { key: 'status', label: 'Status', default: true },
        { key: 'merit_score', label: 'Merit Score', default: true },
        { key: 'admission_no', label: 'Admission Number', default: true },
        { key: 'enrollment_number', label: 'College ID', default: true },
        { key: 'submitted_date', label: 'Submitted Date', default: true },
        { key: 'updated_date', label: 'Last Updated', default: false }
    ];

    // Initialize selected keys with defaults
    let selectedKeys = staticFields.filter(f => f.default).map(f => f.key);
    let availableFields = [...staticFields];

    // Vars for Template UI
    let showSaveModal = false;
    let templateName = '';
    let templateDesc = '';
    let templateIsPublic = false;
    let selectedTemplateId = '';

    // Reactively update availableFields when data.dynamicFields changes
    $: {
        const dynamicFields = (data.dynamicFields || []).map(f => ({ ...f, default: false }));
        availableFields = [...staticFields, ...dynamicFields];
    }

    // Sync filters with URL params (handles back/forward navigation and Apply)
    $: {
        filters.course = $page.url.searchParams.get('course') || '';
        filters.branch = $page.url.searchParams.get('branch') || '';
        filters.form_type = $page.url.searchParams.get('form_type') || '';
        filters.start_date = $page.url.searchParams.get('start_date') || '';
        filters.end_date = $page.url.searchParams.get('end_date') || '';
    }

    $: filteredBranchOptions = filters.course 
        ? data.options.branches.filter(b => b.course_id === filters.course)
        : data.options.branches;
    
    // Generate Report URL reactively based on APPLIED filters (URL) and selected columns
    $: reportUrl = (() => {
        const params = new URLSearchParams($page.url.searchParams);
        
        // Add selected fields
        if (selectedKeys.length > 0) {
            params.set('fields', selectedKeys.join(','));
        } else {
            params.delete('fields');
        }

        return `/adm-officer/export?${params.toString()}`;
    })();

    function applyFilters() {
        const params = new URLSearchParams($page.url.searchParams);
        if (filters.course) params.set('course', filters.course); else params.delete('course');
        if (filters.branch) params.set('branch', filters.branch); else params.delete('branch');
        if (filters.form_type) params.set('form_type', filters.form_type); else params.delete('form_type');
        if (filters.start_date) params.set('start_date', filters.start_date); else params.delete('start_date');
        if (filters.end_date) params.set('end_date', filters.end_date); else params.delete('end_date');
        
        goto(`?${params.toString()}`);
    }

    function clearFilters() {
        goto('/adm-officer/reports');
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
                // Also update URL to reflect loaded filters
                applyFilters();
            }
        }
    }

    function openSaveModal() {
        templateName = '';
        templateDesc = '';
        templateIsPublic = false;
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
        <h1>Reports Generation</h1>
        
        <div class="d-flex align-items-center gap-3">
            <a href="/adm-officer/reports/conversion" class="btn btn-outline-info">
                <i class="bi bi-arrow-repeat me-1"></i> Provisional Conversion Report
            </a>

            <!-- Template Loader -->
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
</div>

    <p class="text-muted">Select filters and columns to generate a custom CSV report.</p>

    <div class="row">
        <!-- Filters Column -->
        <div class="col-md-4">
            <div class="card mb-4">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <span>Filters</span>
                    <button class="btn btn-sm btn-link text-decoration-none" on:click={clearFilters}>Reset</button>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label for="date-range" class="form-label">Date Range (Submitted)</label>
                        <div class="input-group">
                            <input type="date" class="form-control" bind:value={filters.start_date} />
                            <span class="input-group-text">to</span>
                            <input type="date" class="form-control" bind:value={filters.end_date} />
                        </div>
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

                    <div class="mb-3">
                        <label for="form_type" class="form-label">Form Type</label>
                        <select class="form-select" id="form_type" bind:value={filters.form_type}>
                            <option value="">All Types</option>
                            {#each data.options.formTypes as type (type)}
                                <option value={type}>{type}</option>
                            {/each}
                        </select>
                    </div>
                    
                    <button class="btn btn-primary w-100" on:click={applyFilters}>Apply Filters & Refresh Preview</button>
                </div>
            </div>
        </div>

        <!-- Columns Column -->
        <div class="col-md-8">
            <div class="card mb-4">
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
                    <p class="text-muted small mb-2">Hold Ctrl (Cmd on Mac) to select multiple columns.</p>
                    <select multiple class="form-select" size="15" bind:value={selectedKeys}>
                        {#each availableFields as field (field.key)}
                            <option value={field.key}>{field.label}</option>
                        {/each}
                    </select>
                </div>
                <div class="card-footer text-end">
                    <button class="btn btn-outline-primary me-2" on:click={openSaveModal}>
                        <i class="bi bi-save"></i> Save Template
                    </button>
                    <a href={reportUrl} target="_blank" class="btn btn-success">
                        <i class="bi bi-download me-2"></i> Download CSV Report
                    </a>
                </div>
            </div>
            
            <!-- Preview Table -->
            <div class="card">
                <div class="card-header bg-light">
                    Report Preview <small class="text-muted">(Top 10 matching records)</small>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-striped table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Course</th>
                                    <th>Branch</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Merit</th>
                                    <th>Adm No</th>
                                    <th>Submitted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#if data.previewApplications && data.previewApplications.length > 0}
                                    {#each data.previewApplications as app (app.id)}
                                        {@const appAny = app as any}
                                        <tr>
                                            <td>
                                                <div>{appAny.student_user?.full_name || 'N/A'}</div>
                                                <small class="text-muted">{appAny.student_user?.email}</small>
                                            </td>
                                            <td>{appAny.courses?.name}</td>
                                            <td>{appAny.branches?.name || '-'}</td>
                                            <td>{app.form_type}</td>
                                            <td><span class="badge bg-secondary">{app.status}</span></td>
                                            <td>{app.merit_score || '-'}</td>
            <td>{app.student_user?.student_profiles?.enrollment_number || '-'}</td>
                                            <td>{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '-'}</td>
                                        </tr>
                                    {/each}
                                {:else}
                                    <tr>
                                        <td colspan="8" class="text-center py-3">No applications found matching filters.</td>
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
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="is_public" id="isPublic" bind:checked={templateIsPublic}>
                        <label class="form-check-label" for="isPublic">Share with other officers</label>
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
