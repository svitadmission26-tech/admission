<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false;

    let currentUniversity = writable({ 
        id: '', 
        name: '', 
        code: '', 
        address: '',
        logo_url: '',
        contact_email: '',
        contact_phone: '',
        website: '',
        footer_text: ''
    });

    function openEditModal(university: any) {
        currentUniversity.set({
            ...university,
            logo_url: university.logo_url || '',
            contact_email: university.contact_email || '',
            contact_phone: university.contact_phone || '',
            website: university.website || '',
            footer_text: university.footer_text || ''
        });
        showEditModal = true;
    }

    function openDeleteModal(university: { id: string; name: string } | any) {
        currentUniversity.set(university);
        showDeleteModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Universities</h1>

    <button class="btn btn-primary mb-3" on:click={() => (showAddModal = true)}>Add New University</button>

    {#if data.universities.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Address</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.universities as university}
                        <tr>
                            <td>{university.name}</td>
                            <td>{university.code}</td>
                            <td>{university.address}</td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(university)}>Edit</button>
                                <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(university)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No universities found. Add one!</p>
    {/if}
</div>

<!-- Add University Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New University</h5>
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
                        <label for="name" class="form-label">University Name</label>
                        <input type="text" class="form-control" id="name" name="name" required />
                    </div>
                    <div class="mb-3">
                        <label for="code" class="form-label">University Code</label>
                        <input type="text" class="form-control" id="code" name="code" />
                    </div>
                    <div class="mb-3">
                        <label for="address" class="form-label">Address</label>
                        <textarea class="form-control" id="address" name="address"></textarea>
                    </div>
                    <div class="mb-3">
                        <label for="logo_url" class="form-label">Logo URL</label>
                        <input type="text" class="form-control" id="logo_url" name="logo_url" placeholder="https://example.com/logo.png" />
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="contact_email" class="form-label">Contact Email</label>
                            <input type="email" class="form-control" id="contact_email" name="contact_email" />
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="contact_phone" class="form-label">Contact Phone</label>
                            <input type="text" class="form-control" id="contact_phone" name="contact_phone" />
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="website" class="form-label">Website</label>
                        <input type="url" class="form-control" id="website" name="website" placeholder="https://university.edu" />
                    </div>
                    <div class="mb-3">
                        <label for="footer_text" class="form-label">Footer Text</label>
                        <input type="text" class="form-control" id="footer_text" name="footer_text" placeholder="© 2026 University Name" />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create University</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit University Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit University</h5>
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
                    <input type="hidden" name="id" value={$currentUniversity.id} />
                    <div class="mb-3">
                        <label for="edit-name" class="form-label">University Name</label>
                        <input type="text" class="form-control" id="edit-name" name="name" bind:value={$currentUniversity.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-code" class="form-label">University Code</label>
                        <input type="text" class="form-control" id="edit-code" name="code" bind:value={$currentUniversity.code} />
                    </div>
                    <div class="mb-3">
                        <label for="edit-address" class="form-label">Address</label>
                        <textarea class="form-control" id="edit-address" name="address" bind:value={$currentUniversity.address}></textarea>
                    </div>
                    <div class="mb-3">
                        <label for="edit-logo_url" class="form-label">Logo URL</label>
                        <input type="text" class="form-control" id="edit-logo_url" name="logo_url" bind:value={$currentUniversity.logo_url} />
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="edit-contact_email" class="form-label">Contact Email</label>
                            <input type="email" class="form-control" id="edit-contact_email" name="contact_email" bind:value={$currentUniversity.contact_email} />
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="edit-contact_phone" class="form-label">Contact Phone</label>
                            <input type="text" class="form-control" id="edit-contact_phone" name="contact_phone" bind:value={$currentUniversity.contact_phone} />
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="edit-website" class="form-label">Website</label>
                        <input type="url" class="form-control" id="edit-website" name="website" bind:value={$currentUniversity.website} />
                    </div>
                    <div class="mb-3">
                        <label for="edit-footer_text" class="form-label">Footer Text</label>
                        <input type="text" class="form-control" id="edit-footer_text" name="footer_text" bind:value={$currentUniversity.footer_text} />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete University Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete University</h5>
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
                    <input type="hidden" name="id" value={$currentUniversity.id} />
                    <p>Are you sure you want to delete university <strong>{$currentUniversity.name}</strong>?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5); /* Dim the background */
    }
</style>