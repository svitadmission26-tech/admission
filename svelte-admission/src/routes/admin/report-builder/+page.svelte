<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';
    import SchemaTree from '$lib/components/SchemaTree.svelte';
    import ProfileTemplateHelp from '$lib/components/reports/ProfileTemplateHelp.svelte';
    import VisualBuilder from '$lib/components/reports/visual-builder/VisualBuilder.svelte';
    import { onMount } from 'svelte';

    let { data, form }: { data: PageData, form: ActionData } = $props();

    let showHelpModal = $state(false);
    let sideBySide = $state(false);
    let textareaRef: HTMLTextAreaElement | undefined = $state();

    // Visual Builder State
    let editorMode = $state('visual'); // 'visual' or 'code'
    let visualLayout: any[] = $state([]);

    function mapPathToVariable(path: string): string {
        if (path.includes('users!student_id')) {
            if (path.includes('student_profiles!student_profiles_user_id_fkey')) {
                const parts = path.split('.');
                const lastPart = parts[parts.length - 1];
                return `student.${lastPart}`;
            }
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `student.${lastPart}`;
        }
        if (path.includes('courses!course_id')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `course.${lastPart}`;
        }
        if (path.includes('colleges!college_id')) {
            if (path.includes('universities!university_id')) {
                const parts = path.split('.');
                const lastPart = parts[parts.length - 1];
                return `college.${lastPart}`;
            }
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `college.${lastPart}`;
        }
        if (path.includes('account_admissions!application_id')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `application.${lastPart}`;
        }
        if (path.includes('payments!application_id')) {
            return `application.receipt_number`;
        }
        if (path.includes('form_data')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `application.${lastPart}`;
        }
        if (path.includes('academic_years!academic_year_id')) {
             return `application.academic_year`;
        }
        if (path.includes('marks!application_id')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `marks.[subject].${lastPart}`;
        }
        const parts = path.split('.');
        const lastPart = parts[parts.length - 1];
        if (path === lastPart) {
            return `application.${lastPart}`;
        }
        return path;
    }

    function handleInsertVariable(path: string, label?: string) {
        let variable = '';
        if (path) variable = `{{${mapPathToVariable(path)}}}`;
        if (!textareaRef) return;
        const start = textareaRef.selectionStart;
        const end = textareaRef.selectionEnd;
        const text = htmlContent;
        htmlContent = text.substring(0, start) + variable + text.substring(end);
        setTimeout(() => {
            textareaRef!.focus();
            textareaRef!.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
    }

    onMount(async () => {
        if (typeof window !== 'undefined' && !(window as any).bootstrap) {
            import('bootstrap');
        }
        console.log('[ReportBuilder] DEBUG: schema loaded:', $state.snapshot(data.schema));
    });

    let selectedTable = $state('');
    let selectedColumns: any[] = $state([]);
    let templateName = $state('');
    let templateDesc = $state('');
    let allowedRoles = $state(['adm_officer']);
    let reportType = $state('tabular');
    let targetFormTypeId = $state('');
    let targetAcademicYearId = $state('');
    let targetCourseId = $state('');
    let htmlContent = $state('');
    let previewData: any[] = $state([]);
    let previewColumns: string[] = $state([]);
    let generatedQuery = $state('');
    let loading = $state(false);
    let editingId: string | null = $state(null);
    let suggesting = $state(false);
    
    let filterReportType = $state('all');
    let filterFormType = $state('all');
    let filterAcademicYear = $state('all');
    let filterCourse = $state('all');

    let filteredTemplates = $derived((data.templates || []).filter((t: any) => {
        if (filterReportType !== 'all' && t.report_type !== filterReportType) return false;
        if (filterFormType !== 'all' && t.target_form_type_id !== filterFormType) return false;
        if (filterAcademicYear !== 'all' && t.target_academic_year_id !== filterAcademicYear) return false;
        if (filterCourse !== 'all' && t.target_course_id !== filterCourse) return false;
        return true;
    }));
    let selectedParameters: any[] = $state([]);
    let newParam = $state({ label: '', column: '', type: 'text', operator: 'eq', options: '' });

    let tableDef = $derived((name: string) => data.schema.find(t => t.name === name));
    let availableColumns = $derived(selectedColumns.map(c => ({ path: c.path, label: c.label })));

    $effect(() => {
        console.log('[ReportBuilder] DEBUG: selectedColumns updated:', $state.snapshot(selectedColumns));
        console.log('[ReportBuilder] DEBUG: availableColumns updated:', $state.snapshot(availableColumns));
    });

    function addParameter() {
        if (!newParam.label || !newParam.column) return;
        const paramToAdd: any = { ...newParam, name: newParam.column + '_' + Date.now() };
        if (paramToAdd.type === 'select' && typeof paramToAdd.options === 'string') {
             paramToAdd.options = (paramToAdd.options as string).split(',').map(s => s.trim()).filter(s => s);
        }
        selectedParameters = [...selectedParameters, paramToAdd];
        newParam = { label: '', column: '', type: 'text', operator: 'eq', options: '' };
    }

    function removeParameter(idx: number) {
        selectedParameters = selectedParameters.filter((_, i) => i !== idx);
    }

    function toggleColumn(path: string, label: string) {
        console.log('[ReportBuilder] toggleColumn called with:', { path, label });
        const idx = selectedColumns.findIndex(c => c.path === path);
        if (idx >= 0) {
            selectedColumns = selectedColumns.filter((_, i) => i !== idx);
        } else {
            selectedColumns = [...selectedColumns, { path, label }];
        }
        console.log('[ReportBuilder] selectedColumns is now:', JSON.stringify(selectedColumns));
    }

    function moveColumn(index: number, direction: number) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= selectedColumns.length) return;
        const newCols = [...selectedColumns];
        const temp = newCols[index];
        newCols[index] = newCols[newIndex];
        newCols[newIndex] = temp;
        selectedColumns = newCols;
    }

    function editTemplate(template: any) {
        editingId = template.id;
        templateName = template.name;
        selectedTable = template.base_table;
        allowedRoles = template.allowed_roles;
        reportType = template.report_type || 'tabular';
        targetFormTypeId = template.target_form_type_id || '';
        targetAcademicYearId = template.target_academic_year_id || '';
        targetCourseId = template.target_course_id || '';
        htmlContent = template.html_content || '';
        if (template.configuration) {
            selectedColumns = template.configuration.columns || [];
            selectedParameters = template.configuration.parameters || [];
            visualLayout = template.configuration.visualLayout || [];
            if (visualLayout.length > 0) editorMode = 'visual';
            else if (reportType === 'html_profile') editorMode = 'code';
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function cancelEdit() {
        editingId = null;
        templateName = '';
        selectedTable = '';
        allowedRoles = ['adm_officer'];
        reportType = 'tabular';
        targetFormTypeId = '';
        targetAcademicYearId = '';
        targetCourseId = '';
        htmlContent = '';
        selectedColumns = [];
        selectedParameters = [];
        visualLayout = [];
        editorMode = 'visual';
        previewData = [];
        generatedQuery = '';
    }

    async function suggestOptions() {
        if (!selectedTable || !newParam.column) return;
        suggesting = true;
        const formData = new FormData();
        formData.append('table', selectedTable);
        formData.append('column', newParam.column);
        const response = await fetch('?/suggest_options', { method: 'POST', body: formData });
        if (response.ok) {
            const result = await response.json();
            // result is serialized, usually we'd need to deserialize it but we can just check form success below
        }
        suggesting = false;
    }

    $effect(() => {
        if (form?.success) {
            if (form.suggestions) {
                newParam.options = form.suggestions;
            } else if (!form.previewData) {
                if (editingId) cancelEdit();
                else {
                    templateName = '';
                    selectedColumns = [];
                    selectedParameters = [];
                }
            }
        }
    });
    
    $effect(() => {
        if (form?.success && form.previewData) {
            previewData = form.previewData;
            previewColumns = form.previewColumns;
            generatedQuery = form.queryString || '';
        }
    });
</script>

<div class="container-fluid">
    <h1>Report Builder</h1>

    <div class="row">
        <div class="col-md-12 mb-4">
            <div class="card border-primary">
                <div class="card-header bg-primary text-white">
                    <strong>Template Type Selection</strong>
                </div>
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-4">
                            <label class="form-label fw-bold mb-0">Select what kind of template you want to build:</label>
                        </div>
                        <div class="col-md-6">
                            <select class="form-select border-primary" bind:value={reportType}>
                                <option value="tabular">Standard Tabular (CSV Export / Table View)</option>
                                <option value="html_profile">Custom Profile Form (HTML Print Layout)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="row">
        {#if !(reportType === 'html_profile' && (editorMode === 'visual' || sideBySide))}
            <div class="col-md-3">
                <div class="card mb-3 shadow-sm border-0">
                    <div class="card-header bg-dark text-white fw-bold">
                        <i class="bi bi-gear-fill me-2"></i> 1. Setup & Guide
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label fw-bold small">Base Table</label>
                            <select class="form-select form-select-sm" bind:value={selectedTable} disabled={!!editingId && reportType === 'tabular'}>
                                <option value="">Select Table</option>
                                {#each data.schema as table}
                                    <option value={table.name}>{table.label}</option>
                                {/each}
                            </select>
                        </div>

                        {#if reportType === 'tabular'}
                            {#if selectedTable}
                                <hr>
                                <h6 class="small fw-bold mb-2">Schema Explorer</h6>
                                <div class="border rounded p-2 bg-light mb-3" style="max-height: 400px; overflow-y: auto;">
                                    <SchemaTree 
                                        tableName={selectedTable} 
                                        schema={data.schema} 
                                        {selectedColumns}
                                        onToggle={toggleColumn}
                                    />
                                </div>

                                <hr>
                                <h6 class="small fw-bold mb-2">User Parameters</h6>
                                <div class="bg-light p-2 rounded mb-3 border">
                                    <div class="mb-2">
                                        <label class="x-small form-label fw-bold">Column</label>
                                        <select class="form-select form-select-sm" bind:value={newParam.column}>
                                            <option value="">Select Column...</option>
                                            {#each availableColumns as col}
                                                <option value={col.path}>{col.label}</option>
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="row g-2 mb-2">
                                        <div class="col-6">
                                            <label class="x-small form-label fw-bold">Label</label>
                                            <input type="text" class="form-control form-control-sm" bind:value={newParam.label} placeholder="Label">
                                        </div>
                                        <div class="col-6">
                                            <label class="x-small form-label fw-bold">Type</label>
                                            <select class="form-select form-select-sm" bind:value={newParam.type}>
                                                <option value="text">Text</option>
                                                <option value="number">Number</option>
                                                <option value="date">Date</option>
                                                <option value="select">Dropdown</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="row g-2 mb-2">
                                        <div class="col-12">
                                            <label class="x-small form-label fw-bold">Operator</label>
                                            <select class="form-select form-select-sm" bind:value={newParam.operator}>
                                                <option value="eq">Equals (=)</option>
                                                <option value="ilike">Contains</option>
                                                <option value="match">Regex (match)</option>
                                                <option value="gt">Greater (&gt;)</option>
                                                <option value="lt">Less (&lt;)</option>
                                                <option value="gte">GTE (&ge;)</option>
                                                <option value="lte">LTE (&le;)</option>
                                                <option value="in">In List</option>
                                            </select>
                                        </div>
                                        {#if newParam.type === 'select'}
                                           <div class="col-12">
                                               <label class="x-small form-label fw-bold">Options (csv)</label>
                                               <div class="input-group input-group-sm">
                                                   <textarea class="form-control" bind:value={newParam.options} placeholder="A,B,C" rows="3"></textarea>
                                                   <form method="POST" action="?/suggest_options" use:enhance={() => {
                                                       suggesting = true;
                                                       return async ({ update }) => {
                                                           await update();
                                                           suggesting = false;
                                                       };
                                                   }}>
                                                       <input type="hidden" name="table" value={selectedTable}>
                                                       <input type="hidden" name="column" value={newParam.column}>
                                                       <button class="btn btn-outline-secondary h-100" title="Auto-detect from DB" disabled={!newParam.column || suggesting}>
                                                           {#if suggesting}
                                                               <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                           {:else}
                                                               <i class="bi bi-magic"></i>
                                                           {/if}
                                                       </button>
                                                   </form>
                                               </div>
                                           </div>
                                        {/if}
                                    </div>
                                    <button type="button" class="btn btn-sm btn-primary w-100" onclick={addParameter} disabled={!newParam.column || !newParam.label}>Add Parameter</button>
                                </div>

                                {#if selectedParameters.length > 0}
                                    <ul class="list-group list-group-flush border rounded overflow-hidden">
                                        {#each selectedParameters as p, idx}
                                            <li class="list-group-item d-flex justify-content-between align-items-center p-2 x-small">
                                                <div>
                                                    <strong>{p.label}</strong> <span class="text-muted">({p.column})</span>
                                                    <br>
                                                    <span class="badge bg-secondary">{p.operator}</span>
                                                </div>
                                                <button type="button" class="btn btn-xs btn-outline-danger border-0" onclick={() => removeParameter(idx)}>&times;</button>
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                            {/if}
                        {:else}
                            <div class="mt-2">
                                <h6 class="small fw-bold mb-2">Variable Picker</h6>
                                <p class="x-small text-muted mb-3">Explore tables and click <span class="badge bg-primary">+</span> to insert into editor.</p>
                                {#if selectedTable}
                                    <div class="border rounded p-2 bg-light mb-3" style="max-height: 600px; overflow-y: auto;">
                                        <SchemaTree 
                                            tableName={selectedTable} 
                                            schema={data.schema} 
                                            insertMode={true}
                                            onInsert={handleInsertVariable}
                                        />
                                    </div>

                                {:else}
                                    <div class="alert alert-warning x-small">Please select a <strong>Base Table</strong> (usually Applications) to start picking variables.</div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <div class={(reportType === 'html_profile' && (editorMode === 'visual' || sideBySide)) ? 'col-md-12' : 'col-md-9'}>
            <div class="card mb-4 shadow-sm border-0">
                <div class="card-header d-flex justify-content-between align-items-center bg-white border-bottom-0 pt-3">
                    <h5 class="mb-0 fw-bold">{editingId ? 'Edit Template' : '2. Define Template'}</h5>
                    {#if editingId}
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick={cancelEdit}>Cancel Edit</button>
                    {/if}
                </div>
                <div class="card-body">
                    {#if form?.message}
                        <div class="alert alert-danger">{form.message}</div>
                    {/if}
                    {#if form?.success && !form.previewData && !form.suggestions}
                        <div class="alert alert-success">Template {editingId ? 'updated' : 'saved'} successfully!</div>
                    {/if}

                    <form method="POST" action="?/save" use:enhance={() => {
                        loading = true;
                        return async ({ update }) => {
                            await update();
                            loading = false;
                        };
                    }}>
                        {#if editingId}
                            <input type="hidden" name="id" value={editingId}>
                        {/if}
                        <input type="hidden" name="base_table" value={selectedTable}>
                        <input type="hidden" name="configuration" value={JSON.stringify({ 
                            columns: selectedColumns, 
                            parameters: selectedParameters,
                            visualLayout: visualLayout
                        })}>
                        <input type="hidden" name="allowed_roles" value={JSON.stringify(allowedRoles)}>
                        
                        <div class="row">
                            <div class="col-md-5 mb-3">
                                <label class="form-label fw-bold small">Template Name</label>
                                <input type="text" name="name" class="form-control" required bind:value={templateName} placeholder="e.g. ACPC Admission Form">
                            </div>
                            <div class="col-md-7 mb-3">
                                <label class="form-label fw-bold small">Allowed Roles</label>
                                <div class="d-flex flex-wrap gap-2">
                                    {#each [
                                        {v: 'adm_officer', l: 'Adm Officer'},
                                        {v: 'deo', l: 'DEO'},
                                        {v: 'fee_collector', l: 'Fee Collector'},
                                        {v: 'university_auth', l: 'Univ Auth'},
                                        {v: 'college_auth', l: 'College Auth'}
                                    ] as role}
                                        <div class="form-check form-check-inline m-0">
                                            <input class="form-check-input" type="checkbox" id="role_{role.v}" value={role.v} bind:group={allowedRoles}>
                                            <label class="form-check-label small" for="role_{role.v}">{role.l}</label>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>

                        {#if reportType === 'tabular'}
                            <div class="card mb-3 border shadow-sm">
                                <div class="card-header bg-light fw-bold small text-dark py-2">
                                    <i class="bi bi-list-check me-2"></i> Selected Columns & Custom Labels
                                </div>
                                <div class="card-body p-2">
                                    {#if selectedColumns.length === 0}
                                        <div class="text-muted small my-4 text-center">
                                            <i class="bi bi-info-circle me-1"></i> No columns selected yet. Toggle columns in the **Schema Explorer** on the left.
                                        </div>
                                    {:else}
                                        <div class="text-muted x-small mb-2">Reorder fields using the arrow buttons and edit labels to override default database column headers.</div>
                                        <div class="table-responsive">
                                            <table class="table table-sm align-middle mb-0 bg-white border rounded">
                                                <thead>
                                                    <tr class="table-light">
                                                        <th style="width: 60px">Reorder</th>
                                                        <th>Database Column Path</th>
                                                        <th>Report Header Label</th>
                                                        <th style="width: 80px" class="text-end">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {#each selectedColumns as col, idx (col.path)}
                                                        <tr>
                                                            <td>
                                                                <div class="btn-group btn-group-sm">
                                                                    <button type="button" class="btn btn-xs btn-outline-secondary p-0 px-1" disabled={idx === 0} onclick={() => moveColumn(idx, -1)}>
                                                                        <i class="bi bi-chevron-up"></i>
                                                                    </button>
                                                                    <button type="button" class="btn btn-xs btn-outline-secondary p-0 px-1" disabled={idx === selectedColumns.length - 1} onclick={() => moveColumn(idx, 1)}>
                                                                        <i class="bi bi-chevron-down"></i>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <code class="x-small text-muted">{col.path}</code>
                                                            </td>
                                                            <td>
                                                                <input type="text" class="form-control form-control-sm py-0" style="height: auto; font-size: 0.85rem;" bind:value={col.label} placeholder={col.path.split('.').pop()}>
                                                            </td>
                                                            <td class="text-end">
                                                                <button type="button" class="btn btn-sm btn-outline-danger border-0 py-0" onclick={() => toggleColumn(col.path, col.label)}>
                                                                    <i class="bi bi-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    {/each}
                                                </tbody>
                                            </table>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}

                        <div class="row border-top pt-3 mt-2">
                            <input type="hidden" name="report_type" value={reportType}>
                            {#if reportType === 'html_profile'}
                                <div class="col-md-12 mb-3">
                                    <div class="row mb-2">
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold small">Target Form Type (Linkage)</label>
                                            <select class="form-select form-select-sm" name="target_form_type_id" bind:value={targetFormTypeId}>
                                                <option value="">-- Apply to All Form Types --</option>
                                                {#if data.formTypes}
                                                    {#each data.formTypes as ft}
                                                        <option value={ft.id}>{ft.name}</option>
                                                    {/each}
                                                {/if}
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold small">Target Academic Year</label>
                                            <select class="form-select form-select-sm" name="target_academic_year_id" bind:value={targetAcademicYearId}>
                                                <option value="">-- Apply to All Academic Years --</option>
                                                {#if data.academicYears}
                                                    {#each data.academicYears as ay}
                                                        <option value={ay.id}>{ay.name}</option>
                                                    {/each}
                                                {/if}
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold small">Target Course</label>
                                            <select class="form-select form-select-sm" name="target_course_id" bind:value={targetCourseId}>
                                                <option value="">-- Apply to All Courses --</option>
                                                {#if data.courses}
                                                    {#each data.courses as c}
                                                        <option value={c.id}>{c.name}</option>
                                                    {/each}
                                                {/if}
                                            </select>
                                        </div>
                                    </div>
                                    <div class="row align-items-center mt-2">
                                        <div class="col-md-12 text-end">
                                            <div class="btn-group btn-group-sm me-2">
                                                <button type="button" class="btn btn-outline-secondary" class:active={sideBySide} onclick={() => sideBySide = !sideBySide} title="Split View">
                                                    <i class="bi bi-layout-split me-1"></i> Side by Side
                                                </button>
                                                <button type="button" class="btn btn-outline-primary" class:active={editorMode === 'visual'} onclick={() => { editorMode = 'visual'; sideBySide = false; }}>
                                                    <i class="bi bi-grid-3x3-gap-fill me-1"></i> Visual
                                                </button>
                                                <button type="button" class="btn btn-outline-primary" class:active={editorMode === 'code'} onclick={() => { editorMode = 'code'; sideBySide = false; }}>
                                                    <i class="bi bi-code-slash me-1"></i> Code
                                                </button>
                                            </div>
                                            <button type="button" class="btn btn-sm btn-info text-white" onclick={() => showHelpModal = true}>
                                                <i class="bi bi-fullscreen me-1"></i> Full Guide Modal
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-12 mb-3">
                                    <div class="row g-3">
                                        {#if sideBySide || editorMode === 'code'}
                                            <div class={sideBySide ? "col-md-5" : "col-12"}>
                                                <label class="form-label fw-bold small">HTML Content (Code View)</label>
                                                <textarea 
                                                    bind:this={textareaRef}
                                                    class="form-control font-monospace" 
                                                    name="html_content" 
                                                    rows={sideBySide ? 35 : 25} 
                                                    bind:value={htmlContent} 
                                                    placeholder="&lt;div&gt;Hello &lbrace;&lbrace;student.full_name&rbrace;&rbrace;&lt;/div&gt;" 
                                                    style="font-size: 0.85rem; background-color: #fcfcfc;"></textarea>
                                                <div class="form-text x-small">Click variables in the sidebar to insert. Use standard HTML/CSS.</div>
                                            </div>
                                        {/if}

                                        {#if sideBySide || editorMode === 'visual'}
                                            <div class={sideBySide ? "col-md-7" : "col-12"}>
                                                {#if sideBySide}
                                                    <label class="form-label fw-bold small">Visual Preview (Live)</label>
                                                {/if}
                                                <VisualBuilder 
                                                    bind:layout={visualLayout} 
                                                    bind:htmlContent={htmlContent}
                                                    schema={data.schema}
                                                    selectedTable={selectedTable}
                                                    live={sideBySide}
                                                />
                                                <input type="hidden" name="html_content" value={htmlContent}>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <div class="d-flex justify-content-between align-items-center border-top pt-3">
                            <div class="text-muted small">
                                {#if reportType === 'tabular'}
                                    {selectedColumns.length} columns selected
                                {/if}
                            </div>
                            <div>
                                <button class="btn btn-success" disabled={(reportType === 'tabular' && (!selectedTable || selectedColumns.length === 0)) || (reportType === 'html_profile' && !htmlContent) || allowedRoles.length === 0 || loading}>
                                    {#if loading}
                                        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                        Saving...
                                    {:else}
                                        {editingId ? 'Update Template' : 'Save Template'}
                                    {/if}
                                </button>
                                {#if reportType === 'tabular'}
                                    <button class="btn btn-info ms-2 text-white" formaction="?/preview" formnovalidate disabled={!selectedTable || selectedColumns.length === 0 || loading}>
                                        {#if loading}
                                            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                            Loading...
                                        {:else}
                                            Preview
                                        {/if}
                                    </button>
                                {/if}
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <ProfileTemplateHelp bind:showModal={showHelpModal} />

            {#if previewData.length > 0}
                <div class="card mb-4 border-info">
                    <div class="card-header bg-info text-white">Preview Results (Top 5)</div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped mb-0">
                                <thead>
                                    <tr>
                                        {#each previewColumns as col}
                                            <th>{col}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each previewData as row}
                                        <tr>
                                            {#each previewColumns as col}
                                                <td>{row[col]}</td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            {/if}

            {#if generatedQuery}
                <div class="alert alert-secondary mb-4 font-monospace" style="font-size: 0.85rem; white-space: pre-wrap;">
                    <strong>Generated Query:</strong> {generatedQuery}
                </div>
            {/if}

            <div class="card">
                <div class="card-header">Existing Templates</div>
                <div class="card-body p-0">
                    <div class="p-3 border-bottom bg-light">
                        <div class="row g-2">
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">Filter Report Type</label>
                                <select class="form-select form-select-sm" bind:value={filterReportType}>
                                    <option value="all">All Types</option>
                                    <option value="tabular">Tabular Report</option>
                                    <option value="html_profile">HTML Profile (Print Template)</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">Filter Form Type</label>
                                <select class="form-select form-select-sm" bind:value={filterFormType}>
                                    <option value="all">All Form Types</option>
                                    {#if data.formTypes}
                                        {#each data.formTypes as ft}
                                            <option value={ft.id}>{ft.name}</option>
                                        {/each}
                                    {/if}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">Filter Academic Year</label>
                                <select class="form-select form-select-sm" bind:value={filterAcademicYear}>
                                    <option value="all">All Academic Years</option>
                                    {#if data.academicYears}
                                        {#each data.academicYears as ay}
                                            <option value={ay.id}>{ay.name}</option>
                                        {/each}
                                    {/if}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">Filter Course</label>
                                <select class="form-select form-select-sm" bind:value={filterCourse}>
                                    <option value="all">All Courses</option>
                                    {#if data.courses}
                                        {#each data.courses as c}
                                            <option value={c.id}>{c.name}</option>
                                        {/each}
                                    {/if}
                                </select>
                            </div>
                        </div>
                    </div>

                    <table class="table table-striped mb-0">
                        <thead><tr><th>Name</th><th>Base</th><th>Course</th><th>Roles</th><th>Action</th></tr></thead>
                        <tbody>
                            {#each filteredTemplates as t}
                                <tr>
                                    <td>{t.name}</td>
                                    <td>{t.base_table}</td>
                                    <td>{data.courses.find(c => c.id === t.target_course_id)?.name || 'All'}</td>
                                    <td>{t.allowed_roles.join(', ')}</td>
                                    <td>
                                        <div class="btn-group btn-group-sm">
                                            <button type="button" class="btn btn-primary" onclick={() => editTemplate(t)}>Edit</button>
                                            <form method="POST" action="?/delete" onsubmit={(e) => !confirm('Are you sure you want to delete this template?') && e.preventDefault()}>
                                                <input type="hidden" name="id" value={t.id}>
                                                <button class="btn btn-danger rounded-0 rounded-end">Delete</button>
                                            </form>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
