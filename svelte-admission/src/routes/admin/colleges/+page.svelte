<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false;

    let currentCollege = writable({
        id: '',
        university_id: '',
        name: '',
        code: '',
        address: '',
        logo_url: '',
        universities: { name: '' }
    });

    function openEditModal(college: any) {
        currentCollege.set({
            ...college,
            logo_url: college.logo_url || ''
        });
        showEditModal = true;
    }

    function openDeleteModal(college: any) {
        currentCollege.set(college);
        showDeleteModal = true;
    }
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Manage Colleges</h1>
        <button class="btn btn-primary" on:click={() => (showAddModal = true)}>
            <i class="bi bi-plus-lg"></i> Add New College
        </button>
    </div>

    {#if data.colleges.length > 0}
        <div class="card shadow-sm">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 80px;">Logo</th>
                            <th>College Name</th>
                            <th>Code</th>
                            <th>University</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.colleges as college}
                            <tr>
                                <td>
                                    {#if college.logo_url}
                                        <img src={college.logo_url} alt="Logo" style="height: 35px; width: 35px; object-fit: contain; border: 1px solid #eee; padding: 2px; border-radius: 4px;">
                                    {:else}
                                        <div class="bg-light text-muted d-flex align-items-center justify-content-center rounded" style="height: 35px; width: 35px; font-size: 10px;">
                                            No Logo
                                        </div>
                                    {/if}
                                </td>
                                <td class="fw-bold">{college.name}</td>
                                <td><span class="badge bg-light text-dark border">{college.code || 'N/A'}</span></td>
                                <td>{college.universities?.name || 'N/A'}</td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-outline-info me-2" on:click={() => openEditModal(college)}>
                                        <i class="bi bi-pencil"></i> Edit
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" on:click={() => openDeleteModal(college)}>
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {:else}
        <div class="alert alert-info">No colleges found. Add your first college to get started.</div>
    {/if}
</div>

<!-- Add Modal -->
{#if showAddModal}
<div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New College</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)}></button>
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
                    <div class="mb-3">
                        <label class="form-label">University</label>
                        <select class="form-select" name="university_id" required>
                            <option value="">Select University</option>
                            {#each data.universities as univ}
                                <option value={univ.id}>{univ.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">College Name</label>
                        <input type="text" class="form-control" name="name" required />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">College Code</label>
                        <input type="text" class="form-control" name="code" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Address</label>
                        <textarea class="form-control" name="address" rows="2"></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Logo URL</label>
                        <input type="text" class="form-control" name="logo_url" placeholder="https://example.com/logo.png" />
                        <div class="form-text">Paste the direct link to the college logo image.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Create College</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Edit Modal -->
{#if showEditModal}
<div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit College</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
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
                    <input type="hidden" name="id" value={$currentCollege.id} />
                    <div class="mb-3">
                        <label class="form-label">University</label>
                        <select class="form-select" name="university_id" bind:value={$currentCollege.university_id} required>
                            {#each data.universities as univ}
                                <option value={univ.id}>{univ.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">College Name</label>
                        <input type="text" class="form-control" name="name" bind:value={$currentCollege.name} required />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">College Code</label>
                        <input type="text" class="form-control" name="code" bind:value={$currentCollege.code} />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Address</label>
                        <textarea class="form-control" name="address" bind:value={$currentCollege.address} rows="2"></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Logo URL</label>
                        <input type="text" class="form-control" name="logo_url" bind:value={$currentCollege.logo_url} />
                        {#if $currentCollege.logo_url}
                            <div class="mt-2 small text-center">
                                <span>Preview:</span><br>
                                <img src={$currentCollege.logo_url} alt="Preview" style="max-height: 50px; border: 1px solid #ddd; padding: 2px;">
                            </div>
                        {/if}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Delete Modal -->
{#if showDeleteModal}
<div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete College</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
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
                    <input type="hidden" name="id" value={$currentCollege.id} />
                    <p>Are you sure you want to delete college <strong>{$currentCollege.name}</strong>?</p>
                    <p class="text-danger small">This action cannot be undone.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}
