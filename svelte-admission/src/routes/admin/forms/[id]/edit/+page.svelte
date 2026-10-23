<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import FormBuilder from '$lib/components/FormBuilder.svelte';
    import { toastStore } from '$lib/stores/toastStore';

    let { data, form }: { data: PageData, form: ActionData } = $props();

    let currentForm = $state(data.admissionForm);
    let selectedFormType = $state(currentForm.form_type);
    
    const initialConfig = {
        course_id: currentForm.course_id,
        cycle_id: currentForm.cycle_id,
        form_type: currentForm.form_type
    };

    let builderSchema = $state({ fields: [] as any[], enableBranchSelection: false });
    let builderSchemaString = $state('');
    let duplicateFormId = $state<string | null>(null);
    let isConfigUnique = $state(false);
    let isLoadingSchema = $state(false);
    let schemaInitialized = false;

    // Initialize builder schema from loaded form (run once on mount)
    $effect(() => {
        if (schemaInitialized) return;
        try {
            const schema = typeof currentForm.schema_json === 'string' 
                ? JSON.parse(currentForm.schema_json) 
                : currentForm.schema_json;
            builderSchema = schema || { fields: [], enableBranchSelection: false };
            if (!builderSchema.fields) builderSchema.fields = [];
        } catch (e) {
            builderSchema = { fields: [], enableBranchSelection: false };
        }
        builderSchemaString = JSON.stringify(builderSchema);
        schemaInitialized = true;
    });

    function handleSchemaChange(event: CustomEvent) {
        builderSchema = event.detail;
        builderSchemaString = JSON.stringify(builderSchema);
    }
    
    let isCurrentTypeProvisional = $derived(data.formTypes?.find(ft => ft.name === selectedFormType)?.is_prov || false);
    let isApplicationFeeRequired = $derived(data.formTypes?.find(ft => ft.name === selectedFormType)?.application_fee_required ?? true);

    async function fetchSchemaForConfig(courseId: string, cycleId: string, formType: string) {
        isLoadingSchema = true;
        
        try {
            const params = new URLSearchParams({
                course_id: courseId,
                cycle_id: cycleId,
                form_type: formType || ''
            });
            
            const response = await fetch(`/api/admin/get-form-schema?${params.toString()}`);
            if (response.ok) {
                const result = await response.json();
                if (result.form) {
                    const schema = typeof result.form.schema_json === 'string' 
                        ? JSON.parse(result.form.schema_json) 
                        : result.form.schema_json;
                    builderSchema = schema || { fields: [], enableBranchSelection: false };
                    currentForm.form_fee = result.form.form_fee || 0;
                    currentForm.prov_fee = result.form.prov_fee || 0;
                    currentForm.is_enabled = result.form.is_enabled ?? true;
                    currentForm.qr_code_url = result.form.qr_code_url || '';
                    duplicateFormId = result.form.id;
                    isConfigUnique = false;
                } else {
                    builderSchema = { fields: [], enableBranchSelection: false };
                    duplicateFormId = null;
                    isConfigUnique = true;
                }
                builderSchemaString = JSON.stringify(builderSchema);
            }
        } catch (e) {
            console.error('Error fetching schema:', e);
        } finally {
            isLoadingSchema = false;
        }
    }

    async function checkDuplicateForm() {
        if (!currentForm.course_id || !currentForm.cycle_id) {
            return;
        }

        const params = new URLSearchParams({
            course_id: currentForm.course_id,
            cycle_id: currentForm.cycle_id,
            form_type: selectedFormType,
            exclude_id: currentForm.id
        });

        try {
            const response = await fetch(`/api/admin/check-form?${params.toString()}`);
            if (response.ok) {
                const result = await response.json();
                if (result.exists) {
                    duplicateFormId = result.formId;
                    isConfigUnique = false;
                } else {
                    isConfigUnique = true;
                }
            }
        } catch (e) {
            console.error('Duplicate check failed', e);
        }
    }

    // Watch for configuration changes
    $effect(() => {
        const courseId = currentForm.course_id;
        const cycleId = currentForm.cycle_id;
        const formType = selectedFormType;
        
        // Skip initial load
        if (
            courseId === initialConfig.course_id &&
            cycleId === initialConfig.cycle_id &&
            formType === initialConfig.form_type
        ) {
            return;
        }
        
        if (!courseId || !cycleId) {
            return;
        }
        
        fetchSchemaForConfig(courseId, cycleId, formType);
        checkDuplicateForm();
    });

    $effect(() => {
        if (form?.message) {
            toastStore.error(form.message);
        }
    });
