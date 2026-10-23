<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    let { data, form } = $props<{ data: PageData, form: ActionData }>();

    let showAddModal = $state(false);
    let showEditModal = $state(false);
    let showDeleteModal = $state(false);

    let currentScheme = $state({
        id: '',
        name: '',
        description: '',
        is_active: true
    });

    function openAddModal() {
        currentScheme = { id: '', name: '', description: '', is_active: true };
        showAddModal = true;
    }

    function openEditModal(scheme: any) {
        currentScheme = { ...scheme };
        showEditModal = true;
    }

    function openDeleteModal(scheme: any) {
        currentScheme = { ...scheme };
        showDeleteModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Fee Schemes</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <button class="btn btn-primary mb-3" onclick={openAddModal}>Add New Fee Scheme</button>

    {#if data.feeSchemes && data.feeSchemes.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover align-middle">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.feeSchemes as scheme}
                        <tr>
                            <td><strong>{scheme.name}</strong></td>
                            <td>{scheme.description || '-'}</td>
                            <td>
                                {#if scheme.is_active}
                                    <span class="badge bg-success">Active</span>
                                {:else}
                                    <span class="badge bg-danger">Inactive</span>
                                {/if}
                            </td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" onclick={() => openEditModal(scheme)}>Edit</button>
                                <button class="btn btn-sm btn-danger" onclick={() => openDeleteModal(scheme)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No fee schemes found. Add one!</p>
    {/if}
</div>

<!-- Add Modal -->
{#if showAddModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add Fee Scheme</h5>
                <button type="button" class="btn-close" onclick={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { 
                showAddModal = false; 
                startLoading(); 
                return async ({update}) => { await update(); stopLoading(); } 
            }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="add-name" name="name" placeholder="e.g. TFWS" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-desc" class="form-label">Description</label>
                        <textarea class="form-control" id="add-desc" name="description"></textarea>
                    </div>
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="add-active" name="is_active" checked>
                        <label class="form-check-label" for="add-active">Is Active</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => (showAddModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Create</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Edit Modal -->
{#if showEditModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Fee Scheme</h5>
                <button type="button" class="btn-close" onclick={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { 
                showEditModal = false; 
                startLoading(); 
                return async ({update}) => { await update(); stopLoading(); } 
            }}>
                <input type="hidden" name="id" value={currentScheme.id}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="edit-name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="edit-name" name="name" bind:value={currentScheme.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-desc" class="form-label">Description</label>
                        <textarea class="form-control" id="edit-desc" name="description" bind:value={currentScheme.description}></textarea>
                    </div>
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="edit-active" name="is_active" bind:checked={currentScheme.is_active}>
                        <label class="form-check-label" for="edit-active">Is Active</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Update</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Delete Modal -->
{#if showDeleteModal}
<div class="modal d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Fee Scheme</h5>
                <button type="button" class="btn-close" onclick={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => { await update(); stopLoading(); } 
            }}>
                <input type="hidden" name="id" value={currentScheme.id}>
                <div class="modal-body">
                    <p>Are you sure you want to delete fee scheme <strong>{currentScheme.name}</strong>?</p>
                    <p class="text-danger">This will fail if any fee structures are using this scheme.</p>
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

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>
