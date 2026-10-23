<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import FormBuilder from '$lib/components/FormBuilder.svelte';
    import { toastStore } from '$lib/stores/toastStore';

    export let data: PageData;
    export let form: ActionData;

    let builderSchema = { fields: [], enableBranchSelection: false };
    let builderSchemaString = JSON.stringify(builderSchema);

    // Form selectors state
    let selectedCourseId = '';
    let selectedCycleId = '';
    let selectedFormType = '';
    let existingFormId: string | null = null;

    // Handle schema changes from FormBuilder
    function handleSchemaChange(event: CustomEvent) {
        builderSchema = event.detail;
        builderSchemaString = JSON.stringify(builderSchema);
    }

    // Reactive check for existing form
    $: if (selectedCourseId && selectedCycleId && selectedFormType) {
        checkExistingForm();
    } else {
        existingFormId = null;
    }

    $: isSelectedTypeProvisional = data.formTypes?.find(ft => ft.name === selectedFormType)?.is_prov || false;
    $: isApplicationFeeRequired = data.formTypes?.find(ft => ft.name === selectedFormType)?.application_fee_required ?? true;

    async function checkExistingForm() {
        existingFormId = null; // Reset
        
        const params = new URLSearchParams({
            course_id: selectedCourseId,
            cycle_id: selectedCycleId,
            form_type: selectedFormType
        });

        try {
            const response = await fetch(`/api/admin/check-form?${params.toString()}`);
            if (response.ok) {
                const result = await response.json();
                if (result.exists) {
                    existingFormId = result.formId;
                    // Use toast if available or just the alert UI
                }
            }
        } catch (e) {
            console.error('Check failed', e);
        }
    }

    $: if (form?.message) {
        toastStore.error(form.message);
    }
</script>

<div class="container-fluid">
    <div class="d-flex align-items-center justify-content-between mb-4">
        <h1 class="mb-0">Create New Admission Form</h1>
        <a href="/admin/forms" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Back</a>
    </div>

    <div class="card shadow-sm">
        <div class="card-body">
            <form method="POST" action="?/create" use:enhance>
                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <label for="add-course-id" class="form-label">Course</label>
                        <select class="form-select" id="add-course-id" name="course_id" bind:value={selectedCourseId} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label for="add-cycle-id" class="form-label">Admission Cycle</label>
                        <select class="form-select" id="add-cycle-id" name="cycle_id" bind:value={selectedCycleId} required>
                            <option value="">Select Cycle</option>
                            {#each data.admissionCycles as cycle}
                                {@const c = cycle as any}
                                <option value={cycle.id}>{cycle.name} ({c.academic_years?.name || 'N/A'})</option>
                            {/each}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label for="add-form-type" class="form-label">Form Type</label>
                        <select class="form-select" id="add-form-type" name="form_type" bind:value={selectedFormType} required>
                            {#if data.formTypes}
                                {#each data.formTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            {:else}
                                <option value="Provisional">Provisional</option>
                            {/if}
                        </select>
                    </div>
                    {#if isApplicationFeeRequired}
                        <div class="col-md-6">
                            <label for="add-form-fee" class="form-label">Application Form Fee (₹)</label>
                            <input type="number" class="form-control" id="add-form-fee" name="form_fee" value="0" min="0" step="0.01" required />
                        </div>
                    {/if}
                    
                    {#if isSelectedTypeProvisional}
                        <div class="col-md-6">
                            <label for="add-prov-fee" class="form-label">Provisional / Seat Reservation Fee (₹)</label>
                            <input type="number" class="form-control" id="add-prov-fee" name="prov_fee" value="0" min="0" step="0.01" />
                            <div class="form-text">Fee to be paid upon provisional admission approval.</div>
                        </div>
                    {/if}
                </div>
                
                {#if existingFormId}
                    <div class="alert alert-warning mb-3">
                        A form with this Course, Cycle, and Form Type already exists. 
                        <a href={`/admin/forms/${existingFormId}/edit`} class="alert-link">Click here to edit the existing form</a> instead.
                    </div>
                {/if}

                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="add-is-enabled" name="is_enabled" checked>
                    <label class="form-check-label" for="add-is-enabled">Enabled for Students</label>
                </div>

                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="add-enable-branch" 
                        checked={builderSchema.enableBranchSelection || false} 
                        on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            builderSchema.enableBranchSelection = target.checked;
                            builderSchemaString = JSON.stringify(builderSchema);
                        }}
                    >
                    <label class="form-check-label" for="add-enable-branch">Enable Branch Selection</label>
                </div>

                <div class="mb-3">
                    <label for="add-allowed-admission-types" class="form-label">Allowed Admission Types (comma-separated, e.g. Regular,D2D,C2D)</label>
                    <input type="text" class="form-control" id="add-allowed-admission-types" 
                        value={builderSchema.allowedAdmissionTypes || ''} 
                        on:input={(e) => {
                            const target = e.target as HTMLInputElement;
                            builderSchema.allowedAdmissionTypes = target.value;
                            builderSchemaString = JSON.stringify(builderSchema);
                        }}
                        placeholder="Regular,D2D,C2D"
                    >
                    <div class="form-text">Specify which admission types should be available for selection. If empty, 'Regular' is assumed.</div>
                </div>

                <div class="mb-3">
                    <label class="form-label">Form Schema Builder</label>
                    <div class="border p-3 rounded bg-light">
                        <FormBuilder bind:schema={builderSchema} studentProfileFields={data.studentProfileFields} on:change={handleSchemaChange} />
                    </div>
                    <input type="hidden" name="schema_json" value={builderSchemaString} />
                </div>
                
                <div class="d-flex justify-content-end gap-2">
                    <a href="/admin/forms" class="btn btn-secondary">Cancel</a>
                    <button type="submit" class="btn btn-primary">Create Form</button>
                </div>
            </form>
        </div>
    </div>
</div>