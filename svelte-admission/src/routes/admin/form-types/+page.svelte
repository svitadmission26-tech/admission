<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false;

    // Default state for a new form type
    const defaultFormType = {
        id: '',
        name: '',
        code: '',
        description: '',
        is_active: true,
        requires_merit_calculation: true,
        allow_partial_payment: false,
        is_government_quota: false,
        application_fee_required: true,
        auto_approve_on_verification: false,
        direct_admission_on_submit: false,
        is_prov: false
    };

    let currentFormType = writable({ ...defaultFormType });

    function openAddModal() {
        currentFormType.set({ ...defaultFormType });
        showAddModal = true;
    }

    function openEditModal(ft: typeof defaultFormType) {
        currentFormType.set({ ...ft });
        showEditModal = true;
    }

    function openDeleteModal(ft: typeof defaultFormType) {
        currentFormType.set({ ...ft });
        showDeleteModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Form Types</h1>

    <button class="btn btn-primary mb-3" on:click={openAddModal}>Add New Form Type</button>

    {#if data.formTypes && data.formTypes.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover align-middle">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Flags</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.formTypes as ft}
                        <tr>
                            <td>
                                <strong>{ft.name}</strong>
                                {#if ft.description}
                                    <div class="text-muted small">{ft.description}</div>
                                {/if}
                            </td>
                            <td><code>{ft.code}</code></td>
                            <td>
                                {#if ft.requires_merit_calculation}
                                    <span class="badge bg-info text-dark me-1" title="Merit Calculation">Merit</span>
                                {/if}
                                {#if ft.allow_partial_payment}
                                    <span class="badge bg-warning text-dark me-1" title="Partial Payment">Partial Pay</span>
                                {/if}
                                {#if ft.is_government_quota}
                                    <span class="badge bg-secondary me-1" title="Govt Quota">Govt</span>
                                {/if}
                                {#if ft.application_fee_required}
                                    <span class="badge bg-success me-1" title="App Fee">Fee</span>
                                {/if}
                                {#if ft.auto_approve_on_verification}
                                    <span class="badge bg-primary me-1" title="Auto-Approve">Auto-Approve</span>
                                {/if}
                                {#if ft.is_prov}
                                    <span class="badge bg-warning text-dark me-1" title="Provisional Admission">Provisional</span>
                                {/if}
                            </td>
                            <td>
                                {#if ft.is_active}
                                    <span class="badge bg-success">Active</span>
                                {:else}
                                    <span class="badge bg-danger">Inactive</span>
                                {/if}
                            </td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(ft)}>Edit</button>
                                <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(ft)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No form types found. Initialize the database.</p>
    {/if}
</div>

<!-- Add Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add Form Type</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { 
                showAddModal = false; 
                startLoading(); 
                return async ({update}) => { await update(); stopLoading(); } 
            }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="add-name" name="name" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-code" class="form-label">Code (Unique)</label>
                        <input type="text" class="form-control" id="add-code" name="code" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-desc" class="form-label">Description</label>
                        <textarea class="form-control" id="add-desc" name="description"></textarea>
                    </div>
                    
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="add-active" name="is_active" checked>
                        <label class="form-check-label" for="add-active">Is Active</label>
                    </div>
                    
                    <hr>
                    <h6>Behavior Flags</h6>
                    
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="add-merit" name="requires_merit_calculation" checked>
                        <label class="form-check-label" for="add-merit">Requires Merit Calculation</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="add-partial" name="allow_partial_payment">
                        <label class="form-check-label" for="add-partial">Allow Partial Payment</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="add-govt" name="is_government_quota">
                        <label class="form-check-label" for="add-govt">Is Government Quota</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="add-fee" name="application_fee_required" checked>
                        <label class="form-check-label" for="add-fee">Application Fee Required</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="add-auto" name="auto_approve_on_verification">
                        <label class="form-check-label" for="add-auto">Auto-Approve (Bypass Univ Approval)</label>
                    </div>
                    <div class="form-check mb-2 text-primary fw-bold">
                        <input class="form-check-input" type="checkbox" id="add-direct" name="direct_admission_on_submit">
                        <label class="form-check-label" for="add-direct">Direct Admission (Bypass Entire Queue)</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="add-prov" name="is_prov">
                        <label class="form-check-label" for="add-prov">Is Provisional (Seat Reservation)</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Create</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Form Type</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { 
                showEditModal = false; 
                startLoading(); 
                return async ({update}) => { await update(); stopLoading(); } 
            }}>
                <input type="hidden" name="id" value={$currentFormType.id}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="edit-name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="edit-name" name="name" bind:value={$currentFormType.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-code" class="form-label">Code</label>
                        <input type="text" class="form-control" id="edit-code" name="code" bind:value={$currentFormType.code} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-desc" class="form-label">Description</label>
                        <textarea class="form-control" id="edit-desc" name="description" bind:value={$currentFormType.description}></textarea>
                    </div>
                    
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-active" name="is_active" checked={$currentFormType.is_active}>
                        <label class="form-check-label" for="edit-active">Is Active</label>
                    </div>
                    
                    <hr>
                    <h6>Behavior Flags</h6>
                    
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-merit" name="requires_merit_calculation" checked={$currentFormType.requires_merit_calculation}>
                        <label class="form-check-label" for="edit-merit">Requires Merit Calculation</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-partial" name="allow_partial_payment" checked={$currentFormType.allow_partial_payment}>
                        <label class="form-check-label" for="edit-partial">Allow Partial Payment</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-govt" name="is_government_quota" checked={$currentFormType.is_government_quota}>
                        <label class="form-check-label" for="edit-govt">Is Government Quota</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-fee" name="application_fee_required" checked={$currentFormType.application_fee_required}>
                        <label class="form-check-label" for="edit-fee">Application Fee Required</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-auto" name="auto_approve_on_verification" checked={$currentFormType.auto_approve_on_verification}>
                        <label class="form-check-label" for="edit-auto">Auto-Approve (Bypass Univ Approval)</label>
                    </div>
                    <div class="form-check mb-2 text-primary fw-bold">
                        <input class="form-check-input" type="checkbox" id="edit-direct" name="direct_admission_on_submit" checked={$currentFormType.direct_admission_on_submit}>
                        <label class="form-check-label" for="edit-direct">Direct Admission (Bypass Entire Queue)</label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-prov" name="is_prov" checked={$currentFormType.is_prov}>
                        <label class="form-check-label" for="edit-prov">Is Provisional (Seat Reservation)</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Update</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Form Type</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => { await update(); stopLoading(); } 
            }}>
                <input type="hidden" name="id" value={$currentFormType.id}>
                <div class="modal-body">
                    <p>Are you sure you want to delete <strong>{$currentFormType.name}</strong>?</p>
                    <p class="text-danger">This action cannot be undone. If this type is in use, the deletion will fail.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>
