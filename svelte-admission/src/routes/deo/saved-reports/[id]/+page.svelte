
<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';

    export let data: PageData;
    export let form: ActionData;

    let filterValues: Record<string, any> = {};
    let deduplicateStudent = false;
    let visibleColumns: string[] = [];
    let expandColumns: string[] = [];
    let loading = false;

    // Initialize visibleColumns if empty
    $: if (visibleColumns.length === 0 && data.template.configuration.columns) {
        visibleColumns = data.template.configuration.columns.map((c: any) => c.path);
    }
 
    $: downloadUrl = (() => {
        const params = new URLSearchParams();
        params.append('id', data.template.id);
        Object.entries(filterValues).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        if (deduplicateStudent) {
            params.append('deduplicate_student', 'true');
        }
        if (visibleColumns.length > 0) {
            params.append('visible_columns', visibleColumns.join(','));
        }
        if (expandColumns.length > 0) {
            params.append('expand_columns', expandColumns.join(','));
        }
        return `/api/reports/generate?${params.toString()}`;
    })();
 
    if (form?.userFilters) {
        filterValues = { ...form.userFilters };
    }
    if (form && form.deduplicateStudent !== undefined) {
        deduplicateStudent = form.deduplicateStudent;
    }
    if (form?.visibleColumns) {
        visibleColumns = [...form.visibleColumns];
    }
    if (form?.expandColumns) {
        expandColumns = [...form.expandColumns];
    }

    function getFilteredOptions(param: any) {
        if (!param.options) return [];
        
        const isBranch = param.column.includes('branches') && param.column.includes('name');
        if (!isBranch || !data.branchCourseMapping) return param.options;

        const courseParam = data.template.configuration.parameters?.find((p: any) => 
            p.column.includes('courses') && p.column.includes('name')
        );
        const selectedCourse = courseParam ? filterValues[courseParam.name] : null;
        
        if (!selectedCourse) return param.options;

        const cleanSelectedCourse = selectedCourse.trim().toLowerCase();

        return param.options.filter((opt: string) => {
            const mappedCourses = data.branchCourseMapping[opt.trim()];
            if (!mappedCourses || mappedCourses.length === 0) return true;
            return mappedCourses.some((c: string) => c.toLowerCase() === cleanSelectedCourse);
        });
    }

    function handleCourseChange() {
        const branchParam = data.template.configuration.parameters?.find((p: any) => 
            p.column.includes('branches') && p.column.includes('name')
        );
        if (branchParam) {
            filterValues[branchParam.name] = '';
        }
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0">{data.template.name}</h1>
            {#if data.template.description}
                <p class="text-muted small mb-0">{data.template.description}</p>
            {/if}
        </div>
        <a href="/deo/saved-reports" class="btn btn-outline-secondary btn-sm">
            <i class="bi bi-arrow-left"></i> Back to List
        </a>
    </div>

    <div class="row">
        <div class="col-md-3">
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-light">
                    <i class="bi bi-funnel"></i> Filters
                </div>
                <div class="card-body">
                    <form method="POST" action="?/preview" use:enhance={() => {
                        loading = true;
                        return async ({ update }) => {
                            await update();
                            loading = false;
                        };
                    }}>
                        {#if data.template.configuration.parameters && data.template.configuration.parameters.length > 0}
                            {#each data.template.configuration.parameters as param}
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">{param.label}</label>
                                    
                                    {#if param.type === 'select'}
                                        {@const isCourse = param.column.includes('courses') && param.column.includes('name')}
                                        {@const isBranch = param.column.includes('branches') && param.column.includes('name')}
                                        {@const courseParamName = data.template.configuration.parameters?.find((p: any) => p.column.includes('courses') && p.column.includes('name'))?.name}
                                        {@const selectedCourse = courseParamName ? filterValues[courseParamName] : null}
                                        <select 
                                            class="form-select form-select-sm" 
                                            name={param.name} 
                                            bind:value={filterValues[param.name]} 
                                            disabled={isBranch && courseParamName && !selectedCourse}
                                            on:change={() => isCourse && handleCourseChange()}
                                        >
                                            {#if isBranch && courseParamName && !selectedCourse}
                                                <option value="">Select course first</option>
                                            {:else}
                                                <option value="">All</option>
                                                {#each getFilteredOptions(param) as opt}
                                                    <option value={opt}>{opt}</option>
                                                {/each}
                                            {/if}
                                        </select>
                                    {:else if param.type === 'date'}
                                        <input type="date" class="form-control form-control-sm" name={param.name} bind:value={filterValues[param.name]}>
                                    {:else if param.type === 'number'}
                                        <input type="number" class="form-control form-control-sm" name={param.name} bind:value={filterValues[param.name]}>
                                    {:else}
                                        <input type="text" class="form-control form-control-sm" name={param.name} bind:value={filterValues[param.name]}>
                                    {/if}
                                    <div class="form-text x-small text-muted fst-italic">
                                        Operator: {param.operator}
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            <p class="text-muted small">No filters configured for this report.</p>
                        {/if}
                        
                        <hr>
                        <div class="mb-3">
                            <label class="form-label small fw-bold text-dark mb-2">Columns to Include</label>
                            <div class="border rounded p-2 bg-white" style="max-height: 180px; overflow-y: auto;">
                                {#each data.template.configuration.columns || [] as col}
                                    <div class="form-check py-1">
                                        <input type="checkbox" class="form-check-input" id="col_{col.path}" value={col.path} bind:group={visibleColumns}>
                                        <label class="form-check-label small" for="col_{col.path}">
                                            {col.label}
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <hr>
                        <div class="mb-3 form-check">
                            <input type="checkbox" class="form-check-input" id="dedup" name="deduplicate_student" value="true" bind:checked={deduplicateStudent}>
                            <label class="form-check-label small fw-bold text-dark mb-0" for="dedup">
                                Deduplicate Student Records
                            </label>
                            <div class="form-text x-small text-muted mt-1">
                                Merges multiple applications by same student (combining form types to e.g. Prov, MQ/NRI).
                            </div>
                        </div>

                        {#if deduplicateStudent}
                            <div class="mb-3 ps-3 border-start border-2 border-primary">
                                <label class="form-label x-small fw-bold text-dark mb-1">Split fields by Form Type as columns:</label>
                                <div class="border rounded p-2 bg-white" style="max-height: 150px; overflow-y: auto;">
                                    {#each data.template.configuration.columns || [] as col}
                                        {#if visibleColumns.includes(col.path) && col.path !== 'form_type'}
                                            <div class="form-check py-1">
                                                <input type="checkbox" class="form-check-input" id="exp_{col.path}" value={col.path} bind:group={expandColumns}>
                                                <label class="form-check-label x-small" for="exp_{col.path}">
                                                    {col.label}
                                                </label>
                                            </div>
                                        {/if}
                                    {/each}
                                </div>
                                <div class="form-text x-small text-muted mt-1">
                                    Creates separate columns for each form type (e.g. Receipt Number (Prov) and Receipt Number (MQ/NRI)).
                                </div>
                            </div>
                        {/if}

                        <input type="hidden" name="visible_columns" value={visibleColumns.join(',')}>
                        <input type="hidden" name="expand_columns" value={expandColumns.join(',')}>
                        <hr>
                        <div class="d-grid gap-2">
                            <button class="btn btn-primary btn-sm" disabled={loading}>
                                {#if loading}
                                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                    Running...
                                {:else}
                                    <i class="bi bi-play-fill"></i> Preview Report
                                {/if}
                            </button>
                            <a href={downloadUrl} target="_blank" class="btn btn-success btn-sm">
                                <i class="bi bi-download"></i> Download CSV
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <div class="col-md-9">
            {#if form?.message}
                <div class="alert alert-danger">{form.message}</div>
            {/if}

            {#if form?.queryString}
                <div class="alert alert-secondary font-monospace p-2 mb-3" style="font-size: 0.75rem; white-space: pre-wrap; word-break: break-all;">
                    <strong>Generated SQL:</strong> {form.queryString}
                </div>
            {/if}

            {#if form?.success && form.previewData}
                <div class="card shadow-sm border-primary">
                    <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                        <span>Preview Results (Top 10)</span>
                        <span class="badge bg-light text-dark">{form.previewData.length} rows</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped table-hover mb-0" style="font-size: 0.85rem;">
                                <thead class="table-light">
                                    <tr>
                                        {#each form.previewColumns as col}
                                            <th>{col}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each form.previewData as row}
                                        <tr>
                                            {#each form.previewColumns as col}
                                                <td>{row[col]}</td>
                                            {/each}
                                        </tr>
                                    {:else}
                                        <tr>
                                            <td colspan={form.previewColumns.length} class="text-center py-3 text-muted">No data found matching criteria.</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            {:else if !loading}
                <div class="text-center py-5 text-muted bg-light rounded border border-dashed">
                    <i class="bi bi-table display-4 mb-3 d-block"></i>
                    <p class="mb-0">Click "Preview Report" to see results here.</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .x-small { font-size: 0.7rem; }
</style>
