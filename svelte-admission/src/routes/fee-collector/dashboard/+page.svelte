<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { goto } from '$app/navigation'; // Import goto

    export let data: PageData;
    export let form: ActionData;
    let selectedStatus = data.selectedStatus; // Initialize with status from page.server.ts
    let selectedCourseId = data.selectedCourseId;

    $: selectedStatus = data.selectedStatus;
    $: selectedCourseId = data.selectedCourseId;

    function handleFilterChange() {
        const url = new URL(window.location.href);
        url.searchParams.set('status', selectedStatus);
        url.searchParams.set('course_id', selectedCourseId);
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function handleStatusChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        selectedStatus = target.value;
        handleFilterChange();
    }

    function handleCourseChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        selectedCourseId = target.value;
        handleFilterChange();
    }

    function changePage(newPage: number) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    let showStatusUpdateModal = false;
    let currentAccountAdmission = writable({
        id: '',
        admission_number: '',
        account_status: '',
        remarks: '',
        applications: {
            users: { full_name: '', email: '' },
            courses: { name: '' },
        }
    } as any);

    let newStatus = '';
    let newRemarks = '';

    function openStatusUpdateModal(admission: any) {
        currentAccountAdmission.set(admission);
        newStatus = admission.account_status;
        newRemarks = admission.remarks || '';
        showStatusUpdateModal = true;
    }

    // Helper to get fee structure for a given application ID
    $: getFeeStructure = (applicationId: string) => {
        const fsEntry = data.feeStructures.find(fs => fs.applicationId === applicationId);
        return fsEntry?.feeStructure || null;
    };

    // Helper to calculate total paid amount for a given application ID
    $: getPaidAmount = (applicationPayments: any[]) => {
        return applicationPayments
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + p.amount, 0);
    };

    // Helper to calculate outstanding balance
    $: getOutstandingBalance = (admission: any) => {
        const feeStructure = getFeeStructure(admission.application_id);
        if (!feeStructure) return null;
        const totalFee = feeStructure.total_fee;
        const paid = getPaidAmount(admission.applications.payments || []);
        return totalFee - paid;
    };
</script>

<div class="container-fluid">
    <h1 class="mb-4">Fee Collector / Accounts Dashboard</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
            <h4>Admissions for Payment Tracking</h4>
            <div class="d-flex align-items-center gap-3">
                <div class="d-flex align-items-center">
                    <label for="courseFilter" class="form-label mb-0 me-2">Course:</label>
                    <select id="courseFilter" class="form-select form-select-sm" bind:value={selectedCourseId} on:change={handleCourseChange}>
                        <option value="">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="d-flex align-items-center">
                    <label for="statusFilter" class="form-label mb-0 me-2">Status:</label>
                    <select id="statusFilter" class="form-select form-select-sm" bind:value={selectedStatus} on:change={handleStatusChange}>
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="cleared">Cleared</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="card-body">
            {#if data.accountAdmissions.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Admission No.</th>
                                <th>Student Name</th>
                                <th>Course</th>
                                <th>Total Fee</th>
                                <th>Paid</th>
                                <th>Outstanding</th>
                                <th>Account Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.accountAdmissions as admission, i}
                                {@const admAny = admission as any}
                                {@const totalFee = getFeeStructure(admAny.application_id)?.total_fee || 0}
                                {@const paidAmount = getPaidAmount(admAny.applications?.payments || [])}
                                {@const outstanding = getOutstandingBalance(admAny)}
                                <tr>
                                    <td>{(data.pagination.page - 1) * data.pagination.limit + i + 1}</td>
                                    <td>{admAny.admission_number}</td>
                                    <td>{admAny.applications?.student_user?.full_name || admAny.applications?.student_user?.email}</td>
                                    <td>{admAny.applications?.courses?.name}</td>
                                    <td>{totalFee}</td>
                                    <td>{paidAmount}</td>
                                    <td>{outstanding !== null ? outstanding : 'N/A'}</td>
                                    <td><span class="badge bg-secondary">{admAny.account_status}</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-primary me-1" on:click={() => openStatusUpdateModal(admAny)}>Update Status</button>
                                        <a href="/fee-collector/payments/collect/{admAny.id}" class="btn btn-sm btn-success">Collect Fee</a>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Controls -->
                {#if data.pagination && data.pagination.totalPages > 1}
                    <div class="d-flex justify-content-center align-items-center mt-3 gap-3">
                        <button 
                            class="btn btn-sm btn-outline-secondary" 
                            disabled={data.pagination.page <= 1}
                            on:click={() => changePage(data.pagination.page - 1)}
                        >
                            <i class="bi bi-chevron-left"></i> Previous
                        </button>
                        
                        <span class="text-muted">
                            Page <strong>{data.pagination.page}</strong> of {data.pagination.totalPages}
                            <small class="ms-1">({data.pagination.total} total)</small>
                        </span>

                        <button 
                            class="btn btn-sm btn-outline-secondary" 
                            disabled={data.pagination.page >= data.pagination.totalPages}
                            on:click={() => changePage(data.pagination.page + 1)}
                        >
                            Next <i class="bi bi-chevron-right"></i>
                        </button>
                    </div>
                {/if}
            {:else}
                <p>No admissions found for payment tracking.</p>
            {/if}
        </div>
    </div>
</div>

<!-- Status Update Modal -->
<div class="modal" tabindex="-1" style="display: {showStatusUpdateModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Update Account Status for {$currentAccountAdmission.admission_number}</h5>
                <button type="button" class="btn-close" on:click={() => (showStatusUpdateModal = false)}></button>
            </div>
            <form method="POST" action="?/updateAccountStatus" use:enhance={() => { 
                showStatusUpdateModal = false; 
                startLoading();
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="account_admission_id" value={$currentAccountAdmission.id} />
                    <div class="mb-3">
                        <label for="status-select" class="form-label">Account Status</label>
                        <select class="form-select" id="status-select" name="status" bind:value={newStatus}>
                            <option value="pending">Pending</option>
                            <option value="partial">Partial</option>
                            <option value="cleared">Cleared</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="remarks" class="form-label">Remarks</label>
                        <textarea class="form-control" id="remarks" name="remarks" bind:value={newRemarks} rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showStatusUpdateModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
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
