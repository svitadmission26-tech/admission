<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';
    import { generateReceiptPDF, downloadReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

    let { data, form } = $props();

    let searchTerm = $state(data.searchTerm || '');
    let selectedCourseId = $state(data.selectedCourseId || '');
    let activeTab: 'tuition' | 'application' | 'provisional' = $state(data.activeTab || 'tuition');

    // Re-initiation Modal State
    let showReinitiateModal = $state(false);
    let selectedPaymentForReinitiate: any = $state(null);
    let reinitiateCourseId = $state('');
    let reinitiateBranchId = $state('');
    let reinitiateFeeSchemeId = $state('');
    let reinitiateAmount = $state('');
    let reinitiatePaymentMode = $state('cash');
    let reinitiateReferenceNo = $state('');
    let reinitiatePrefixLetter = $state('F');
    let reinitiateComponents = $state<Array<{ name: string; amount: number }>>([]);

    let showReviewModal = $state(false);
    let showConfirmationModal = $state(false);
    let confirmationData: any = $state(null);

    let availableBranchesForModal = $derived(
        (data.allCoursesWithBranches || []).find((c: any) => c.id === reinitiateCourseId)?.branches || []
    );

    $effect(() => {
        if (form?.reinitiated && form?.success) {
            confirmationData = form;
            showReinitiateModal = false;
            showReviewModal = false;
            showConfirmationModal = true;
            toastStore.add(form.message, 'success');
        } else if (form?.error) {
            toastStore.add(form.message || 'Operation failed', 'danger');
        }
    });

    function loadFeeComponentsForScheme(courseId: string, schemeId: string) {
        if (!courseId) return;
        const matchingFs = (data.feeStructures || []).find((fs: any) => 
            fs.course_id === courseId && (!schemeId || fs.fee_scheme_id === schemeId)
        );

        if (matchingFs && Array.isArray(matchingFs.fee_components_breakdown)) {
            const items: Array<{ name: string; amount: number }> = [];
            matchingFs.fee_components_breakdown.forEach((sec: any) => {
                if (Array.isArray(sec.items)) {
                    sec.items.forEach((item: any) => {
                        items.push({ name: item.name, amount: Number(item.amount) || 0 });
                    });
                }
            });
            if (items.length > 0) {
                reinitiateComponents = items;
                recalculateTotalFromComponents();
                return;
            }
        }

        reinitiateComponents = [
            { name: 'Tuition Fee', amount: Number(reinitiateAmount) || 0 }
        ];
        recalculateTotalFromComponents();
    }

    function recalculateTotalFromComponents() {
        const total = reinitiateComponents.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        if (total > 0) {
            reinitiateAmount = total.toFixed(2);
        }
    }

    function addComponentRow() {
        reinitiateComponents = [...reinitiateComponents, { name: 'Other Fee Component', amount: 0 }];
    }

    function removeComponentRow(index: number) {
        reinitiateComponents = reinitiateComponents.filter((_, i) => i !== index);
        recalculateTotalFromComponents();
    }

    function proceedToReviewModal(e: Event) {
        e.preventDefault();
        if (!reinitiateAmount || Number(reinitiateAmount) <= 0) {
            toastStore.add('Please enter a valid fee amount.', 'warning');
            return;
        }
        showReinitiateModal = false;
        showReviewModal = true;
    }

    function openReinitiateModal(payment: any) {
        selectedPaymentForReinitiate = payment;
        reinitiateCourseId = payment.applications?.course_id || '';
        reinitiateBranchId = payment.applications?.branch_id || '';
        reinitiateFeeSchemeId = payment.applications?.assigned_fee_scheme_id || '';
        reinitiateAmount = payment.amount ? String(payment.amount) : '';
        reinitiatePaymentMode = 'cash';
        reinitiateReferenceNo = '';
        reinitiatePrefixLetter = 'F';

        loadFeeComponentsForScheme(reinitiateCourseId, reinitiateFeeSchemeId);
        showReinitiateModal = true;
    }

    function handleModalCourseChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        reinitiateCourseId = target.value;
        const branches = (data.allCoursesWithBranches || []).find((c: any) => c.id === reinitiateCourseId)?.branches || [];
        if (branches.length > 0 && !branches.some((b: any) => b.id === reinitiateBranchId)) {
            reinitiateBranchId = branches[0].id;
        } else if (branches.length === 0) {
            reinitiateBranchId = '';
        }
        loadFeeComponentsForScheme(reinitiateCourseId, reinitiateFeeSchemeId);
    }

    function handleModalFeeSchemeChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        reinitiateFeeSchemeId = target.value;
        loadFeeComponentsForScheme(reinitiateCourseId, reinitiateFeeSchemeId);
    }

    $effect(() => {
        searchTerm = data.searchTerm || '';
        selectedCourseId = data.selectedCourseId || '';
        activeTab = (data.activeTab as any) || 'tuition';
    });

    function handleSearch() {
        const url = new URL(window.location.href);
        url.searchParams.set('search', searchTerm);
        url.searchParams.set('course_id', selectedCourseId);
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function handleCourseChange() {
        handleSearch();
    }

    function handleTabChange(tab: typeof activeTab) {
        const url = new URL(window.location.href);
        url.searchParams.set('type', tab);
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function changePage(newPage: number) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    let filteredPayments = $derived(activeTab === 'tuition' ? data.tuitionPayments : 
                     activeTab === 'application' ? data.applicationFeePayments : 
                     data.provisionalFeePayments);

    // --- On-Demand Student Autocomplete State & Search ---
    let studentSearchQuery = $state('');
    let showStudentDropdown = $state(false);
    let admissionsList = $state<any[]>([]);
    let isSearchingAdmissions = $state(false);

    let debounceTimer: any;
    $effect(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (!studentSearchQuery.trim()) {
            admissionsList = [];
            return;
        }
        debounceTimer = setTimeout(async () => {
            isSearchingAdmissions = true;
            try {
                const res = await fetch(`/api/fee-collector/search-admissions?q=${encodeURIComponent(studentSearchQuery)}`);
                if (res.ok) {
                    admissionsList = await res.json();
                }
            } catch (e) {
                console.error(e);
            } finally {
                isSearchingAdmissions = false;
            }
        }, 300);
    });

    function recordStudentPayment(adm: any) {
        goto(`/fee-collector/payments/collect/${adm.id}`);
    }

    function handleWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.student-autocomplete-container')) {
            showStudentDropdown = false;
        }
    }

    // Resolve non-blocking metadata once at the page level
    let profileTemplates = $state<any[]>([]);
    let formTypesMap = $state<any[]>([]);
    let isMetadataLoaded = $state(false);

    $effect(() => {
        Promise.all([data.streamed.profileTemplates, data.streamed.formTypes]).then(([pt, ft]) => {
            profileTemplates = pt;
            formTypesMap = ft;
            isMetadataLoaded = true;
        });
    });

    async function printReceipt(payment: any) {
        const receiptData = mapPaymentToReceipt(payment);
        await generateReceiptPDF(receiptData);
    }

    async function downloadReceipt(payment: any) {
        const receiptData = mapPaymentToReceipt(payment);
        await downloadReceiptPDF(receiptData);
    }

    function mapPaymentToReceipt(payment: any): ReceiptData {
        const isProv = payment.payment_type === 'provisional_fee';
        const isTuition = payment.payment_type === 'tuition_fee';
        const feePeriod = payment.fee_period || 'year';

        const feeBreakdown = (payment.fee_components_breakdown || []).map((section: any) => ({
            name: section.name || section.section,
            items: (section.items || []).map((item: any) => {
                const val = Number(item.amount) || 0;
                const displayAmt = (feePeriod === 'semester' && item.allow_partial) ? (val / 2) : val;
                return {
                    name: item.name,
                    amount: displayAmt
                };
            })
        }));
        
        let universityData = {
            name: 'SVIT, Vasad',
            address: 'Vasad, Gujarat',
            contactEmail: 'admission@svitvasad.ac.in',
            logoUrl: undefined
        };

        const college = payment.applications?.courses?.colleges;
        if (college) {
            universityData = {
                name: college.name || universityData.name,
                address: college.address || universityData.address,
                logoUrl: college.logo_url || college.universities?.logo_url,
                contactEmail: college.universities?.contact_email || universityData.contactEmail
            };
        }

        let periodDisplay: 'SEMESTER' | 'ACADEMIC YEAR';
        if (data.userProfile?.role === 'fee_collector' && isTuition) {
            periodDisplay = (feePeriod === 'year') ? 'ACADEMIC YEAR' : 'SEMESTER';
        } else {
            periodDisplay = 'ACADEMIC YEAR';
        }

        const studentProfiles = payment.applications?.student_user?.student_profiles;
        const enrollmentNumber = (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number;

        return {
            receiptNumber: payment.receipt_number || 'N/A',
            date: payment.payment_date,
            studentName: payment.applications?.student_user?.full_name || payment.applications?.student_user?.email || 'N/A',
            email: payment.applications?.student_user?.email || '',
            enrollmentNumber: enrollmentNumber,
            admissionNumber: payment.applications?.account_admissions?.[0]?.admission_number,
            courseName: payment.applications?.courses?.name || 'N/A',
            branchName: payment.applications?.branches?.name,
            academicYear: payment.applications?.admission_cycles?.academic_years?.name,
            semester: periodDisplay,
            paymentType: payment.payment_type,
            isProvisional: isProv,
            transactionId: payment.transaction_id,
            amount: Number(payment.amount),
            totalStructureFee: Number(payment.amount),
            feeBreakdown: feeBreakdown.length > 0 ? feeBreakdown : undefined,
            collegeAlias: college?.code || 'SVIT',
            paymentModes: (payment.payment_breakdown || []).map((m: any) => ({
                mode: m.type || m.mode,
                amount: Number(m.amount),
                ref: m.ref || m.reference,
                date: payment.payment_date
            })),
            university: universityData
        };
    }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="container-fluid">
    <h1 class="mb-4">Payment History</h1>

    <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
            <a class="nav-link {activeTab === 'tuition' ? 'active' : ''}" href="#" onclick={(e) => { e.preventDefault(); handleTabChange('tuition'); }}>
                Tuition / Admission Fees
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {activeTab === 'application' ? 'active' : ''}" href="#" onclick={(e) => { e.preventDefault(); handleTabChange('application'); }}>
                Application Form Fees
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {activeTab === 'provisional' ? 'active' : ''}" href="#" onclick={(e) => { e.preventDefault(); handleTabChange('provisional'); }}>
                Provisional Fees
            </a>
        </li>
    </ul>

    <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="d-flex gap-2 align-items-center">
            <div class="input-group student-autocomplete-container" style="max-width: 400px;">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input 
                    type="text" 
                    class="form-control" 
                    placeholder="Search by Name/Email/Adm No..." 
                    bind:value={searchTerm}
                    onkeydown={(e) => e.key === 'Enter' && handleSearch()}
                >
                <button class="btn btn-primary" onclick={handleSearch}>Search</button>
            </div>
            
            <div class="input-group" style="max-width: 300px;">
                <span class="input-group-text"><i class="bi bi-book"></i></span>
                <select 
                    class="form-select" 
                    bind:value={selectedCourseId}
                    onchange={handleCourseChange}
                >
                    <option value="">All Courses</option>
                    {#each data.courses as course}
                        <option value={course.id}>{course.name}</option>
                    {/each}
                </select>
            </div>

            {#if data.searchTerm || data.selectedCourseId}
                <button class="btn btn-link btn-sm text-danger" onclick={() => { searchTerm = ''; selectedCourseId = ''; handleSearch(); }}>Clear</button>
            {/if}
        </div>
        
        <div class="input-group student-autocomplete-container" style="max-width: 400px;">
            <span class="input-group-text">
                {#if isSearchingAdmissions}
                    <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
                {:else}
                    <i class="bi bi-person-plus"></i>
                {/if}
            </span>
            <input 
                type="text" 
                class="form-control" 
                placeholder="Search Student to Record Payment..." 
                bind:value={studentSearchQuery}
                onfocus={() => showStudentDropdown = true}
            >
            {#if showStudentDropdown && admissionsList.length > 0}
                <div class="list-group position-absolute w-100 shadow-lg z-3 top-100 mt-1" style="max-height: 300px; overflow-y: auto;">
                    {#each admissionsList as adm}
                        <button 
                            type="button" 
                            class="list-group-item list-group-item-action text-start"
                            onclick={() => recordStudentPayment(adm)}
                        >
                            <div class="fw-bold">{adm.admission_number}</div>
                            <small class="text-muted">{(adm.applications as any)?.student_user?.full_name}</small>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        {#if activeTab === 'tuition'}
            <div class="text-muted small">
                <i class="bi bi-info-circle me-1"></i> Search student to record new payment
            </div>
        {/if}
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Admission No.</th>
                            <th>College ID</th>
                            <th>Student</th>
                            <th>Course</th>
                            <th>Total Amount</th>
                            <th>Modes</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredPayments as payment, i}
                            <tr>
                                <td>{(data.pagination.page - 1) * data.pagination.limit + i + 1}</td>
                                <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                                <td>{Array.isArray(payment.applications?.account_admissions) ? payment.applications?.account_admissions[0]?.admission_number : payment.applications?.account_admissions?.admission_number || '-'}</td>
                                <td>
                                    <span class="badge {(Array.isArray(payment.applications?.student_user?.student_profiles) ? payment.applications?.student_user?.student_profiles[0]?.enrollment_number : payment.applications?.student_user?.student_profiles?.enrollment_number) ? 'bg-success' : 'bg-light text-muted border'}">
                                        {(Array.isArray(payment.applications?.student_user?.student_profiles) ? payment.applications?.student_user?.student_profiles[0]?.enrollment_number : payment.applications?.student_user?.student_profiles?.enrollment_number) || 'Pending'}
                                    </span>
                                </td>
                                <td>
                                    {payment.applications?.student_user?.full_name || payment.applications?.student_user?.email}
                                </td>
                                <td>{payment.applications?.courses?.name}</td>
                                <td>{payment.amount}</td>
                                <td>
                                    {#if payment.payment_breakdown}
                                        {#each payment.payment_breakdown as mode}
                                            {#if mode.amount > 0}
                                                <span class="badge bg-info text-dark me-1 text-uppercase">{mode.type || mode.mode || 'N/A'}: {mode.amount}</span>
                                            {/if}
                                        {/each}
                                    {:else}
                                        <span class="badge bg-secondary">{payment.transaction_id?.split('-')[0] || 'Unknown'}</span>
                                    {/if}
                                </td>
                                <td>
                                    <span class="badge {payment.status === 'completed' ? 'bg-success' : payment.status === 'pending' ? 'bg-warning' : 'bg-danger'}">
                                        {payment.status}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group">
                                        {#if isMetadataLoaded}
                                            {@const studentFormTypeId = formTypesMap.find(ft => ft.name === payment.applications?.form_type)?.id}
                                            {@const template = profileTemplates.find(t => t.target_form_type_id === studentFormTypeId) || 
                                                              profileTemplates.find(t => !t.target_form_type_id) || 
                                                              profileTemplates[0]}
                                            
                                            {#if template}
                                                <a 
                                                    href="/print-profile/{payment.application_id}?templateId={template.id}" 
                                                    target="_blank" 
                                                    class="btn btn-sm btn-outline-info" 
                                                    title="View Student Profile"
                                                >
                                                    <i class="bi bi-person-badge"></i>
                                                </a>
                                            {/if}
                                        {:else}
                                            <button class="btn btn-sm btn-outline-info" disabled>
                                                <span class="spinner-border spinner-border-sm" role="status"></span>
                                            </button>
                                        {/if}
                                        <a href="/fee-collector/payments/edit/{payment.id}" class="btn btn-sm btn-outline-primary" title="Edit Payment">
                                            <i class="bi bi-pencil"></i>
                                        </a>
                                        <button class="btn btn-sm btn-secondary" title="Print" onclick={() => printReceipt(payment)}>
                                            <i class="bi bi-printer"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-secondary" title="Download" onclick={() => downloadReceipt(payment)}>
                                            <i class="bi bi-download"></i>
                                        </button>
                                        <a 
                                            href="/fee-collector/payments/reinitiate/{payment.id}" 
                                            class="btn btn-sm btn-outline-warning" 
                                            title="Re-Initiate Admission & Collect Fees Fresh"
                                        >
                                            <i class="bi bi-arrow-repeat"></i>
                                        </a>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="10" class="text-center text-muted">No payments found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        {#if data.pagination && data.pagination.totalPages > 1}
            <div class="card-footer bg-white border-0">
                <div class="d-flex justify-content-center align-items-center gap-3 py-2">
                    <button 
                        class="btn btn-sm btn-outline-secondary" 
                        disabled={data.pagination.page <= 1}
                        onclick={() => changePage(data.pagination.page - 1)}
                    >
                        <i class="bi bi-chevron-left"></i> Previous
                    </button>
                    
                    <span class="text-muted">
                        Page <strong>{data.pagination.page}</strong> of {data.pagination.totalPages}
                        <small class="ms-1">({data.pagination.total} total records)</small>
                    </span>

                    <button 
                        class="btn btn-sm btn-outline-secondary" 
                        disabled={data.pagination.page >= data.pagination.totalPages}
                        onclick={() => changePage(data.pagination.page + 1)}
                    >
                        Next <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- 1. Re-Initiate & Collect Fee Input Modal -->
{#if showReinitiateModal && selectedPaymentForReinitiate}
    {@const studentProfiles = selectedPaymentForReinitiate.applications?.student_user?.student_profiles}
    {@const currentEnrollment = (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number || 'N/A'}
    {@const studentName = selectedPaymentForReinitiate.applications?.student_user?.full_name || selectedPaymentForReinitiate.applications?.student_user?.email || 'N/A'}

    <div class="modal fade show d-block tab-index-modal" style="background: rgba(0,0,0,0.5);" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-warning bg-gradient text-dark">
                    <h5 class="modal-title fw-bold">
                        <i class="bi bi-arrow-repeat me-2"></i> Re-Initiate Admission & Collect Fees Fresh
                    </h5>
                    <button type="button" class="btn-close" onclick={() => showReinitiateModal = false}></button>
                </div>
                <form onsubmit={proceedToReviewModal}>
                    <div class="modal-body p-4">
                        <div class="alert alert-warning d-flex align-items-center gap-2 mb-3">
                            <i class="bi bi-exclamation-triangle-fill fs-4 text-warning"></i>
                            <div>
                                <strong>Student:</strong> {studentName} &bull; 
                                <strong>Current Enrollment ID:</strong> <span class="badge bg-dark">{currentEnrollment}</span>
                                <div class="small text-muted mt-1">Re-initiating will log current details into history, generate a new enrollment sequence ID, and issue a fresh fee receipt.</div>
                            </div>
                        </div>

                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label fw-semibold">Target Course</label>
                                <select class="form-select" bind:value={reinitiateCourseId} onchange={handleModalCourseChange}>
                                    {#each data.allCoursesWithBranches || [] as c}
                                        <option value={c.id}>{c.name} ({c.code})</option>
                                    {/each}
                                </select>
                            </div>

                            <div class="col-md-6">
                                <label class="form-label fw-semibold">Target Branch</label>
                                <select class="form-select" bind:value={reinitiateBranchId}>
                                    <option value="">No Specific Branch / Default</option>
                                    {#each availableBranchesForModal as b}
                                        <option value={b.id}>{b.name} ({b.code})</option>
                                    {/each}
                                </select>
                            </div>

                            <div class="col-md-6">
                                <label class="form-label fw-semibold">Fee Scheme / Category</label>
                                <select class="form-select" bind:value={reinitiateFeeSchemeId} onchange={handleModalFeeSchemeChange}>
                                    <option value="">Keep Current / Default Scheme</option>
                                    {#each data.feeSchemes || [] as fs}
                                        <option value={fs.id}>{fs.name}</option>
                                    {/each}
                                </select>
                            </div>

                            <div class="col-md-6">
                                <label class="form-label fw-semibold">Fresh Fee Amount (₹) <span class="text-danger">*</span></label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    class="form-control" 
                                    bind:value={reinitiateAmount}
                                    placeholder="Enter fee amount" 
                                    required 
                                />
                            </div>

                            <div class="col-md-6">
                                <label class="form-label fw-semibold">Payment Mode</label>
                                <select class="form-select" bind:value={reinitiatePaymentMode}>
                                    <option value="cash">Cash</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="dd">Demand Draft (DD)</option>
                                    <option value="online_transfer">Online Transfer / UPI</option>
                                </select>
                            </div>

                            <div class="col-md-6">
                                <label class="form-label fw-semibold">Reference Number / Ref No.</label>
                                <input 
                                    type="text" 
                                    class="form-control" 
                                    bind:value={reinitiateReferenceNo}
                                    placeholder="e.g. UTR / Cheque No. / Cash Ref" 
                                />
                            </div>

                            <div class="col-md-6">
                                <label class="form-label fw-semibold">College ID Prefix Letter</label>
                                <input 
                                    type="text" 
                                    class="form-control" 
                                    bind:value={reinitiatePrefixLetter}
                                    placeholder="e.g. F" 
                                />
                            </div>
                        </div>

                        <!-- Existing Fee Components Amount Editor -->
                        {#if reinitiateComponents.length > 0}
                            <div class="col-12 mt-3">
                                <label class="form-label fw-bold text-dark mb-2">
                                    <i class="bi bi-list-check me-1 text-primary"></i> Existing Fee Scheme Component Heads (Modify amounts if required)
                                </label>
                                
                                <div class="card border bg-light p-3">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-borderless align-middle mb-0">
                                            <thead>
                                                <tr class="border-bottom">
                                                    <th style="width: 5%;">#</th>
                                                    <th style="width: 55%;">Fee Component Head</th>
                                                    <th style="width: 40%;" class="text-end">Assigned Amount (₹)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each reinitiateComponents as comp, idx}
                                                    <tr>
                                                        <td>{idx + 1}</td>
                                                        <td class="fw-semibold text-dark">{comp.name}</td>
                                                        <td>
                                                            <div class="input-group input-group-sm">
                                                                <span class="input-group-text bg-white">₹</span>
                                                                <input 
                                                                    type="number" 
                                                                    step="0.01" 
                                                                    class="form-control text-end fw-bold text-success" 
                                                                    placeholder="0.00" 
                                                                    bind:value={comp.amount} 
                                                                    oninput={recalculateTotalFromComponents}
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <div class="modal-footer bg-light px-4 py-3">
                        <button type="button" class="btn btn-secondary" onclick={() => showReinitiateModal = false}>Cancel</button>
                        <button type="submit" class="btn btn-warning text-dark fw-bold px-4">
                            <i class="bi bi-eye-fill me-1"></i> Review & Confirm
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

<!-- 2. Pre-Submission Confirmation Dialog (Before Submit) -->
{#if showReviewModal && selectedPaymentForReinitiate}
    {@const studentProfiles = selectedPaymentForReinitiate.applications?.student_user?.student_profiles}
    {@const currentEnrollment = (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number || 'N/A'}
    {@const studentName = selectedPaymentForReinitiate.applications?.student_user?.full_name || selectedPaymentForReinitiate.applications?.student_user?.email || 'N/A'}
    {@const selectedCourse = (data.allCoursesWithBranches || []).find((c: any) => c.id === reinitiateCourseId)}
    {@const selectedBranch = selectedCourse?.branches?.find((b: any) => b.id === reinitiateBranchId)}
    {@const selectedFeeScheme = (data.feeSchemes || []).find((fs: any) => fs.id === reinitiateFeeSchemeId)}

    <div class="modal fade show d-block tab-index-modal" style="background: rgba(0,0,0,0.6);" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title fw-bold">
                        <i class="bi bi-file-earmark-check me-2"></i> Confirm Re-Initiation & Fee Collection
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick={() => { showReviewModal = false; showReinitiateModal = true; }}></button>
                </div>

                <form method="POST" action="?/reinitiateAdmissionAndCollect">
                    <input type="hidden" name="application_id" value={selectedPaymentForReinitiate.application_id} />
                    <input type="hidden" name="new_course_id" value={reinitiateCourseId} />
                    <input type="hidden" name="new_branch_id" value={reinitiateBranchId} />
                    <input type="hidden" name="new_fee_scheme_id" value={reinitiateFeeSchemeId} />
                    <input type="hidden" name="amount" value={reinitiateAmount} />
                    <input type="hidden" name="payment_mode" value={reinitiatePaymentMode} />
                    <input type="hidden" name="reference_no" value={reinitiateReferenceNo} />
                    <input type="hidden" name="enrollment_prefix_letter" value={reinitiatePrefixLetter} />
                    <input 
                        type="hidden" 
                        name="fee_components_breakdown" 
                        value={JSON.stringify(reinitiateComponents.length > 0 ? [{ name: "Fee Breakdown", items: reinitiateComponents }] : [])} 
                    />

                    <div class="modal-body p-4">
                        <div class="alert alert-info border-info mb-3">
                            <i class="bi bi-info-circle-fill me-1"></i> Please review all details carefully before confirming fee collection. Submitting will record the previous admission state to transfer history, generate a new enrollment sequence ID, and issue a fresh fee receipt.
                        </div>

                        <div class="card border-0 bg-light p-3 mb-3">
                            <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">
                                <i class="bi bi-person-lines-fill me-1 text-primary"></i> Re-Initiation Summary
                            </h6>
                            <div class="row g-2">
                                <div class="col-sm-5 text-muted">Student Name:</div>
                                <div class="col-sm-7 fw-bold text-dark">{studentName}</div>

                                <div class="col-sm-5 text-muted">Previous Enrollment ID:</div>
                                <div class="col-sm-7"><span class="badge bg-dark">{currentEnrollment}</span></div>

                                <div class="col-sm-5 text-muted">Target Course:</div>
                                <div class="col-sm-7 fw-semibold">{selectedCourse?.name || 'Current Course'} ({selectedCourse?.code || 'CRS'})</div>

                                <div class="col-sm-5 text-muted">Target Branch:</div>
                                <div class="col-sm-7 fw-semibold">{selectedBranch?.name || 'Default Branch'}</div>

                                <div class="col-sm-5 text-muted">Fee Scheme / Category:</div>
                                <div class="col-sm-7 fw-semibold text-primary">{selectedFeeScheme?.name || 'Current / Default Scheme'}</div>

                                <div class="col-sm-5 text-muted">Total Fresh Fee Amount:</div>
                                <div class="col-sm-7 fw-bold text-success fs-5">₹{Number(reinitiateAmount).toFixed(2)}</div>

                                <div class="col-sm-5 text-muted">Payment Mode & Ref:</div>
                                <div class="col-sm-7 text-uppercase fw-semibold">{reinitiatePaymentMode} {reinitiateReferenceNo ? `(Ref: ${reinitiateReferenceNo})` : ''}</div>
                            </div>
                        </div>

                        {#if reinitiateComponents.length > 0}
                            <div class="card border p-3">
                                <h6 class="fw-bold text-dark mb-2">
                                    <i class="bi bi-list-check me-1 text-primary"></i> Itemized Fee Components Breakdown
                                </h6>
                                <div class="table-responsive">
                                    <table class="table table-sm table-bordered mb-0">
                                        <thead class="table-light">
                                            <tr>
                                                <th>#</th>
                                                <th>Fee Head</th>
                                                <th class="text-end">Amount (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each reinitiateComponents as comp, idx}
                                                <tr>
                                                    <td>{idx + 1}</td>
                                                    <td>{comp.name}</td>
                                                    <td class="text-end fw-semibold">₹{Number(comp.amount).toFixed(2)}</td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <div class="modal-footer bg-light px-4 py-3 justify-content-between">
                        <button type="button" class="btn btn-outline-secondary" onclick={() => { showReviewModal = false; showReinitiateModal = true; }}>
                            <i class="bi bi-arrow-left me-1"></i> Back & Edit
                        </button>
                        <button type="submit" class="btn btn-warning text-dark fw-bold px-4">
                            <i class="bi bi-check-circle-fill me-1"></i> Confirm & Submit Fee Collection
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

<!-- 3. Final Post-Submission Success Modal Dialog (After Submit) -->
{#if showConfirmationModal && confirmationData}
    <div class="modal fade show d-block tab-index-modal" style="background: rgba(0,0,0,0.6);" tabindex="-1">
        <div class="modal-dialog modal-md modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title fw-bold">
                        <i class="bi bi-patch-check-fill me-2"></i> Re-Initiation Successful
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick={() => showConfirmationModal = false}></button>
                </div>
                <div class="modal-body p-4">
                    <div class="alert alert-success text-center py-2 mb-3">
                        <i class="bi bi-check-circle-fill me-1"></i> Fresh fee collection completed & receipt issued!
                    </div>

                    <div class="card border-0 bg-light p-3 mb-3">
                        <div class="row g-2 small">
                            <div class="col-5 text-muted">Student Name:</div>
                            <div class="col-7 fw-bold text-dark">{confirmationData.studentName}</div>

                            <div class="col-5 text-muted">Previous Enrollment ID:</div>
                            <div class="col-7"><span class="badge bg-secondary">{confirmationData.previousEnrollmentNumber}</span></div>

                            <div class="col-5 text-muted">New Enrollment ID:</div>
                            <div class="col-7"><span class="badge bg-success fs-6">{confirmationData.newEnrollmentNumber}</span></div>

                            <div class="col-5 text-muted">Receipt Number:</div>
                            <div class="col-7 fw-bold text-primary">{confirmationData.receiptNo || 'N/A'}</div>

                            <div class="col-5 text-muted">Total Amount Paid:</div>
                            <div class="col-7 fw-bold text-success fs-6">₹{Number(confirmationData.amount).toFixed(2)}</div>

                            <div class="col-5 text-muted">Payment Mode:</div>
                            <div class="col-7 text-uppercase fw-semibold">{confirmationData.paymentMode} ({confirmationData.referenceNo})</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-light px-4 py-3 justify-content-between">
                    <button type="button" class="btn btn-outline-secondary" onclick={() => showConfirmationModal = false}>
                        Close
                    </button>
                    {#if confirmationData.createdPayment}
                        <button type="button" class="btn btn-primary" onclick={() => printReceipt(confirmationData.createdPayment)}>
                            <i class="bi bi-printer me-1"></i> Print Receipt PDF
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .table-responsive {
        min-height: 400px;
    }
</style>
