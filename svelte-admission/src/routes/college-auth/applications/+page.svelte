<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;
    export let form: ActionData;

    let selectedApplication: any | null = null;
    let showRejectionReasonModal = false;
    let currentDocumentIdForRejection: string | null = null;
    let applicationRejectionReason = '';
    let approvalComment = '';

    function changePage(newPage: number) {
        const url = new URL($page.url);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    $: totalPages = Math.ceil((data.count || 0) / (data.limit || 10));

    function selectApplication(app: any) {
        selectedApplication = app;
    }

    function openDocumentRejectionModal(documentId: string) {
        currentDocumentIdForRejection = documentId;
        showRejectionReasonModal = true;
    }

    async function approveDocument(documentId: string) {
        startLoading();
        const formData = new FormData();
        formData.append('document_id', documentId);

        const response = await fetch('?/approveDocument', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        stopLoading();
        
        if (result.type === 'success') {
            // Re-fetch data or update UI state
            selectedApplication.documents = selectedApplication.documents.map((doc: any) =>
                doc.id === documentId ? { ...doc, status: 'approved' } : doc
            );
        } else {
            alert(`Error approving document.`);
        }
    }

    async function rejectDocumentConfirmed() {
        if (!currentDocumentIdForRejection || !applicationRejectionReason) {
            alert('Please provide a rejection reason.');
            return;
        }
        
        startLoading();
        const formData = new FormData();
        formData.append('document_id', currentDocumentIdForRejection);
        formData.append('rejection_reason', applicationRejectionReason);

        const response = await fetch('?/rejectDocument', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        stopLoading();

        if (result.type === 'success') {
            // Re-fetch data or update UI state
            selectedApplication.documents = selectedApplication.documents.map((doc: any) =>
                doc.id === currentDocumentIdForRejection ? { ...doc, status: 'rejected', rejection_reason: applicationRejectionReason } : doc
            );
            showRejectionReasonModal = false;
            currentDocumentIdForRejection = null;
            applicationRejectionReason = '';
        } else {
            alert(`Error rejecting document.`);
        }
    }

    async function verifyApplication(applicationId: string) {
        startLoading();
        const formData = new FormData();
        formData.append('application_id', applicationId);
        if (approvalComment) formData.append('approval_comment', approvalComment);

        const response = await fetch('?/verifyApplication', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        stopLoading();

        if (result.type === 'success') {
            alert('Application verified and forwarded!');
            selectedApplication.status = 'verified'; // Optimistic UI update
            approvalComment = ''; // Reset comment
        } else {
            alert(`Error verifying application.`);
        }
    }

    async function rejectApplication(applicationId: string) {
        const reason = prompt('Enter reason for rejecting the application:');
        if (!reason) {
            alert('Rejection requires a reason.');
            return;
        }

        startLoading();
        const formData = new FormData();
        formData.append('application_id', applicationId);
        formData.append('rejection_reason', reason);

        const response = await fetch('?/rejectApplication', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        stopLoading();

        if (result.type === 'success') {
            alert('Application rejected!');
            selectedApplication.status = 'rejected'; // Optimistic UI update
            selectedApplication.rejection_reason = reason;
        } else {
            alert(`Error rejecting application.`);
        }
    }

    async function markFeePaid(applicationId: string) {
        if (!confirm('Mark this application fee as PAID manually? This will record a manual transaction.')) return;
        
        startLoading();
        const formData = new FormData();
        formData.append('application_id', applicationId);
        if (approvalComment) formData.append('approval_comment', approvalComment);

        const response = await fetch('?/markFeePaid', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        stopLoading();

        if (result.type === 'success') {
            alert('Fee marked as PAID.');
            selectedApplication.application_fee_status = 'paid';
            approvalComment = ''; // Reset comment
        } else {
            alert('Error marking fee as paid.');
        }
    }

    // --- Print Profile Logic ---
    let showPrintModal = false;
    let selectedPrintTemplate = '';
    let filteredPrintTemplates: any[] = [];
    let printTargetAppId = '';

    function handlePrintClick(app: any) {
        printTargetAppId = app.id;
        const appFormTypeId = data.formTypesMap[app.form_type];
        const appCourseId = app.course_id;
        
        const acYearRaw = app.admission_cycles?.academic_years;
        const acYear = Array.isArray(acYearRaw) ? acYearRaw[0] : acYearRaw;
        const appAcademicYearId = acYear?.id;
        
        filteredPrintTemplates = (data.printTemplates || []).filter((t: any) => {
            const matchesFormType = !t.target_form_type_id || t.target_form_type_id === appFormTypeId;
            const matchesAcademicYear = !t.target_academic_year_id || t.target_academic_year_id === appAcademicYearId;
            const matchesCourse = !t.target_course_id || t.target_course_id === appCourseId;
            return matchesFormType && matchesAcademicYear && matchesCourse;
        });

        if (filteredPrintTemplates.length === 0) {
            alert('No print templates available for this application.');
            return;
        }

        if (filteredPrintTemplates.length === 1) {
            window.open(`/print-profile/${app.id}?templateId=${filteredPrintTemplates[0].id}`, '_blank');
        } else {
            showPrintModal = true;
        }
    }

    function confirmPrintProfile() {
        if (!selectedPrintTemplate) {
            alert('Please select a template.');
            return;
        }
        window.open(`/print-profile/${printTargetAppId}?templateId=${selectedPrintTemplate}`, '_blank');
        showPrintModal = false;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">
        {#if data.userProfile?.role === 'adm_officer'}
            Admission Officer: Application Verification
        {:else}
            College Authority: Applications
        {/if}
    </h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="row">
        <div class="col-md-4">
            <div class="card">
                <div class="card-header">Applications for Review</div>
                {#if data.applications.length === 0}
                    <div class="list-group-item">No pending applications found.</div>
                {:else}
                    <ul class="list-group list-group-flush">
                        {#each data.applications as app}
                            <li class="list-group-item d-flex justify-content-between align-items-center
                                {selectedApplication?.id === app.id ? 'active' : ''}"
                                on:click={() => selectApplication(app)}
                                style="cursor: pointer;">
                                <div>
                                    <strong>{app.users?.full_name || app.users?.email}</strong>
                                    <br />
                                    <small>{app.courses?.name} {#if app.branches} - {app.branches.name}{/if} - {app.admission_cycles?.name}</small>
                                    <br />
                                    <span class="badge bg-info">{app.status}</span>
                                </div>
                            </li>
                        {/each}
                    </ul>
                    
                    {#if totalPages > 1}
                        <div class="card-footer d-flex justify-content-center p-2">
                            <button class="btn btn-sm btn-secondary me-1" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>&lt;</button>
                            <span class="align-self-center small mx-2">{data.page}/{totalPages}</span>
                            <button class="btn btn-sm btn-secondary ms-1" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>&gt;</button>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>

        <div class="col-md-8">
            {#if selectedApplication}
                <div class="card">
                    <div class="card-header">Application Details for {selectedApplication.users?.full_name || selectedApplication.users?.email}</div>
                    <div class="card-body">
                        <h5 class="card-title">Student Information</h5>
                        <p><strong>Email:</strong> {selectedApplication.users?.email}</p>
                        <p><strong>Course:</strong> {selectedApplication.courses?.name} {#if selectedApplication.branches} - <span class="badge bg-secondary">{selectedApplication.branches.name}</span>{/if}</p>
                        <p><strong>College:</strong> {selectedApplication.courses?.colleges?.name}</p>
                        <p><strong>Admission Cycle:</strong> {selectedApplication.admission_cycles?.name}</p>
                        <p><strong>Current Status:</strong> <span class="badge bg-info">{selectedApplication.status}</span>
                        {#if selectedApplication.approval_comment}
                            <span class="badge bg-light text-dark border ms-1" title="Approval Comment">
                                <i class="bi bi-chat-left-text me-1"></i>{selectedApplication.approval_comment}
                            </span>
                        {/if}
                        </p>
                        <p>
                            <strong>Fee Status:</strong> 
                            <span class="badge {selectedApplication.application_fee_status === 'paid' ? 'bg-success' : selectedApplication.application_fee_status === 'pending' ? 'bg-warning text-dark' : 'bg-secondary'}">
                                {selectedApplication.application_fee_status || 'N/A'}
                            </span>
                        </p>

                        <h5 class="card-title mt-4">Submitted Form Data</h5>
                        <div class="card mb-3 bg-light">
                            <div class="card-body">
                                {#if selectedApplication.form_data && Object.keys(selectedApplication.form_data).length > 0}
                                    <dl class="row mb-0">
                                        {#each Object.entries(selectedApplication.form_data) as [key, value]}
                                            <dt class="col-sm-4 text-capitalize">{key.replace(/_/g, ' ')}</dt>
                                            <dd class="col-sm-8">
                                                {#if typeof value === 'object' && value !== null}
                                                    <pre class="mb-0" style="font-size: 0.85rem;">{JSON.stringify(value, null, 2)}</pre>
                                                {:else}
                                                    {value}
                                                {/if}
                                            </dd>
                                        {/each}
                                    </dl>
                                {:else}
                                    <p class="mb-0 text-muted">No form data available.</p>
                                {/if}
                            </div>
                        </div>

                        <h5 class="card-title mt-4">Documents</h5>
                        {#if selectedApplication.documents && selectedApplication.documents.length > 0}
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>File</th>
                                            <th>Status</th>
                                            <th>Reason</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each selectedApplication.documents as doc}
                                            <tr>
                                                <td>{doc.document_type}</td>
                                                <td><a href="{doc.signed_url || doc.file_path}" target="_blank">{doc.file_name}</a></td> <!-- Link logic might need update based on storage -->
                                                <td><span class="badge {doc.status === 'approved' ? 'bg-success' : doc.status === 'rejected' ? 'bg-danger' : 'bg-warning'}">{doc.status}</span></td>
                                                <td>{doc.rejection_reason || 'N/A'}</td>
                                                <td>
                                                    {#if doc.status === 'pending' || doc.status === 'rejected'}
                                                        <button class="btn btn-sm btn-success me-2" on:click={() => approveDocument(doc.id)}>Approve</button>
                                                        <button class="btn btn-sm btn-danger" on:click={() => openDocumentRejectionModal(doc.id)}>Reject</button>
                                                    {/if}
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {:else}
                            <p>No documents submitted for this application.</p>
                        {/if}

                        <h5 class="card-title mt-4">Application Actions</h5>
                        <div class="mt-3">
                            <div class="mb-3">
                                <input type="text" class="form-control" bind:value={approvalComment} placeholder="Add a comment (optional)" />
                            </div>
                            <button class="btn btn-outline-info me-2" on:click={() => handlePrintClick(selectedApplication)}>
                                <i class="bi bi-printer me-1"></i> Print Profile
                            </button>
                            <button class="btn btn-success me-2" on:click={() => verifyApplication(selectedApplication.id)} disabled={selectedApplication.status === 'verified'}>
                                {selectedApplication.status === 'verified' ? 'Verified' : 'Verify & Forward'}
                            </button>
                            <button class="btn btn-danger me-2" on:click={() => rejectApplication(selectedApplication.id)} disabled={selectedApplication.status === 'rejected'}>
                                Reject Application
                            </button>
                            {#if selectedApplication.application_fee_status === 'pending'}
                                <button class="btn btn-warning" on:click={() => markFeePaid(selectedApplication.id)}>
                                    Mark Fee Paid (Manual)
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="card">
                    <div class="card-body text-center py-5">
                        <p class="text-muted mb-0">Select an application from the left panel to view details and perform actions.</p>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Document Rejection Reason Modal -->
<div class="modal" tabindex="-1" style="display: {showRejectionReasonModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Reject Document</h5>
                <button type="button" class="btn-close" on:click={() => (showRejectionReasonModal = false)}></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label for="rejection-reason" class="form-label">Reason for Rejection</label>
                    <textarea class="form-control" id="rejection-reason" bind:value={applicationRejectionReason} rows="3" required></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => (showRejectionReasonModal = false)}>Cancel</button>
                <button type="button" class="btn btn-danger" on:click={rejectDocumentConfirmed}>Reject Document</button>
            </div>
        </div>
    </div>
</div>

<!-- Print Selection Modal -->
{#if showPrintModal}
    <div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5); z-index: 1060;">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content shadow">
                <div class="modal-header">
                    <h5 class="modal-title">Select Print Template</h5>
                    <button type="button" class="btn-close" on:click={() => showPrintModal = false}></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Template</label>
                        <select class="form-select" bind:value={selectedPrintTemplate}>
                            <option value="">Select a template...</option>
                            {#each filteredPrintTemplates as t}
                                <option value={t.id}>{t.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showPrintModal = false}>Cancel</button>
                    <button type="button" class="btn btn-primary" on:click={confirmPrintProfile} disabled={!selectedPrintTemplate}>
                        <i class="bi bi-printer me-1"></i> Print Selected
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5); /* Dim the background */
    }
    .list-group-item.active {
        background-color: #0d6efd;
        border-color: #0d6efd;
    }
    .list-group-item.active strong, .list-group-item.active small {
        color: white;
    }
</style>
