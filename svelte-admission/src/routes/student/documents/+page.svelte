<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { supabase } from '$lib/supabase'; // Client-side Supabase client
    import { writable } from 'svelte/store';
    import { v4 as uuidv4 } from 'uuid'; // Will need to install uuid
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;
    export let form: ActionData;

    $: console.log('[DocumentsSvelte] Received data.documents:', data.documents);
    $: console.log('[DocumentsSvelte] Selected applicationId:', selectedApplicationId);

    let selectedApplicationId: string = '';
    
    // Reactively set selected ID from URL
    $: {
        const appId = $page.url.searchParams.get('applicationId');
        if (appId) {
            selectedApplicationId = appId;
        }
    }

    // Determine if the selected application is locked
    $: selectedApp = data.applications.find(app => app.id === selectedApplicationId) as any;
    $: isAppLocked = selectedApp ? ['verified', 'approved'].includes(selectedApp.status) : false;

    let uploadFile: FileList | null = null;
    let isUploading = false;
    let isDeleting = false; // New state for delete operation

    let showDeleteModal = false;
    let showReuploadModal = false;
    let documentToDelete = writable({ id: '', file_path: '', document_type: '' });
    let documentToReupload = writable({ id: '', file_path: '', document_type: '', application_id: '' });

    // Handle dropdown change
    function handleApplicationChange() {
        if (selectedApplicationId) {
            goto(`/student/documents?applicationId=${selectedApplicationId}`);
        } else {
             goto(`/student/documents`);
        }
    }

    function openDeleteModal(doc: { id: string; file_path: string; document_type: string }) {
        documentToDelete.set(doc);
        showDeleteModal = true;
    }

    function openReuploadModal(doc: any) {
        documentToReupload.set(doc);
        uploadFile = null;
        showReuploadModal = true;
    }

    async function handleReupload() {
        if (isAppLocked) {
            alert('Application is locked. Cannot re-upload documents.');
            return;
        }

        if (!$documentToReupload.id || !uploadFile || uploadFile.length === 0) {
            alert('Please select a file.');
            return;
        }

        const file = uploadFile[0];

        // Validation
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
             alert('Invalid file type. Only PDF and Images are allowed.');
             return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB
            alert('File size exceeds 2MB limit.');
            return;
        }

        isUploading = true;
        startLoading(); // Show overlay

        const uploadData = new FormData();
        uploadData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: uploadData
            });
            const result = await response.json();

            if (!result.success) {
                alert(`Upload failed: ${result.message}`);
                isUploading = false;
                stopLoading();
                return;
            }

            // Update record in public.documents table
            const { error: dbError } = await supabase.from('documents').update({
                file_path: result.path,
                file_name: file.name,
                file_type: file.type,
                status: 'pending', // Reset status on re-upload
                rejection_reason: null // Clear rejection reason
            }).eq('id', $documentToReupload.id);

            if (dbError) {
                console.error('Error updating document record:', dbError.message);
                alert(`Failed to update document record: ${dbError.message}`);
            } else {
                // SYNC WITH APPLICATIONS TABLE form_data
                if ($documentToReupload.application_id) {
                    const { data: appData, error: appFetchError } = await supabase
                        .from('applications')
                        .select('form_data')
                        .eq('id', $documentToReupload.application_id)
                        .single();

                    if (appFetchError) {
                        console.error('Error fetching application to sync:', appFetchError.message);
                    } else if (appData && appData.form_data) {
                        let updatedFormData = { ...appData.form_data };
                        let dataChanged = false;

                        // Find the key that holds the old file path and update it
                        for (const key in updatedFormData) {
                            if (updatedFormData[key] === $documentToReupload.file_path) {
                                updatedFormData[key] = result.path;
                                dataChanged = true;
                            }
                        }

                        if (dataChanged) {
                            const { error: appUpdateError } = await supabase
                                .from('applications')
                                .update({ form_data: updatedFormData })
                                .eq('id', $documentToReupload.application_id);
                            
                            if (appUpdateError) {
                                console.error('Error syncing application form data:', appUpdateError.message);
                            }
                        }
                    }
                }

                // Delete old file from storage to clean up
                if ($documentToReupload.file_path && $documentToReupload.file_path !== result.path) {
                    await fetch('/api/upload', {
                        method: 'DELETE',
                        body: JSON.stringify({ path: $documentToReupload.file_path })
                    });
                }

                alert('Document re-uploaded successfully!');
                showReuploadModal = false;
                location.reload(); 
            }
        } catch (e) {
            console.error(e);
            alert('Upload failed due to network error.');
        } finally {
            isUploading = false;
            stopLoading();
        }
    }

    async function handleDeleteConfirmed() {
        if (!$documentToDelete.id) {
            return;
        }

        showDeleteModal = false;
        startLoading();
        
        // Call server action to handle deletion of file, record, and form_data sync
        const formPayload = new FormData();
        formPayload.append('document_id', $documentToDelete.id);

        const response = await fetch('?/delete', {
            method: 'POST',
            body: formPayload
        });

        const result = await deserialize(await response.text()); // Use deserialize for ActionData

        stopLoading();

        if (result.type === 'success') {
            alert('Document deleted successfully.');
            location.reload(); 
        } else {
             alert(`Error: ${result.data?.message || 'Failed to delete.'}`);
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">My Documents</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-body">
            <h5 class="card-title">Select Application</h5>
            <div class="mb-3">
                <label for="application-select" class="form-label">Application</label>
                <select class="form-select" id="application-select" bind:value={selectedApplicationId} on:change={handleApplicationChange}>
                    <option value="">Select an Application</option>
                    {#each data.applications as app}
                        {@const appAny = app as any}
                        <option value={app.id}>
                            {appAny.courses?.name} 
                            {appAny.branches?.name ? `- ${appAny.branches.name}` : ''} 
                            [{app.form_type || 'General'}] 
                            ({appAny.admission_cycles?.name})
                        </option>
                    {/each}
                </select>
            </div>
        </div>
    </div>

    {#if selectedApplicationId}
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">Uploaded Documents</h5>
                {#if data.documents.length > 0}
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Document Type</th>
                                    <th>File Name</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each data.documents as doc}
                                    <tr>
                                        <td>{doc.document_type}</td>
                                        <td><a href="{supabase.storage.from('documents').getPublicUrl(doc.file_path).data.publicUrl}" target="_blank" rel="noopener noreferrer">{doc.file_name}</a></td>
                                        <td>
                                            <span class="badge {doc.status === 'approved' ? 'bg-success' : doc.status === 'rejected' ? 'bg-danger' : 'bg-warning'}">
                                                {doc.status}
                                            </span>
                                            {#if doc.status === 'rejected' && doc.rejection_reason}
                                                <br><small class="text-danger">{doc.rejection_reason}</small>
                                            {/if}
                                        </td>
                                        <td>
                                            {#if !isAppLocked}
                                                <button class="btn btn-sm btn-primary me-2" on:click={() => openReuploadModal(doc)}>Re-upload</button>
                                                <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(doc)}>Delete</button>
                                            {:else}
                                                <span class="text-muted small">Locked</span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {:else}
                    <p>No documents found for this application.</p>
                {/if}
            </div>
        </div>
    {:else}
        <p class="text-info">Please select an application to view its documents.</p>
    {/if}
</div>

<!-- Re-upload Modal -->
<div class="modal" tabindex="-1" style="display: {showReuploadModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Re-upload Document: {$documentToReupload.document_type}</h5>
                <button type="button" class="btn-close" on:click={() => (showReuploadModal = false)} aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label for="reupload-file-input" class="form-label">Choose New File</label>
                    <input type="file" class="form-control" id="reupload-file-input" bind:files={uploadFile} accept="image/*,application/pdf" />
                    <div class="form-text">Max size: 2MB. Allowed: PDF, Images.</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => (showReuploadModal = false)}>Cancel</button>
                <button type="button" class="btn btn-primary" on:click={handleReupload} disabled={isUploading || !uploadFile}>
                    {#if isUploading}Uploading...{:else}Upload & Replace{/if}
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Delete Document Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Document</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)} aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to delete the document: <strong>{$documentToDelete.document_type}</strong>?</p>
                <p class="text-danger">This action cannot be undone.</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                <button type="button" class="btn btn-danger" on:click={handleDeleteConfirmed}>Delete Permanently</button>
            </div>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5); /* Dim the background */
    }
</style>