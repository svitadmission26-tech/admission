<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    import { supabase } from '$lib/supabase';
    import PaymentButton from '$lib/components/PaymentButton.svelte';

    export let data: PageData;

    let filterCourseId = $page.url.searchParams.get('courseId') || '';
    let filterCycleId = $page.url.searchParams.get('cycleId') || '';
    let filterStatus = $page.url.searchParams.get('status') || '';
    let filterFormType = $page.url.searchParams.get('formType') || '';
    let filterBranchId = $page.url.searchParams.get('branchId') || '';
    let filterSearch = $page.url.searchParams.get('search') || '';
    let filterCreatedBy = $page.url.searchParams.get('createdBy') || '';
    let filterUpdatedBy = $page.url.searchParams.get('updatedBy') || '';

    // Filter branches based on course
    $: filteredBranches = filterCourseId 
        ? data.branches.filter((b: any) => b.course_id === filterCourseId)
        : data.branches;

    // Pagination variables
    $: currentPage = data.page;
    $: currentLimit = data.limit;
    $: totalItems = data.totalCount;
    $: totalPages = Math.ceil(totalItems / currentLimit);

    function applyFilters() {
        const query = new URLSearchParams();
        if (filterCourseId) query.set('courseId', filterCourseId);
        if (filterCycleId) query.set('cycleId', filterCycleId);
        if (filterStatus) query.set('status', filterStatus);
        if (filterFormType) query.set('formType', filterFormType);
        if (filterBranchId) query.set('branchId', filterBranchId);
        if (filterSearch) query.set('search', filterSearch);
        if (filterCreatedBy) query.set('createdBy', filterCreatedBy);
        if (filterUpdatedBy) query.set('updatedBy', filterUpdatedBy);
        query.set('page', '1'); // Reset to first page when filters apply
        goto(`?${query.toString()}`);
    }

    function getDisplayName(app: any) {
        // First try full_name from users table
        if (app.users?.full_name) {
            return app.users.full_name;
        }
        
        // If not available, try to combine from form_data
        const formData = app.form_data || {};
        const firstName = formData.firstname || formData.first_name || '';
        const middleName = formData.middlename || formData.middle_name || '';
        const lastName = formData.lastname || formData.last_name || '';
        
        const combined = [firstName, middleName, lastName].filter(n => n).join(' ');
        return combined || 'N/A';
    }

    function clearFilters() {
        filterCourseId = '';
        filterCycleId = '';
        filterStatus = '';
        filterFormType = '';
        filterBranchId = '';
        filterSearch = '';
        filterCreatedBy = '';
        filterUpdatedBy = '';
        goto('?');
    }

    function handleSearchKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            applyFilters();
        }
    }

    function handleSort(field: string) {
        const query = new URLSearchParams($page.url.searchParams);
        const currentSort = query.get('sort');
        const currentOrder = query.get('order') || 'desc';
        
        let newOrder = 'desc';
        if (currentSort === field && currentOrder === 'desc') {
            newOrder = 'asc';
        }
        
        query.set('sort', field);
        query.set('order', newOrder);
        goto(`?${query.toString()}`);
    }

    function handleLimitChange(newLimit: number) {
        const query = new URLSearchParams($page.url.searchParams);
        query.set('limit', newLimit.toString());
        query.set('page', '1'); // Reset to first page
        goto(`?${query.toString()}`);
    }

    function gotoPage(newPage: number) {
        if (newPage >= 1 && newPage <= totalPages) {
            const query = new URLSearchParams($page.url.searchParams); // Preserve existing params
            query.set('page', newPage.toString());
            goto(`?${query.toString()}`);
        }
    }

    // --- Print Profile Logic ---
    let showPrintModal = false;
    let selectedPrintTemplate = '';
    let filteredPrintTemplates: any[] = [];
    let printTargetAppId = '';

    // --- Payment Modal Logic ---
    let showPaymentModal = false;
    let currentApp: any = null;
    let paymentDetails = { amount: 0, mode: 'qr', reference: '', qrCodeUrl: '' };
    let isSubmittingPayment = false;

    function handlePrintClick(app: any) {
        printTargetAppId = app.id;
        const appFormTypeId = data.formTypesMap[app.form_type]?.id;
        const appCourseId = app.course_id;
        const appAcademicYearId = app.admission_cycles?.academic_year_id;
        
        filteredPrintTemplates = (data.printTemplates || []).filter((t: any) => {
            const matchesFormType = !t.target_form_type_id || t.target_form_type_id === appFormTypeId;
            const matchesAcademicYear = !t.target_academic_year_id || t.target_academic_year_id === appAcademicYearId;
            const matchesCourse = !t.target_course_id || t.target_course_id === appCourseId;
            return matchesFormType && matchesAcademicYear && matchesCourse;
        });

        if (filteredPrintTemplates.length === 0) {
            toastStore.error('No print templates available for this application.');
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
            toastStore.error('Please select a template.');
            return;
        }
        window.open(`/print-profile/${printTargetAppId}?templateId=${selectedPrintTemplate}`, '_blank');
        showPrintModal = false;
    }

    function isProvisional(app: any) {
        // data.formTypesMap is passed from server
        return !!data.formTypesMap[app.form_type]?.is_prov;
    }

    function isPaid(app: any) {
        if (!app.payments) return false;
        return app.payments.some((p: any) => p.payment_type === 'provisional_fee' && p.status === 'completed');
    }

    async function openPaymentModal(app: any) {
        currentApp = app;
        paymentDetails = { amount: 0, mode: 'qr', reference: '', qrCodeUrl: '' };
        
        const cId = app.courses?.id || app.course_id;
        const cyId = app.admission_cycles?.id || app.cycle_id;
         
        console.log(`Fetching fee for Course: ${cId}, Cycle: ${cyId}, Type: ${app.form_type}`);

        // Fetch fee and QR code
        const { data: form, error } = await supabase
            .from('admission_forms')
            .select('prov_fee, qr_code_url')
            .eq('course_id', cId)
            .eq('cycle_id', cyId)
            .eq('form_type', app.form_type)
            .maybeSingle();
        
        console.log('Fee Query Result:', { form, error });

        if (error) {
            console.error('Error fetching fee:', error);
            toastStore.error('Could not fetch fee details.');
            return;
        }

        if (!form) {
            console.warn('No admission form found for fee lookup.');
            // Fallback or just show 0
        }

        paymentDetails.amount = form?.prov_fee || 0;
        paymentDetails.qrCodeUrl = form?.qr_code_url || '';
        console.log('Set Payment Amount:', paymentDetails.amount, 'QR Code:', paymentDetails.qrCodeUrl);
        showPaymentModal = true;
    }

    function closePaymentModal() {
        showPaymentModal = false;
        currentApp = null;
    }

    function printReceipt(app: any) {
        if (!app.payments) return;
        // Find the provisional fee payment
        const payment = app.payments.find((p: any) => p.payment_type === 'provisional_fee' && p.status === 'completed');
        
        if (payment) {
            window.open(`/receipts/print?payment_id=${payment.id}`, '_blank');
        } else {
            toastStore.error('No completed provisional payment found.');
        }
    }

    function printUndertaking(app: any) {
        window.open(`/deo/undertaking/${app.id}`, '_blank');
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">My Applications (DEO)</h1>

    <!-- Filters -->
    <div class="card mb-4 shadow-sm">
        <div class="card-header bg-light fw-bold">Filter Applications</div>
        <div class="card-body">
            <div class="row g-3">
                <!-- Row 1 -->
                <div class="col-md-3">
                    <label class="form-label small fw-bold">Course</label>
                    <select class="form-select" bind:value={filterCourseId} on:change={() => filterBranchId = ''}>
                        <option value="">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label small fw-bold">Admission Cycle</label>
                    <select class="form-select" bind:value={filterCycleId}>
                        <option value="">All Cycles</option>
                        {#each data.cycles as cycle}
                            <option value={cycle.id}>{cycle.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label small fw-bold">Branch</label>
                    <select class="form-select" bind:value={filterBranchId}>
                        <option value="">All Branches</option>
                        {#each filteredBranches as branch}
                            <option value={branch.id}>{branch.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label small fw-bold">Form Type</label>
                    <select class="form-select" bind:value={filterFormType}>
                        <option value="">All Types</option>
                        {#each data.formTypes as ft}
                            <option value={ft.name}>{ft.name}</option>
                        {/each}
                    </select>
                </div>

                <!-- Row 2 -->
                <div class="col-md-2">
                    <label class="form-label small fw-bold">Status</label>
                    <select class="form-select" bind:value={filterStatus}>
                        <option value="">All Statuses</option>
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                        <option value="verified">Verified</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="waitlisted">Waitlisted</option>
                        <option value="needs_correction">Needs Correction</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small fw-bold">Created By</label>
                    <select class="form-select" bind:value={filterCreatedBy}>
                        <option value="">Any</option>
                        <option value="student">Student (Self)</option>
                        <optgroup label="Staff">
                            {#each data.staffUsers as staff}
                                <option value={staff.id}>{staff.full_name}</option>
                            {/each}
                        </optgroup>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small fw-bold">Updated By</label>
                    <select class="form-select" bind:value={filterUpdatedBy}>
                        <option value="">Any</option>
                        <option value="student">Student (Self)</option>
                        <optgroup label="Staff">
                            {#each data.staffUsers as staff}
                                <option value={staff.id}>{staff.full_name}</option>
                            {/each}
                        </optgroup>
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label small fw-bold">Search</label>
                    <div class="input-group">
                        <input type="text" class="form-control" placeholder="Student Name..." bind:value={filterSearch} on:keydown={handleSearchKeydown}>
                        <button class="btn btn-primary" type="button" on:click={applyFilters}>
                            <i class="bi bi-search"></i>
                        </button>
                    </div>
                </div>
                <div class="col-md-2 d-flex align-items-end gap-2">
                    <button class="btn btn-primary flex-grow-1" on:click={applyFilters}>Apply</button>
                    <button class="btn btn-outline-secondary" on:click={clearFilters}>Clear</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Applications Table -->
    <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="d-flex align-items-center gap-3">
                <span class="fw-bold">Applications List</span>
                <span class="badge bg-secondary">{totalItems} Found</span>
            </div>
            
            <div class="d-flex align-items-center gap-3">
                <div class="d-flex align-items-center gap-2">
                    <small class="text-muted">Per Page:</small>
                    <select class="form-select form-select-sm" style="width: auto;" value={currentLimit} on:change={(e) => handleLimitChange(parseInt(e.currentTarget.value))}>
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>

                {#if totalPages > 1}
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted">Page {currentPage} of {totalPages}</small>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" disabled={currentPage === 1} on:click={() => gotoPage(currentPage - 1)}>
                                <i class="bi bi-chevron-left"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" disabled={currentPage === totalPages} on:click={() => gotoPage(currentPage + 1)}>
                                <i class="bi bi-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
        <div class="card-body">
            {#if data.applications.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover align-middle">
                        <thead>
                            <tr>
                                <th style="width: 50px">#</th>
                                <th>Student</th>
                                <th>Course & Cycle</th>
                                <th style="cursor: pointer;" on:click={() => handleSort('status')}>
                                    Status {data.filters.sort === 'status' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="text-nowrap" style="cursor: pointer;" on:click={() => handleSort('receipt_number')}>
                                    Receipt No {data.filters.sort === 'receipt_number' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th style="cursor: pointer;" on:click={() => handleSort('updated_at')}>
                                    Last Updated {data.filters.sort === 'updated_at' ? (data.filters.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.applications as app, i}
                                {@const appAny = app as any}
                                {@const isProvType = data.formTypesMap?.[appAny.form_type]?.is_prov === true}
                                {@const appReceiptPayment = (appAny.payments || []).find(p => p.payment_type === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) || (appAny.payments || []).find(p => p.receipt_number)}
                                <tr>
                                    <td>{(currentPage - 1) * currentLimit + i + 1}</td>
                                    <td>
                                        {getDisplayName(appAny)}
                                        {#if appAny.users?.student_profiles?.enrollment_number}
                                            <br/><small class="text-muted">College ID: {appAny.users.student_profiles.enrollment_number}</small>
                                        {/if}
                                        <br/>
                                        <small class="text-muted">{appAny.users?.email}</small>
                                    </td>
                                    <td>
                                        {appAny.courses?.name}
                                        {#if appAny.branches?.name} <span class="badge bg-light text-dark border ms-1">{appAny.branches.name}</span> {/if}
                                        <br/>
                                        <small class="text-muted">{appAny.admission_cycles?.name}</small>
                                    </td>
                                    <td>
                                        <span class="badge 
                                            {appAny.status === 'approved' ? 'bg-success' : 
                                            appAny.status === 'rejected' ? 'bg-danger' : 
                                            appAny.status === 'verified' ? 'bg-primary' : 
                                            appAny.status === 'submitted' ? 'bg-info' : 'bg-warning text-dark'}">
                                            {appAny.status}
                                        </span>
                                    </td>
                                    <td class="text-nowrap">
                                        {#if appReceiptPayment?.receipt_number}
                                            <small class="fw-bold">{appReceiptPayment.receipt_number}</small>
                                        {:else}
                                            <small class="text-muted">-</small>
                                        {/if}
                                    </td>
                                    <td>
                                        <div>{new Date(appAny.updated_at).toLocaleDateString()}</div>
                                        {#if appAny.updater}
                                            <small class="text-muted">by {appAny.updater.full_name}</small>
                                        {/if}
                                    </td>
                                    <td>
                                        <div class="d-flex gap-1 flex-wrap">
                                            <a href="/deo/apply?applicationId={appAny.id}" class="btn btn-sm btn-outline-primary">
                                                {appAny.status === 'draft' || appAny.status === 'needs_correction' ? 'Edit' : 'View'}
                                            </a>
                                            <button class="btn btn-sm btn-outline-secondary" on:click={() => handlePrintClick(appAny)}>
                                                <i class="bi bi-printer"></i>
                                            </button>
                                            {#if appAny.application_fee_status === 'pending' && appAny.form_fee > 0}
                                                <PaymentButton 
                                                    applicationId={appAny.id} 
                                                    studentId={appAny.student_id || appAny.users?.id} 
                                                    amount={appAny.form_fee} 
                                                    paymentType="application_fee" 
                                                    buttonText="Pay App Fee" 
                                                    buttonClass="btn btn-sm btn-outline-warning" 
                                                    returnUrl="/deo/applications"
                                                />
                                            {/if}
                                            {#if appAny.status === 'approved' && isProvisional(appAny)}
                                                {#if !isPaid(appAny)}
                                                    <button class="btn btn-sm btn-success" on:click={() => openPaymentModal(appAny)}>
                                                        <i class="bi bi-cash-coin"></i> Fee
                                                    </button>
                                                {:else}
                                                    <button class="btn btn-sm btn-info text-white" on:click={() => printReceipt(appAny)}>
                                                        <i class="bi bi-printer"></i> Receipt
                                                    </button>
                                                    <button class="btn btn-sm btn-warning" on:click={() => printUndertaking(appAny)}>
                                                        <i class="bi bi-file-text"></i> Undertaking
                                                    </button>
                                                {/if}
                                            {/if}
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p class="text-muted text-center py-4">No applications found matching your criteria.</p>
            {/if}
        </div>
    </div>
    {#if totalPages > 1}
    <div class="card-footer">
        <nav aria-label="Applications list pagination">
            <ul class="pagination justify-content-center mb-0">
                <li class="page-item" class:disabled={currentPage === 1}>
                    <button class="page-link" on:click={() => gotoPage(currentPage - 1)} aria-label="Previous">
                        <span aria-hidden="true">&laquo;</span>
                    </button>
                </li>
                {#each Array(totalPages) as _, i}
                    <li class="page-item" class:active={currentPage === i + 1}>
                        <button class="page-link" on:click={() => gotoPage(i + 1)}>{i + 1}</button>
                    </li>
                {/each}
                <li class="page-item" class:disabled={currentPage === totalPages}>
                    <button class="page-link" on:click={() => gotoPage(currentPage + 1)} aria-label="Next">
                        <span aria-hidden="true">&raquo;</span>
                    </button>
                </li>
            </ul>
        </nav>
    </div>
    {/if}
</div>

<!-- Payment Modal -->
{#if showPaymentModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content shadow-lg border-0">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title d-flex align-items-center">
                    <i class="bi bi-cash-coin me-2"></i>
                    Collect Provisional Fee
                </h5>
                <button type="button" class="btn-close btn-close-white" on:click={closePaymentModal}></button>
            </div>
            <form method="POST" action="?/collectProvFee" use:enhance={() => {
                isSubmittingPayment = true;
                return async ({ result, update }) => {
                    isSubmittingPayment = false;
                    if (result.type === 'success') {
                        toastStore.success('Payment Recorded Successfully');
                        closePaymentModal();
                    } else if (result.type === 'failure') {
                        toastStore.error((result.data as any)?.message || 'Payment Failed');
                    } else if (result.type === 'error') {
                        toastStore.error(result.error.message || 'An unexpected error occurred.');
                    } else {
                        toastStore.error('Payment Failed');
                    }
                    await update();
                };
            }}>
                <div class="modal-body p-0">
                    <input type="hidden" name="application_id" value={currentApp?.id} />
                    <input type="hidden" name="amount" value={paymentDetails.amount} />
                    
                    <div class="row g-0">
                        <!-- Left: QR Code Section -->
                        <div class="col-md-7 p-4 border-end">
                            <div class="text-center">
                                <div class="badge bg-success-soft text-success mb-2 px-3 py-2 rounded-pill">
                                    <h4 class="mb-0 fw-bold">₹ {paymentDetails.amount}</h4>
                                </div>
                                <p class="text-muted small">Provisional Seat Reservation Fee</p>
                                
                                {#if paymentDetails.qrCodeUrl}
                                    <div class="bg-white border rounded p-3 d-inline-block shadow-sm mb-0">
                                        <img src={paymentDetails.qrCodeUrl} alt="QR Code" class="img-fluid" style="max-height: 400px; min-width: 350px; object-fit: contain;" on:error={(e) => { paymentDetails.qrCodeUrl = ''; }} />
                                        <div class="small mt-2 text-dark fw-bold">
                                            <i class="bi bi-upc-scan me-1"></i> Scan to Pay
                                        </div>
                                    </div>
                                {:else}
                                    <div class="bg-light border rounded p-5 d-inline-block mb-0">
                                        <i class="bi bi-qr-code-scan display-4 text-secondary"></i>
                                        <div class="small mt-2 text-muted">No QR Code configured</div>
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Right: Instructions -->
                        <div class="col-md-5 bg-light p-4">
                            <h6 class="fw-bold mb-3 d-flex align-items-center">
                                <i class="bi bi-info-circle text-primary me-2"></i>
                                Payment Instructions
                            </h6>
                            
                            <div class="instruction-steps small text-muted">
                                <div class="d-flex mb-3">
                                    <div class="me-3"><span class="badge bg-primary rounded-circle">1</span></div>
                                    <div>Open any UPI app (PhonePe, GPay, Paytm etc.) on your mobile.</div>
                                </div>
                                <div class="d-flex mb-3">
                                    <div class="me-3"><span class="badge bg-primary rounded-circle">2</span></div>
                                    <div>Scan the QR code shown on the left to initiate payment.</div>
                                </div>
                                <div class="d-flex mb-3">
                                    <div class="me-3"><span class="badge bg-primary rounded-circle">3</span></div>
                                    <div>Ensure the amount is exactly <strong>₹ {paymentDetails.amount}</strong>.</div>
                                </div>
                                <div class="d-flex mb-3">
                                    <div class="me-3"><span class="badge bg-primary rounded-circle">4</span></div>
                                    <div>After successful payment, find the <strong>Transaction ID / Reference Number</strong> in your app and whatsapp screenshot of succesful Transaction to following whatsapp number.
                                        <br/>9510782982/84</div>
                                </div>
                                <div class="d-flex mb-3">
                                    <div class="me-3"><span class="badge bg-primary rounded-circle">5</span></div>
                                    <div>Enter that number below and click 'Confirm Payment'.</div>
                                </div>
                            </div>

                            <div class="alert alert-warning border-0 shadow-sm mt-4 small py-2">
                                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                                <strong>Verification:</strong> Payments will be verified against the reference number.
                            </div>
                        </div>
                    </div>

                    <!-- Bottom Panel: Full Width Input Fields -->
                    <div class="p-4 border-top bg-white">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-uppercase text-muted">Payment Mode</label>
                                <select class="form-select form-select-lg" name="payment_mode" bind:value={paymentDetails.mode}>
                                    <option value="cash">Cash</option>
                                    <option value="qr">UPI / QR Code</option>
                                    <option value="cheque">Cheque / DD</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-uppercase text-muted">Reference No / Transaction ID</label>
                                <input type="text" class="form-control form-control-lg" name="reference_no" bind:value={paymentDetails.reference} placeholder="Enter Transaction ID / Reference Number" required />
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-white border-top-0 p-3">
                    <button type="button" class="btn btn-link text-muted text-decoration-none" on:click={closePaymentModal}>Cancel</button>
                    <button type="submit" class="btn btn-success px-4 fw-bold" disabled={isSubmittingPayment}>
                        {#if isSubmittingPayment}
                            <span class="spinner-border spinner-border-sm me-2"></span> Processing...
                        {:else}
                            <i class="bi bi-check-circle me-1"></i> Confirm Payment
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

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
                    <p class="small text-muted mb-3">Multiple print templates found for this application. Please select one to proceed.</p>
                    <div class="list-group">
                        {#each filteredPrintTemplates as t}
                            <button 
                                class="list-group-item list-group-item-action {selectedPrintTemplate === t.id ? 'active' : ''}" 
                                on:click={() => selectedPrintTemplate = t.id}
                            >
                                <i class="bi bi-file-earmark-pdf me-2"></i>
                                {t.name}
                            </button>
                        {/each}
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
    .bg-success-soft {
        background-color: rgba(25, 135, 84, 0.1);
    }
    .instruction-steps .badge {
        width: 22px;
        height: 22px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
    }
</style>
