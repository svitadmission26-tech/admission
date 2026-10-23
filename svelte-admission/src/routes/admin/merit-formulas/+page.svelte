<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';

    let { data }: { data: PageData } = $props();

    let showAddModal = $state(false);
    let showEditModal = $state(false);
    let showDeleteModal = $state(false);

    let currentMeritFormula = writable({
        id: '',
        course_id: '',
        form_type: 'Provisional', // Default
        mode: 'weighted', // 'weighted' | 'expression'
        rules_json: '{}', // Default to empty object JSON string
        expression_str: '', // Temp storage for expression string
        courses: { name: '' }
    });

    let selectedCourseIdForAdd = $state('');
    let selectedFormTypeForAdd = $state('Provisional');
    let selectedModeForAdd = $state('weighted');
    let addExpressionStr = $state('');

    interface MeritFieldEntry {
        key: string;
        label: string;
        type: 'table' | 'column';
        sectionTitle?: string;
        columnLabel?: string;
    }
    
    // Helper to get ALL available merit fields for a course AND form type
    // Handles both table layout (column-level merit) and column layout (field-level merit)
    function getMeritFields(courseId: string, formType: string): MeritFieldEntry[] {
        const form = data.admissionForms.find(f => f.course_id === courseId && f.form_type === formType);
        if (!form || !form.schema_json || !form.schema_json.fields) return [];
        
        const meritFields: MeritFieldEntry[] = [];
        const sections = form.schema_json.sections || [];
        
        form.schema_json.fields.forEach((field: any) => {
            const section = sections.find((s: any) => s.id === field.sectionId);
            
            if (section?.layout === 'table' && section.tableColumns) {
                // Table Layout: Check each column for is_merit
                section.tableColumns.forEach((col: any) => {
                    if (col.is_merit) {
                        // Flattened key: fieldKey_columnKey (e.g., physics_theory)
                        const flattenedKey = `${field.key}_${col.key}`;
                        meritFields.push({
                            key: flattenedKey,
                            label: `${field.label} - ${col.label}`,
                            type: 'table',
                            sectionTitle: section.title,
                            columnLabel: col.label
                        });
                    }
                });
            } else if (field.is_merit) {
                // Column Layout: Direct merit field
                meritFields.push({
                    key: field.key,
                    label: field.label,
                    type: 'column',
                    sectionTitle: section?.title
                });
            }
        });
        
        return meritFields;
    }

    let addModalMeritFields = $derived(getMeritFields(selectedCourseIdForAdd, selectedFormTypeForAdd));
    let editModalMeritFields = $derived(getMeritFields($currentMeritFormula.course_id, $currentMeritFormula.form_type));

    function openEditModal(formula: {
        id: string;
        course_id: string;
        form_type: string;
        rules_json: any; // Using any for JSONB for now
        courses: { name: string };
    }) {
        let mode = 'weighted';
        let expr = '';
        if (formula.rules_json && formula.rules_json.mode === 'expression') {
            mode = 'expression';
            expr = formula.rules_json.expression || '';
        }

        currentMeritFormula.set({
            ...formula,
            form_type: formula.form_type || 'Provisional',
            mode: mode,
            expression_str: expr,
            rules_json: JSON.stringify(formula.rules_json, null, 2) // Pretty print JSON
        });
        showEditModal = true;
    }

    function openDeleteModal(formula: { id: string; courses: { name: string } }) {
        currentMeritFormula.set(formula as any);
        showDeleteModal = true;
    }

    function insertField(fieldKey: string, isEdit: boolean) {
        const mode = isEdit ? $currentMeritFormula.mode : selectedModeForAdd;

        if (mode === 'weighted') {
            // JSON Logic
            const key = `weight_${fieldKey}`;
            const snippet = `  "${key}": 0.5,`;
            
            let currentValue = isEdit ? $currentMeritFormula.rules_json : (document.getElementById('add-rules-json') as HTMLTextAreaElement)?.value;
            
            if (currentValue && currentValue.trim().endsWith('}')) {
                let trimmed = currentValue.trim();
                trimmed = trimmed.substring(0, trimmed.length - 1).trim(); // Remove }
                if (!trimmed.endsWith('{') && !trimmed.endsWith(',')) trimmed += ',';
                trimmed += '\n' + snippet + '\n}';
                
                if (isEdit) {
                    $currentMeritFormula.rules_json = trimmed;
                } else {
                    const el = document.getElementById('add-rules-json') as HTMLTextAreaElement;
                    if(el) el.value = trimmed;
                }
            }
        } else {
            // Expression Logic
            // Default safe usage: (score / max)
            const snippet = `(${fieldKey} / ${fieldKey}_max)`;
            
            if (isEdit) {
                $currentMeritFormula.expression_str = ($currentMeritFormula.expression_str || '') + snippet + ' + ';
            } else {
                addExpressionStr = (addExpressionStr || '') + snippet + ' + ';
            }
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Merit Formula Management</h1>

    <button class="btn btn-primary mb-3" on:click={() => (showAddModal = true)}>Add New Merit Formula</button>

    {#if data.meritFormulas.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>Course & Type</th>
                        <th>Rules (JSON)</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.meritFormulas as formula}
                        <tr>
                            <td>
                                {formula.courses?.name || 'N/A'}
                                <br/>
                                <span class="badge bg-secondary">{formula.form_type || 'Provisional'}</span>
                            </td>
                            <td><pre class="mb-0" style="max-height: 100px;">{JSON.stringify(formula.rules_json, null, 2)}</pre></td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(formula)}>Edit</button>
                                <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(formula)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No merit formulas found. Add one!</p>
    {/if}
</div>

<!-- Add Merit Formula Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Merit Formula</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { showAddModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-course-id" class="form-label">Course</label>
                        <select class="form-select" id="add-course-id" name="course_id" bind:value={selectedCourseIdForAdd} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="add-form-type" class="form-label">Form Type</label>
                        <select class="form-select" id="add-form-type" name="form_type" bind:value={selectedFormTypeForAdd} required>
                            {#if data.formTypes}
                                {#each data.formTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            {:else}
                                <option value="Provisional">Provisional</option>
                            {/if}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label d-block">Calculation Mode</label>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="mode_display" id="add-mode-weighted" value="weighted" bind:group={selectedModeForAdd}>
                            <label class="form-check-label" for="add-mode-weighted">Weighted Average (Standard)</label>
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="mode_display" id="add-mode-expr" value="expression" bind:group={selectedModeForAdd}>
                            <label class="form-check-label" for="add-mode-expr">Arithmetic Expression (Advanced)</label>
                        </div>
                        <input type="hidden" name="mode" value={selectedModeForAdd}>
                    </div>

                    <!-- Available Fields Display -->
                    {#if addModalMeritFields.length > 0}
                        <div class="mb-3 p-2 bg-light border rounded">
                            <h6>Available Merit Fields (from Admission Form)</h6>
                            <p class="small text-muted mb-2">
                                <span class="badge bg-primary me-1">Column Layout</span> Direct merit fields
                                <span class="badge bg-info ms-2 me-1">Table Layout</span> Nested merit columns (flattened keys)
                            </p>
                            <div class="d-flex flex-wrap gap-2">
                                {#each addModalMeritFields as field}
                                    <button type="button" class="btn btn-sm {field.type === 'table' ? 'btn-outline-info' : 'btn-outline-secondary'}" on:click={() => insertField(field.key, false)}>
                                        {field.label} <span class="badge bg-secondary ms-1">{field.key}</span> <i class="bi bi-plus"></i>
                                    </button>
                                {/each}
                            </div>
                            <small class="text-muted d-block mt-2">
                                Click a field to insert it into your formula.
                                {#if selectedModeForAdd === 'weighted'}
                                    Weight will be added to JSON.
                                {:else}
                                    Expression snippet will be appended to the formula.
                                {/if}
                            </small>
                        </div>
                    {:else if selectedCourseIdForAdd}
                        <div class="alert alert-warning py-2">No merit fields defined in the admission form for this course and form type ({selectedFormTypeForAdd}) yet.</div>
                    {/if}

                    {#if selectedModeForAdd === 'weighted'}
                        <div class="mb-3">
                            <label for="add-rules-json" class="form-label">Merit Rules (JSON)</label>
                            <textarea class="form-control" id="add-rules-json" name="rules_json_weighted" rows="10">{`{
  "weight_hsc": 0.6,
  "weight_entrance": 0.4
}`}</textarea>
                            <div class="form-text">
                                Define weights for fields. Keys should match "weight_" + field_key.<br>
                                Example: If field key is "hsc_marks", use "weight_hsc_marks".<br>
                                For table fields, use flattened keys like <code>weight_physics_theory</code>.
                            </div>
                        </div>
                    {:else}
                        <div class="mb-3">
                            <label for="add-expr" class="form-label">Formula Expression</label>
                            <input type="text" class="form-control" id="add-expr" name="expression_str" bind:value={addExpressionStr} placeholder="e.g. ((physics / physics_max) + (maths / maths_max)) / 2" />
                            <div class="form-text">
                                Use field keys as variables. suffix '_max' for max score. <br>
                                For table fields, flattened keys are used: <code>physics_theory</code> and <code>physics_theory_max</code>.<br>
                                Supported: +, -, *, /, (), mean(), etc.
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Merit Formula</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Merit Formula Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Merit Formula</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { showEditModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentMeritFormula.id} />
                    <div class="mb-3">
                        <label for="edit-course-id" class="form-label">Course</label>
                        <select class="form-select" id="edit-course-id" name="course_id" bind:value={$currentMeritFormula.course_id} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="edit-form-type" class="form-label">Form Type</label>
                        <select class="form-select" id="edit-form-type" name="form_type" bind:value={$currentMeritFormula.form_type} required>
                            {#if data.formTypes}
                                {#each data.formTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            {:else}
                                <option value="Provisional">Provisional</option>
                            {/if}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label d-block">Calculation Mode</label>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="mode_display_edit" id="edit-mode-weighted" value="weighted" bind:group={$currentMeritFormula.mode}>
                            <label class="form-check-label" for="edit-mode-weighted">Weighted Average</label>
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="mode_display_edit" id="edit-mode-expr" value="expression" bind:group={$currentMeritFormula.mode}>
                            <label class="form-check-label" for="edit-mode-expr">Arithmetic Expression</label>
                        </div>
                        <input type="hidden" name="mode" value={$currentMeritFormula.mode}>
                    </div>

                    <!-- Available Fields Display -->
                    {#if editModalMeritFields.length > 0}
                        <div class="mb-3 p-2 bg-light border rounded">
                            <h6>Available Merit Fields</h6>
                            <p class="small text-muted mb-2">
                                <span class="badge bg-primary me-1">Column Layout</span> Direct merit fields
                                <span class="badge bg-info ms-2 me-1">Table Layout</span> Nested merit columns (flattened keys)
                            </p>
                            <div class="d-flex flex-wrap gap-2">
                                {#each editModalMeritFields as field}
                                    <button type="button" class="btn btn-sm {field.type === 'table' ? 'btn-outline-info' : 'btn-outline-secondary'}" on:click={() => insertField(field.key, true)}>
                                        {field.label} <span class="badge bg-secondary ms-1">{field.key}</span> <i class="bi bi-plus"></i>
                                    </button>
                                {/each}
                            </div>
                            <small class="text-muted d-block mt-2">
                                Click a field to insert it into your formula.
                                {#if $currentMeritFormula.mode === 'weighted'}
                                    Weight will be added to JSON.
                                {:else}
                                    Expression snippet will be appended to the formula.
                                {/if}
                            </small>
                        </div>
                    {:else}
                        <div class="alert alert-warning py-2">No merit fields found for this course's form.</div>
                    {/if}

                    {#if $currentMeritFormula.mode === 'weighted'}
                        <div class="mb-3">
                            <label for="edit-rules-json" class="form-label">Merit Rules (JSON)</label>
                            <textarea class="form-control" id="edit-rules-json" name="rules_json_weighted" rows="10" bind:value={$currentMeritFormula.rules_json}></textarea>
                            <div class="form-text">
                                Define weights for fields. Keys should match "weight_" + field_key.<br>
                                For table fields, use flattened keys like <code>weight_physics_theory</code>.
                            </div>
                        </div>
                    {:else}
                         <div class="mb-3">
                            <label for="edit-expr" class="form-label">Formula Expression</label>
                            <input type="text" class="form-control" id="edit-expr" name="expression_str" bind:value={$currentMeritFormula.expression_str} />
                            <div class="form-text">
                                Use field keys as variables. suffix '_max' for max score.<br>
                                For table fields, flattened keys are used: <code>physics_theory</code> and <code>physics_theory_max</code>.
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete Merit Formula Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Merit Formula</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { showDeleteModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentMeritFormula.id} />
                    <p>Are you sure you want to delete the merit formula for course <strong>{$currentMeritFormula.courses?.name}</strong>?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>