</script>

<div class="container-fluid">
    <div class="d-flex align-items-center justify-content-between mb-4">
        <h1 class="mb-0">Edit Admission Form</h1>
        <a href="/admin/forms" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Back</a>
    </div>

    <div class="card shadow-sm">
        <div class="card-body">
            <form method="POST" use:enhance>
                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <label for="edit-course-id" class="form-label">Course</label>
                        <select class="form-select" id="edit-course-id" name="course_id" bind:value={currentForm.course_id} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label for="edit-cycle-id" class="form-label">Admission Cycle</label>
                        <select class="form-select" id="edit-cycle-id" name="cycle_id" bind:value={currentForm.cycle_id} required>
                            <option value="">Select Cycle</option>
                            {#each data.admissionCycles as cycle}
                                {@const c = cycle as any}
                                <option value={cycle.id}>{cycle.name} ({c.academic_years?.name || 'N/A'})</option>
                            {/each}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label for="edit-form-type" class="form-label">Form Type</label>
                        <select class="form-select" id="edit-form-type" name="form_type" bind:value={selectedFormType} required>
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
                            <label for="edit-form-fee" class="form-label">Application Form Fee (₹)</label>
                            <input type="number" class="form-control" id="edit-form-fee" name="form_fee" bind:value={currentForm.form_fee} min="0" step="0.01" required />
                        </div>
                    {/if}

                    {#if isCurrentTypeProvisional}
                        <div class="col-md-6">
                            <label for="edit-prov-fee" class="form-label">Provisional Fee (₹)</label>
                            <input type="number" class="form-control" id="edit-prov-fee" name="prov_fee" bind:value={currentForm.prov_fee} min="0" step="0.01" />
                            <div class="form-text">Fee to be paid upon provisional admission approval.</div>
                        </div>
                    {/if}

                    <!-- QR Code Upload Section -->
                    <div class="col-12">
                        <div class="card bg-light border-secondary">
                            <div class="card-body">
                                <h6 class="card-title text-secondary"><i class="bi bi-qr-code me-2"></i>QR Code for Payment</h6>
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label for="edit-qr-code-url" class="form-label">QR Code Image URL</label>
                                        <input type="url" class="form-control" id="edit-qr-code-url" name="qr_code_url" bind:value={currentForm.qr_code_url} placeholder="https://example.com/qr-code.png" />
                                        <div class="form-text">Upload QR code image to Supabase Storage and paste the public URL here. This QR code will be shown during fee payment.</div>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Preview</label>
                                        <div class="border rounded p-2 text-center bg-white" style="min-height: 120px;">
                                            {#if currentForm.qr_code_url}
                                                <img src={currentForm.qr_code_url} alt="QR Code" style="max-width: 100px; max-height: 100px;" on:error={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            {:else}
                                                <span class="text-muted small">No QR code uploaded</span>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {#if duplicateFormId}
                    <div class="alert alert-danger mb-3">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>
                        A <strong>different</strong> form with this Course, Cycle, and Form Type already exists. 
                        <a href={`/admin/forms/${duplicateFormId}/edit`} class="alert-link">View it here</a>. 
                        Saving might cause conflicts.
                    </div>
                {/if}

                {#if isConfigUnique}
                    <div class="alert alert-warning mb-3 py-2 small">
                        <i class="bi bi-info-circle-fill me-2"></i>
                        No record found for this configuration (Form doesn't exist). Saving will update this form to the new configuration.
                    </div>
                {/if}

                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="edit-is-enabled" name="is_enabled" checked={currentForm.is_enabled}>
                    <label class="form-check-label" for="edit-is-enabled">Enabled for Students</label>
                </div>

                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="edit-enable-branch" 
                        checked={builderSchema.enableBranchSelection || false} 
                        on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            builderSchema.enableBranchSelection = target.checked;
                            builderSchemaString = JSON.stringify(builderSchema);
                        }}
                    >
                    <label class="form-check-label" for="edit-enable-branch">Enable Branch Selection</label>
                </div>

                <div class="mb-3">
                    <label for="edit-allowed-admission-types" class="form-label">Allowed Admission Types (comma-separated, e.g. Regular,D2D,C2D)</label>
                    <input type="text" class="form-control" id="edit-allowed-admission-types" 
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
                        <FormBuilder schema={builderSchema} studentProfileFields={data.studentProfileFields} on:change={handleSchemaChange} />
                    </div>
                    <input type="hidden" name="schema_json" value={builderSchemaString} />
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <a href="/admin/forms" class="btn btn-secondary">Cancel</a>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>