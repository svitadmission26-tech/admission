<script lang="ts"> 
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import DynamicForm from '$lib/components/DynamicForm.svelte';

    export let data: PageData;
    export let form: ActionData;
    
    // Reactive update of application data if re-loaded or manually updated would be ideal, 
    // but for simple actions, page reload via form submission is fine.
    $: application = data.application;
    $: formSchema = data.formSchema;

    let rejecting = false;
    let rejectionReason = '';

    // Data Editing State
    let showDataEditModal = false;
    let editingFormData: Record<string, any> = {};

    function openDataEditor() {
        editingFormData = JSON.parse(JSON.stringify(application.form_data || {}));
        showDataEditModal = true;
    }

    function confirmReject() {
        if (!rejectionReason) {
            alert('Please enter a rejection reason.');
            return false;
        }
        return true;
    }

    // Modal State
    let showCancelModal = false;
    let cancelReason = '';

    let showTransferModal = false;
    let transferCourseId = '';
    let transferCycleId = '';
    let transferFormType = 'Provisional';
    let transferEnrollmentPrefixLetter = 'F'; // New: For Enrollment ID prefix
    let transferBranchId = '';

    let showPaymentEditModal = false;
    let selectedPayment: any = null;
    let editReceiptNumber = '';
    let editPaymentDate = '';

    let showPrintModal = false;
    let selectedPrintTemplate = '';
    $: availablePrintTemplates = data.printTemplates || [];

    function confirmPrintProfile() {
        if (!selectedPrintTemplate) {
            alert('Please select a template before printing.');
            return;
        }
        window.open(`/print-profile/${application.id}?templateId=${selectedPrintTemplate}`, '_blank');
        showPrintModal = false;
    }

    function handlePrintClick() {
        if (availablePrintTemplates.length === 0) {
            alert('No print templates available for this application.');
            return;
        }
        if (availablePrintTemplates.length === 1) {
            window.open(`/print-profile/${application.id}?templateId=${availablePrintTemplates[0].id}`, '_blank');
        } else {
            showPrintModal = true;
        }
    }

    function openPaymentEditor(payment: any) {
        selectedPayment = payment;
        editReceiptNumber = payment.receipt_number || '';
        editPaymentDate = payment.payment_date
            ? payment.payment_date.slice(0, 10)
            : new Date().toISOString().slice(0, 10);
        showPaymentEditModal = true;
    }

    function closePaymentEditor() {
        showPaymentEditModal = false;
        selectedPayment = null;
        editReceiptNumber = '';
        editPaymentDate = '';
    }

    // Reactive branches based on course selection
    $: transferBranches = transferCourseId 
        ? data.allCourses.find(c => c.id === transferCourseId)?.branches || [] 
        : [];
</script>

