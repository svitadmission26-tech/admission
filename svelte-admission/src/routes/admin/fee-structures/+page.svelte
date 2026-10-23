<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import FeeStructureBuilder from '$lib/components/FeeStructureBuilder.svelte';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    let { data, form } = $props<{ data: PageData, form: ActionData }>();

    let showAddModal = $state(false);
    let showEditModal = $state(false);
    let showDeleteModal = $state(false);
    let showCopyModal = $state(false);

    let targetCopyValues = $state({
        source_id: '',
        target_course_id: '',
        target_academic_year_id: '',
        target_form_type: 'Provisional',
        target_fee_scheme_id: ''
    });

    let currentFeeStructure = $state<any>({
        id: '',
        course_id: '',
        academic_year_id: '',
        form_type: 'Provisional',
        fee_scheme_id: '',
        total_fee: 0,
        installment_json: '[]',
        fee_components: [],
        courses: { name: '' },
        academic_years: { name: '' },
        fee_schemes: { name: '' }
    });

    let newFeeComponents = $state<any[]>([]);
    let newTotalFee = $state(0);

    function openEditModal(feeStructure: any) {
        currentFeeStructure = {
            ...feeStructure,
            installment_json: typeof feeStructure.installment_json === 'string' 
                ? feeStructure.installment_json 
                : JSON.stringify(feeStructure.installment_json, null, 2),
            fee_components: feeStructure.fee_components || [],
            fee_scheme_id: feeStructure.fee_scheme_id || ''
        };
        showEditModal = true;
    }

    function openDeleteModal(feeStructure: any) {
        currentFeeStructure = { ...feeStructure };
        showDeleteModal = true;
    }

    function openCopyModal(feeStructure: any) {
        currentFeeStructure = { ...feeStructure };
        targetCopyValues = {
            source_id: feeStructure.id,
            target_course_id: feeStructure.course_id,
            target_academic_year_id: feeStructure.academic_year_id,
            target_form_type: feeStructure.form_type,
            target_fee_scheme_id: feeStructure.fee_scheme_id
        };
        showCopyModal = true;
    }

    function handleTotalChange(total: number) {
        if (showAddModal) {
            newTotalFee = total;
        } else if (showEditModal) {
            currentFeeStructure.total_fee = total;
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Fee Structure Management</h1>

    <button class="btn btn-primary mb-3" onclick={() => {
        newFeeComponents = [];
        newTotalFee = 0;
        showAddModal = true;
    }}>Add New Fee Structure</button>

    {#if data.feeStructures.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>Course</th>
                        <th>Academic Year</th>
                        <th>Form Type</th>
                        <th>Total Fee</th>
                        <th>Components</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.feeStructures as fs}
                        <tr>
                            <td>{fs.courses?.name || 'N/A'}</td>
                            <td>{fs.academic_years?.name || 'N/A'}</td>
                            <td><span class="badge bg-secondary">{fs.form_type || 'Provisional'}</span></td>
                            <td><span class="badge bg-info text-dark">{fs.fee_schemes?.name || 'N/A'}</span></td>
                            <td>{fs.total_fee}</td>
                            <td>
                                <small>
                                    {#if fs.fee_components && fs.fee_components.length > 0}
                                        {fs.fee_components.length} Sections
                                    {:else}
                                        -
                                    {/if}
                                </small>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" onclick={() => openEditModal(fs)}>Edit</button>
                                <button class="btn btn-sm btn-secondary me-2" onclick={() => openCopyModal(fs)}>Copy</button>
                                <button class="btn btn-sm btn-danger" onclick={() => openDeleteModal(fs)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No fee structures found. Add one!</p>
    {/if}
</div>

<!-- Add Fee Structure Modal -->
{#if showAddModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Fee Structure</h5>
                <button type="button" class="btn-close" onclick={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { 
                showAddModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="add-course-id" class="form-label">Course</label>
                            <select class="form-select" id="add-course-id" name="course_id" required>
                                <option value="">Select Course</option>
                                {#each data.courses as course}
                                    <option value={course.id}>{course.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="add-academic-year-id" class="form-label">Academic Year</label>
                            <select class="form-select" id="add-academic-year-id" name="academic_year_id" required>
                                <option value="">Select Academic Year</option>
                                {#each data.academicYears as year}
                                    <option value={year.id}>{year.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="add-form-type" class="form-label">Form Type</label>
                            <select class="form-select" id="add-form-type" name="form_type" required>
                                {#if data.formTypes}
                                    {#each data.formTypes as ft}
                                        <option value={ft.name}>{ft.name}</option>
                                    {/each}
                                {:else}
                                    <option value="Provisional">Provisional</option>
                                {/if}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="add-fee-scheme-id" class="form-label">Fee Scheme</label>
                            <select class="form-select" id="add-fee-scheme-id" name="fee_scheme_id" required>
                                <option value="">Select Scheme</option>
                                {#each data.feeSchemes as scheme}
                                    <option value={scheme.id}>{scheme.name}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Fee Components Breakdown</label>
                        <div class="border p-2 rounded bg-light">
                            <FeeStructureBuilder 
                                bind:value={newFeeComponents} 
                                onTotalChange={handleTotalChange} 
                            />
                        </div>
                        <input type="hidden" name="fee_components" value={JSON.stringify(newFeeComponents)} />
                    </div>

                    <div class="mb-3">
                        <label for="add-total-fee" class="form-label">Total Fee (Calculated)</label>
                        <input type="number" step="0.01" class="form-control" id="add-total-fee" name="total_fee" value={newTotalFee} readonly />
                    </div>
                    
                    <div class="mb-3">
                        <label for="add-installment-json" class="form-label">Installment Details (JSON)</label>
                        <textarea class="form-control" id="add-installment-json" name="installment_json" rows="3">[]</textarea>
                        <div class="form-text">e.g., `[&#123; "amount": {newTotalFee}, "due_date": "2026-06-15" &#125;]`.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => (showAddModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Fee Structure</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Edit Fee Structure Modal -->
{#if showEditModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Fee Structure</h5>
                <button type="button" class="btn-close" onclick={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { 
                showEditModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={currentFeeStructure.id} />
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="edit-course-id" class="form-label">Course</label>
                            <select class="form-select" id="edit-course-id" name="course_id" bind:value={currentFeeStructure.course_id} required>
                                <option value="">Select Course</option>
                                {#each data.courses as course}
                                    <option value={course.id}>{course.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="edit-academic-year-id" class="form-label">Academic Year</label>
                            <select class="form-select" id="edit-academic-year-id" name="academic_year_id" bind:value={currentFeeStructure.academic_year_id} required>
                                <option value="">Select Academic Year</option>
                                {#each data.academicYears as year}
                                    <option value={year.id}>{year.name}</option>
                                {/each}
                            </select>
                        </div>
                         <div class="col-md-6 mb-3">
                            <label for="edit-form-type" class="form-label">Form Type</label>
                            <select class="form-select" id="edit-form-type" name="form_type" bind:value={currentFeeStructure.form_type} required>
                                {#if data.formTypes}
                                    {#each data.formTypes as ft}
                                        <option value={ft.name}>{ft.name}</option>
                                    {/each}
                                {:else}
                                    <option value="Provisional">Provisional</option>
                                {/if}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="edit-fee-scheme-id" class="form-label">Fee Scheme</label>
                            <select class="form-select" id="edit-fee-scheme-id" name="fee_scheme_id" bind:value={currentFeeStructure.fee_scheme_id} required>
                                <option value="">Select Scheme</option>
                                {#each data.feeSchemes as scheme}
                                    <option value={scheme.id}>{scheme.name}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Fee Components Breakdown</label>
                         <div class="border p-2 rounded bg-light">
                            <FeeStructureBuilder 
                                bind:value={currentFeeStructure.fee_components} 
                                onTotalChange={handleTotalChange} 
                            />
                        </div>
                        <input type="hidden" name="fee_components" value={JSON.stringify(currentFeeStructure.fee_components)} />
                    </div>

                    <div class="mb-3">
                        <label for="edit-total-fee" class="form-label">Total Fee (Calculated)</label>
                        <input type="number" step="0.01" class="form-control" id="edit-total-fee" name="total_fee" bind:value={currentFeeStructure.total_fee} readonly />
                    </div>

                    <div class="mb-3">
                        <label for="edit-installment-json" class="form-label">Installment Details (JSON)</label>
                        <textarea class="form-control" id="edit-installment-json" name="installment_json" rows="3" bind:value={currentFeeStructure.installment_json}></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Delete Fee Structure Modal -->
{#if showDeleteModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Fee Structure</h5>
                <button type="button" class="btn-close" onclick={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={currentFeeStructure.id} />
                    <p>Are you sure you want to delete this fee structure?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Copy Fee Structure Modal -->
{#if showCopyModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Copy Fee Structure</h5>
                <button type="button" class="btn-close" onclick={() => (showCopyModal = false)}></button>
            </div>
            <form method="POST" action="?/copy" use:enhance={() => { 
                showCopyModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="source_id" value={targetCopyValues.source_id} />
                    
                    <div class="alert alert-info">
                        <strong>Source:</strong><br>
                        Course: {currentFeeStructure.courses?.name}<br>
                        Year: {currentFeeStructure.academic_years?.name}<br>
                        Type: <span class="badge bg-secondary">{currentFeeStructure.form_type}</span><br>
                        Total: {currentFeeStructure.total_fee}
                    </div>

                    <h6 class="mb-3">Target Configuration</h6>

                    <div class="mb-3">
                        <label for="copy-course-id" class="form-label">Target Course</label>
                        <select class="form-select" id="copy-course-id" name="target_course_id" bind:value={targetCopyValues.target_course_id} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="copy-academic-year-id" class="form-label">Target Academic Year</label>
                        <select class="form-select" id="copy-academic-year-id" name="target_academic_year_id" bind:value={targetCopyValues.target_academic_year_id} required>
                            <option value="">Select Academic Year</option>
                            {#each data.academicYears as year}
                                <option value={year.id}>{year.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="copy-form-type" class="form-label">Target Form Type</label>
                        <select class="form-select" id="copy-form-type" name="target_form_type" bind:value={targetCopyValues.target_form_type} required>
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
                        <label for="copy-fee-scheme-id" class="form-label">Target Fee Scheme</label>
                        <select class="form-select" id="copy-fee-scheme-id" name="target_fee_scheme_id" bind:value={targetCopyValues.target_fee_scheme_id} required>
                            <option value="">Select Scheme</option>
                            {#each data.feeSchemes as scheme}
                                <option value={scheme.id}>{scheme.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => (showCopyModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Copy & Create</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<style lang="scss">
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>