<div class="container mt-4 pb-5">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Application Details</h1>
        <a href="/adm-officer/dashboard" class="btn btn-outline-secondary">Back to Dashboard</a>
    </div>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="row">
        <!-- Student Info -->
        <div class="col-md-6 mb-4">
            <div class="card h-100 border-primary">
                <div class="card-header bg-primary text-white">Student Information</div>
                <div class="card-body">
                    <p><strong>Name:</strong> {application.student_user?.full_name || 'N/A'}</p>
                    <p><strong>Email:</strong> {application.student_user?.email || 'N/A'}</p>
                    <p><strong>User ID:</strong> <small>{application.student_user?.id}</small></p>
                    <p><strong>College ID:</strong> <span class="badge bg-secondary">{application.student_user?.student_profiles?.enrollment_number || 'Pending'}</span></p>
                </div>
            </div>
        </div>

        <!-- Application Info -->
        <div class="col-md-6 mb-4">
            <div class="card h-100 border-warning">
                <div class="card-header bg-warning text-dark">Course & Status</div>
                <div class="card-body">
                    <p><strong>Course:</strong> {application.courses?.name} ({application.courses?.code}) 
                        {#if application.branches} 
                            - <span class="badge bg-secondary">{application.branches.name}</span>
                        {:else if application.prov_branch_name}
                            - <span class="badge bg-light text-dark border" title="Branch from provisional application">{application.prov_branch_name} <small class="text-muted ms-1">Prov</small></span>
                        {/if}
                    </p>
                    <p><strong>Admission Type:</strong> <span class="badge bg-dark">{application.admission_type || 'Regular'}</span></p>
                    <p><strong>College:</strong> {application.courses?.colleges?.name}</p>
                    <p><strong>University:</strong> {application.courses?.colleges?.universities?.name}</p>
                    <p><strong>Cycle:</strong> {application.admission_cycles?.name} ({application.admission_cycles?.academic_years?.name})</p>
                    <hr>
                    <p><strong>Status:</strong> <span class="badge bg-info">{application.status}</span>
                    {#if application.approval_comment}
                        <span class="badge bg-light text-dark border ms-1" title="Approval Comment">
                            <i class="bi bi-chat-left-text me-1"></i>{application.approval_comment}
                        </span>
                    {/if}
                    </p>
                    <p>
                        <strong>Fee Status:</strong> 
                        <span class="badge {application.application_fee_status === 'paid' ? 'bg-success' : application.application_fee_status === 'pending' ? 'bg-warning text-dark' : 'bg-secondary'}">
                            {application.application_fee_status || 'N/A'}
                        </span>
                    </p>
                    <p><strong>Application ID:</strong> <small>{application.id}</small></p>
                    {#if application.account_admissions && application.account_admissions.length > 0}
                         <p><strong>Admission No:</strong> <span class="badge bg-success">{application.account_admissions[0].admission_number}</span></p>
                    {/if}
                    {#if application.rejection_reason}
                        <div class="alert alert-danger mt-2">
                            <strong>Rejection Reason:</strong> {application.rejection_reason}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <!-- Form Data Section -->
    <div class="card mb-4 border-secondary shadow-sm">
        <div class="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
            <span>Submitted Form Data</span>
            <button class="btn btn-sm btn-light" on:click={openDataEditor}>
                <i class="bi bi-pencil-square me-1"></i> Edit Data
            </button>
        </div>
        <div class="card-body {data.formSchema ? 'p-0' : 'bg-light'}">
            {#if data.formSchema}
                <div class="p-3">
                    <DynamicForm 
                        schema={data.formSchema} 
                        formData={{
                            ...application.form_data,
                            course_name: application.courses?.name || '',
                            branch_name: application.branches?.name || '',
                            course_id: application.course_id,
                            branch_id: application.branch_id,
                            admission_type: application.admission_type,
                            cycle_id: application.cycle_id,
                            form_type: application.form_type
                        }} 
                        readonly={true} 
                    />
                </div>
            {:else if application.form_data}
                <!-- Fallback: Standard List for legacy data without schema -->
                <div class="p-3 bg-light">
                    <div class="alert alert-info py-2 small mb-3">
                        <i class="bi bi-info-circle me-2"></i> 
                        Displaying raw data as no form schema was found for this application type.
                    </div>
                    <dl class="row mb-0">
                        {#each Object.entries(application.form_data) as [key, value]}
                            <dt class="col-sm-3 text-capitalize text-muted small">{key.replace(/_/g, ' ')}</dt>
                            <dd class="col-sm-9 fw-medium">
                                {#if typeof value === 'object' && value !== null}
                                    <pre class="mb-0" style="font-size: 0.8rem;">{JSON.stringify(value, null, 2)}</pre>
                                {:else}
                                    {value}
                                {/if}
                            </dd>
                        {/each}
                    </dl>
                </div>
            {:else}
                <div class="p-4 text-center text-muted">No form data available.</div>
            {/if}
        </div>
    </div>

    <!-- Documents -->
    <div class="card mb-4 border-dark">
        <div class="card-header bg-dark text-white">Documents</div>
        <div class="card-body">
            {#if application.documents && application.documents.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>File Name</th>
                                <th>Status</th>
                                <th>Rejection Reason</th>
                                <th>View</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each application.documents as doc}
                                <tr>
                                    <td>{doc.document_type}</td>
                                    <td>{doc.file_name}</td>
                                    <td>
                                        <span class="badge {doc.status === 'approved' ? 'bg-success' : doc.status === 'rejected' ? 'bg-danger' : 'bg-warning'}">
                                            {doc.status}
                                        </span>
                                    </td>
                                    <td>{doc.rejection_reason || '-'}</td>
                                    <td>
                                        <!-- Use signed_url if available, else file_path (fallback) -->
                                        <a href="{doc.signed_url || doc.file_path}" target="_blank" class="btn btn-sm btn-outline-primary">Open</a>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p class="mb-0">No documents uploaded.</p>
            {/if}
        </div>
    </div>

    <!-- Payments -->
    {#if application.payments && application.payments.length > 0}
        <div class="card mb-4">
            <div class="card-header">Payment History</div>
            <div class="card-body">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Payment Date</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Receipt</th>
                            <th>Status</th>
                            <th>Transaction ID</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each application.payments as payment}
                            <tr>
                                <td>{new Date(payment.payment_date || payment.created_at).toLocaleDateString()}</td>
                                <td>{payment.payment_type}</td>
                                <td>{payment.amount}</td>
                                <td>{payment.receipt_number || '-'}</td>
                                <td>{payment.status}</td>
                                <td>{payment.transaction_id || '-'}</td>
                                <td>
                                    <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => openPaymentEditor(payment)}>
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Actions -->
    <div class="card mb-4 border-primary">
        <div class="card-header bg-primary text-white">Application Actions</div>
        <div class="card-body">
            <div class="d-flex flex-wrap gap-3 align-items-start">
                <!-- Verify Form -->
                {#if application.status !== 'verified' && application.status !== 'approved' && application.status !== 'rejected'}
                    <form method="POST" action="?/verifyApplication" use:enhance={() => {
                        startLoading();
                        return async ({ update }) => {
                            await update();
                            stopLoading();
                        };
                    }}>
                        <input type="hidden" name="application_id" value={application.id} />
                        <input type="text" name="approval_comment" class="form-control form-control-sm mb-2" placeholder="Comment (optional)" style="max-width: 200px;" />
                        <button type="submit" class="btn btn-success">
                            Verify & Forward
                        </button>
                    </form>
                {:else}
                    <span class="btn btn-success disabled">Verified</span>
                {/if}

                <!-- Revert Verification -->
                {#if application.status === 'verified'}
                    <form method="POST" action="?/revertVerification" use:enhance={() => {
                        startLoading();
                        return async ({ update }) => {
                            await update();
                            stopLoading();
                        };
                    }} on:submit|preventDefault={(e) => { if(!confirm('Are you sure you want to revert this verification? This will unlock the application for edits.')) { stopLoading(); e.preventDefault(); } }}>
                        <input type="hidden" name="application_id" value={application.id} />
                        <button type="submit" class="btn btn-outline-warning">
                            <i class="bi bi-arrow-counterclockwise me-1"></i> Revert Verification
                        </button>
                    </form>
                {/if}

                <!-- Mark Fee Paid (Manual) -->
                {#if application.application_fee_status === 'pending'}
                    <form method="POST" action="?/markAppFeePaid" use:enhance={() => {
                        startLoading();
                        return async ({ update }) => {
                            await update();
                            stopLoading();
                        };
                    }} on:submit|preventDefault={(e) => { if(!confirm('Mark this application fee as PAID manually? This will record a manual transaction.')) { stopLoading(); e.preventDefault(); } }}>
                        <input type="hidden" name="application_id" value={application.id} />
                        <input type="text" name="approval_comment" class="form-control form-control-sm mb-2" placeholder="Comment (optional)" style="max-width: 200px;" />
                        <button type="submit" class="btn btn-warning">
                            Mark App Fee Paid (Manual)
                        </button>
                    </form>
                {/if}

                <!-- Cancel Admission (Only if Approved) -->
                {#if application.status === 'approved'}
                    <button class="btn btn-danger" on:click={() => showCancelModal = true}>
                        <i class="bi bi-x-circle me-1"></i> Cancel Admission
                    </button>
                    
                    <button class="btn btn-info text-white" on:click={() => showTransferModal = true}>
                        <i class="bi bi-arrow-left-right me-1"></i> Transfer Student
                    </button>

                    <!-- Revert Approval (Only for self-approved via auto_approve_on_verification) -->
                    {#if application.form_types?.auto_approve_on_verification === true}
                        <form method="POST" action="?/revertSelfApproval" use:enhance={() => {
                            startLoading();
                            return async ({ update }) => {
                                await update();
                                stopLoading();
                            };
                        }}>
                            <input type="hidden" name="application_id" value={application.id} />
                            <button type="submit" class="btn btn-outline-danger">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Revert Approval
                            </button>
                        </form>
                    {/if}
                {/if}

                <!-- Reject Form -->
                <div class="d-flex flex-column gap-2">
                    <button class="btn btn-outline-info" on:click={handlePrintClick}>
                        <i class="bi bi-printer me-1"></i> Print Profile Form
                    </button>
                    
                    {#if application.status === 'cancelled' || (Array.isArray(application.student_user?.student_profiles) ? application.student_user.student_profiles[0]?.admission_status : application.student_user?.student_profiles?.admission_status) === 'Cancelled'}
                        <form method="POST" action="?/recoverAdmission" use:enhance>
                            <input type="hidden" name="application_id" value={application.id} />
                            <button type="submit" class="btn btn-outline-success w-100">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Recover Admission
                            </button>
                        </form>
                    {:else if application.status === 'rejected'}
                        {@const hasTuitionPayment = application.payments?.some(p => p.payment_type === 'tuition_fee' && p.status === 'completed')}
                        {#if hasTuitionPayment}
                            <form method="POST" action="?/recoverAdmission" use:enhance>
                                <input type="hidden" name="application_id" value={application.id} />
                                <button type="submit" class="btn btn-outline-success w-100 mb-2">
                                    <i class="bi bi-arrow-counterclockwise me-1"></i> Recover Admission
                                </button>
                            </form>
                        {/if}
                        <form method="POST" action="?/revertRejection" use:enhance>
                            <input type="hidden" name="application_id" value={application.id} />
                            <button type="submit" class="btn btn-outline-warning w-100">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Revert Rejection
                            </button>
                        </form>
                    {:else}
                        <button class="btn btn-danger" on:click={() => rejecting = !rejecting} disabled={application.status === 'approved' || application.status === 'cancelled' || (Array.isArray(application.student_user?.student_profiles) ? application.student_user.student_profiles[0]?.admission_status : application.student_user?.student_profiles?.admission_status) === 'Cancelled'}>
                            Reject Application
                        </button>
                    {/if}
                    
                    {#if rejecting && application.status !== 'rejected'}
                        <form method="POST" action="?/rejectApplication" use:enhance on:submit|preventDefault={(e) => { if(!confirmReject()) e.preventDefault(); }}>
                            <input type="hidden" name="application_id" value={application.id} />
                            <div class="input-group">
                                <input type="text" class="form-control" name="rejection_reason" placeholder="Reason..." bind:value={rejectionReason} required />
                                <button class="btn btn-outline-danger" type="submit">Confirm</button>
                            </div>
                        </form>
                    {/if}
                </div>
            </div>
             <div class="mt-2 text-muted">
                <small>* Verifying will automatically approve all pending documents.</small>
            </div>
        </div>
    </div>

</div>

{#if showPaymentEditModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header bg-secondary text-white">
                <h5 class="modal-title">Edit Payment Details</h5>
                <button type="button" class="btn-close btn-close-white" on:click={closePaymentEditor}></button>
            </div>
            <form method="POST" action="?/updatePayment" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'success') {
                        closePaymentEditor();
                        toastStore.success('Payment updated successfully');
                    } else if (result.type === 'failure') {
                        toastStore.error(result.data?.message || 'Failed to update payment');
                    } else if (result.type === 'error') {
                        toastStore.error('An unexpected error occurred while updating payment.');
                    }
                    await update();
                };
            }}>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <input type="hidden" name="payment_id" value={selectedPayment?.id} />
                    <div class="mb-3">
                        <label class="form-label">Payment Type</label>
                        <input type="text" class="form-control" value={selectedPayment?.payment_type} readonly />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Receipt Number</label>
                        <input type="text" class="form-control" name="receipt_number" bind:value={editReceiptNumber} required />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Payment Date</label>
                        <input type="date" class="form-control" name="payment_date" bind:value={editPaymentDate} required />
                    </div>
                    <p class="small text-muted">
                        Receipt numbers must be unique. Payment date cannot be in the future.
                    </p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={closePaymentEditor}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Cancel Admission Modal -->
{#if showCancelModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header bg-danger text-white">
                <h5 class="modal-title">Cancel Admission</h5>
                <button type="button" class="btn-close btn-close-white" on:click={() => showCancelModal = false}></button>
            </div>
            <form method="POST" action="?/cancelAdmission" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'success') showCancelModal = false;
                    await update();
                };
            }}>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <input type="hidden" name="application_id" value={application.id} />
                    <p class="text-danger fw-bold">Warning: This action will revoke the student's admission and clear their College ID.</p>
                    <div class="mb-3">
                        <label class="form-label">Cancellation Reason</label>
                        <textarea name="reason" class="form-control" rows="3" required bind:value={cancelReason} placeholder="e.g. Student Request, Documents invalid..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showCancelModal = false}>Close</button>
                    <button type="submit" class="btn btn-danger">Confirm Cancellation</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Transfer Student Modal -->
{#if showTransferModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header bg-info text-white">
                <h5 class="modal-title">Transfer Student (Course/Branch Change)</h5>
                <button type="button" class="btn-close btn-close-white" on:click={() => showTransferModal = false}></button>
            </div>
            <form method="POST" action="?/transferStudent" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'success') {
                        showTransferModal = false;
                        toastStore.success('Transfer Processed Successfully');
                    } else if (result.type === 'failure') {
                        toastStore.error(result.data?.message || 'Transfer Failed');
                    } else if (result.type === 'error') {
                        toastStore.error('An error occurred during transfer.');
                    }
                    await update();
                };
            }}>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <input type="hidden" name="application_id" value={application.id} />
                    
                    <div class="alert alert-info">
                        <strong>Current:</strong> {application.courses?.name} 
                        {#if application.branches} - {application.branches.name}{/if}
                    </div>

                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label">New Course</label>
                            <select class="form-select" name="new_course_id" bind:value={transferCourseId} required>
                                <option value="">Select Course</option>
                                {#each data.allCourses as c}
                                    <option value={c.id}>{c.name} ({c.code})</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">New Branch</label>
                            <select class="form-select" name="new_branch_id" bind:value={transferBranchId} disabled={!transferBranches.length}>
                                <option value="">{transferBranches.length ? 'Select Branch (Optional)' : 'No Branches'}</option>
                                {#each transferBranches as b}
                                    <option value={b.id}>{b.name} ({b.code})</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Admission Cycle</label>
                            <select class="form-select" name="new_cycle_id" bind:value={transferCycleId} required>
                                <option value="">Select Cycle</option>
                                {#each data.allCycles as cy}
                                    <option value={cy.id}>{cy.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Form Type</label>
                            <select class="form-select" name="new_form_type" bind:value={transferFormType} required>
                                {#each data.allFormTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">College ID Prefix Letter</label>
                            <input 
                                type="text" 
                                class="form-control" 
                                name="enrollment_prefix_letter" 
                                bind:value={transferEnrollmentPrefixLetter} 
                                required 
                                maxlength="2" 
                                placeholder="e.g. F"
                            />
                        </div>
                    </div>
                    
                    <p class="small text-muted">
                        Note: Transferring will regenerate the College ID and update the student profile. 
                        The application form data will be merged with the new course's requirements.
                    </p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showTransferModal = false}>Close</button>
                    <button type="submit" class="btn btn-primary">Process Transfer</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Print Modal -->
{#if showPrintModal}
    <div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5)">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Select Custom Profile Form Template</h5>
                    <button type="button" class="btn-close" on:click={() => showPrintModal = false}></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Template</label>
                        <select class="form-select" bind:value={selectedPrintTemplate}>
                            <option value="">Select a template...</option>
                            {#each availablePrintTemplates as t}
                                <option value={t.id}>{t.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showPrintModal = false}>Cancel</button>
                    <button type="button" class="btn btn-primary" on:click={confirmPrintProfile}>Print Form</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Edit Application Data Modal -->
{#if showDataEditModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5); z-index: 1050;">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header bg-secondary text-white">
                <h5 class="modal-title">Edit Application Form Data</h5>
                <button type="button" class="btn-close btn-close-white" on:click={() => showDataEditModal = false}></button>
            </div>
            <form method="POST" action="?/saveFormData" enctype="multipart/form-data" use:enhance={() => {
                startLoading();
                return async ({ result, update }) => {
                    stopLoading();
                    if (result.type === 'success') {
                        showDataEditModal = false;
                        toastStore.success('Application data updated successfully');
                        await update();
                    } else if (result.type === 'failure') {
                        toastStore.error(result.data?.message || 'Failed to update data');
                    } else {
                        toastStore.error('An unexpected error occurred.');
                    }
                };
            }}>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    {#if formSchema}
                        <DynamicForm schema={formSchema} bind:formData={editingFormData} />
                        <input type="hidden" name="form_data" value={JSON.stringify(editingFormData)} />
                    {:else}
                        <div class="alert alert-warning">
                            No form schema found for this application type. Editing is limited.
                        </div>
                        <!-- Fallback: Raw JSON editor if no schema? For now just show warning -->
                    {/if}
                    <div class="mt-3 text-muted small">
                        <i class="bi bi-info-circle me-1"></i> Changes made here will update the student's submitted application data directly.
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => showDataEditModal = false}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}
