<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';
    import { generateReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

    let { data, form } = $props();

    let targetPayment = $derived(data.targetPayment);
    let app = $derived(targetPayment.applications as any);
    let student = $derived(app.student_user);
    let college = $derived(app.courses.colleges);

    // Form inputs state
    let targetCourseId = $state(app.course_id || '');
    let targetBranchId = $state(app.branch_id || '');
    let targetFeeSchemeId = $state(app.assigned_fee_scheme_id || '');
    let feePeriod = $state<'year' | 'semester'>('year');
    let prefixLetter = $state('F');
    let paymentDate = $state(new Date().toISOString().split('T')[0]);
    let remarks = $state('');

    // Modal Visibility States
    let showComponentsModal = $state(false);
    let showReviewModal = $state(false);
    let showSuccessModal = $state(false);
    let successData: any = $state(null);

    // Hybrid Payment Modes state
    let paymentModes = $state([
        { type: 'cash', amount: 0, reference: '' },
        { type: 'acpc', amount: 0, reference: '' },
        { type: 'advance', amount: 0, reference: '' },
        { type: 'freeship', amount: 0, reference: '' },
        { type: 'online', amount: 0, reference: '' },
        { type: 'cheque', amount: 0, reference: '' }
    ]);

    let simpleModes = $derived(paymentModes.filter(m => ['cash', 'acpc', 'advance', 'freeship'].includes(m.type)));
    let detailedModes = $derived(paymentModes.filter(m => ['online', 'cheque'].includes(m.type)));

    // Available branches dependent on selected target course
    let availableBranches = $derived.by(() => {
        if (!targetCourseId) return [];
        const course = (data.allCoursesWithBranches || []).find((c: any) => String(c.id) === String(targetCourseId));
        return course?.branches || [];
    });

    // Current matching fee structure for selected course & fee scheme
    let matchingFeeStructure = $derived.by(() => {
        if (!targetCourseId) return null;
        return (data.feeStructures || []).find((fs: any) => 
            String(fs.course_id) === String(targetCourseId) && 
            (!targetFeeSchemeId || String(fs.fee_scheme_id) === String(targetFeeSchemeId))
        ) || null;
    });

    let totalSchemeFee = $derived.by(() => {
        if (!matchingFeeStructure) return Number(targetPayment.amount || 0);
        const totalYearly = Number(matchingFeeStructure.total_amount || matchingFeeStructure.total_fee || 0);
        if (feePeriod === 'semester') {
            if (matchingFeeStructure.installment_json && matchingFeeStructure.installment_json.length > 0) {
                return Number(matchingFeeStructure.installment_json[0].amount) || (totalYearly / 2);
            }
            const sections = matchingFeeStructure.fee_components_breakdown || matchingFeeStructure.fee_components || [];
            if (Array.isArray(sections) && sections.length > 0) {
                let semSum = 0;
                sections.forEach((sec: any) => {
                    if (Array.isArray(sec.items)) {
                        sec.items.forEach((item: any) => {
                            const val = Number(item.amount) || 0;
                            semSum += item.allow_partial ? (val / 2) : val;
                        });
                    }
                });
                if (semSum > 0) return semSum;
            }
            return totalYearly / 2;
        }
        return totalYearly;
    });

    let totalCollectingNow = $derived(paymentModes.reduce((sum, m) => sum + (Number(m.amount) || 0), 0));
    let balanceAfter = $derived(totalSchemeFee - totalCollectingNow);

    let paymentBreakdownJson = $derived(JSON.stringify(
        paymentModes.filter(m => Number(m.amount) > 0).map(m => ({
            mode: m.type,
            amount: Number(m.amount) || 0,
            ref: m.reference
        }))
    ));

    $effect(() => {
        if (form?.reinitiated && form?.success) {
            successData = form;
            showReviewModal = false;
            showSuccessModal = true;
            toastStore.add(form.message, 'success');
        } else if (form?.error) {
            toastStore.add(form.message || 'Operation failed', 'danger');
        }
    });

    function handleCourseChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        targetCourseId = target.value;
        const course = (data.allCoursesWithBranches || []).find((c: any) => String(c.id) === String(targetCourseId));
        const branches = course?.branches || [];
        if (branches.length > 0) {
            targetBranchId = branches[0].id;
        } else {
            targetBranchId = '';
        }
    }

    function openReviewConfirmationModal() {
        if (totalCollectingNow <= 0) {
            toastStore.add('Please enter an amount to collect in at least one payment mode.', 'warning');
            return;
        }
        showReviewModal = true;
    }

    async function printReceipt(payment: any) {
        const studentProfiles = student?.student_profiles;
        const enrollmentNumber = successData?.newEnrollmentNumber || (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number;
        const selectedCourse = (data.allCoursesWithBranches || []).find((c: any) => c.id === targetCourseId);
        const selectedBranch = selectedCourse?.branches?.find((b: any) => b.id === targetBranchId);

        const rawFeeBreakdown = (payment?.fee_components_breakdown && payment.fee_components_breakdown.length > 0)
            ? payment.fee_components_breakdown
            : (matchingFeeStructure?.fee_components || matchingFeeStructure?.fee_components_breakdown || []);

        const feeBreakdown = (rawFeeBreakdown || []).map((section: any) => ({
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

        const periodDisplay: 'SEMESTER' | 'ACADEMIC YEAR' = (feePeriod === 'year') ? 'ACADEMIC YEAR' : 'SEMESTER';
        const admissionNo = Array.isArray(app.account_admissions) ? app.account_admissions[0]?.admission_number : app.account_admissions?.admission_number || app.admission_number || 'N/A';

        const receiptData: ReceiptData = {
            receiptNumber: payment.receipt_number || successData?.receiptNo || 'N/A',
            date: payment.payment_date || paymentDate,
            studentName: student?.full_name || student?.email || 'N/A',
            email: student?.email || '',
            enrollmentNumber: (enrollmentNumber && enrollmentNumber !== 'N/A') ? enrollmentNumber : undefined,
            admissionNumber: admissionNo,
            courseName: selectedCourse?.name || app.courses?.name || 'N/A',
            branchName: selectedBranch?.name || app.branches?.name || 'N/A',
            academicYear: app.admission_cycles?.academic_years?.name || '2026-27',
            semester: periodDisplay,
            paymentType: 'tuition_fee',
            isProvisional: false,
            transactionId: payment.transaction_id || 'TXN-REINIT',
            amount: Number(payment.amount || totalCollectingNow),
            totalStructureFee: Number(totalSchemeFee),
            feeBreakdown: feeBreakdown.length > 0 ? feeBreakdown : undefined,
            collegeAlias: college?.code || 'SVIT',
            paymentModes: (payment.payment_breakdown || paymentModes.filter(m => Number(m.amount) > 0)).map((m: any) => ({
                mode: m.mode || m.type,
                amount: Number(m.amount),
                ref: m.ref || m.reference,
                date: payment.payment_date || paymentDate
            })),
            university: {
                name: college?.name || 'SVIT, Vasad',
                address: college?.address || 'Vasad, Gujarat',
                contactEmail: college?.universities?.contact_email || 'admission@svitvasad.ac.in',
                logoUrl: college?.logo_url || college?.universities?.logo_url
            }
        };

        await generateReceiptPDF(receiptData);
    }
</script>

<div class="container-fluid py-4">
    <!-- Top Header -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div class="d-flex align-items-center">
            <a href="/fee-collector/payments" class="btn btn-outline-secondary me-3">
                <i class="bi bi-arrow-left"></i> Back to Payments
            </a>
            <div>
                <h1 class="h3 mb-0 fw-bold">Re-Initiate Admission & Collect Fees Fresh</h1>
                <small class="text-muted">Start fresh fee collection for student with transfer logging & sequence generation</small>
            </div>
        </div>
    </div>

    <div class="row g-4">
        <!-- LEFT COLUMN: Student Profile & Re-Initiation Configuration -->
        <div class="col-lg-5">
            <!-- Student Header Card -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-body p-4">
                    <div class="d-flex align-items-center mb-3">
                        <div class="bg-primary bg-opacity-10 text-primary rounded-circle p-3 me-3">
                            <i class="bi bi-person-fill fs-2"></i>
                        </div>
                        <div>
                            <h4 class="mb-0 fw-bold">{student?.full_name || 'N/A'}</h4>
                            <p class="text-muted mb-0">{student?.email}</p>
                            <span class="badge bg-dark mt-1">
                                Current Enrollment: {student?.student_profiles?.[0]?.enrollment_number || 'Pending'}
                            </span>
                        </div>
                    </div>

                    <div class="row g-3 small border-top pt-3">
                        <div class="col-6">
                            <span class="text-muted d-block text-uppercase">Current Course</span>
                            <span class="fw-bold text-dark">{app.courses?.name}</span>
                        </div>
                        <div class="col-6">
                            <span class="text-muted d-block text-uppercase">Current Branch</span>
                            <span class="fw-bold text-dark">{app.branches?.name || 'General'}</span>
                        </div>
                        <div class="col-6">
                            <span class="text-muted d-block text-uppercase">Academic Year</span>
                            <span class="fw-bold text-dark">{app.admission_cycles?.academic_years?.name || '2026-27'}</span>
                        </div>
                        <div class="col-6">
                            <span class="text-muted d-block text-uppercase">Assigned Scheme</span>
                            <span class="fw-bold text-primary">{matchingFeeStructure?.fee_schemes?.name || 'General'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Target Selection Card -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-white py-3 border-0">
                    <h5 class="mb-0 fw-bold">
                        <i class="bi bi-sliders me-2 text-primary"></i> Target Course & Scheme
                    </h5>
                </div>
                <div class="card-body p-4 pt-1">
                    <div class="row g-3">
                        <div class="col-12">
                            <label class="form-label fw-semibold">Target Course</label>
                            <select class="form-select" bind:value={targetCourseId} onchange={handleCourseChange}>
                                {#each data.allCoursesWithBranches || [] as c}
                                    <option value={c.id}>{c.name} ({c.code})</option>
                                {/each}
                            </select>
                        </div>

                        <div class="col-12">
                            <label class="form-label fw-semibold">Target Branch</label>
                            <select class="form-select" bind:value={targetBranchId}>
                                <option value="">No Specific Branch / Default</option>
                                {#each availableBranches as b}
                                    <option value={b.id}>{b.name} ({b.code})</option>
                                {/each}
                            </select>
                        </div>

                        <div class="col-12">
                            <label class="form-label fw-semibold">Fee Scheme / Category</label>
                            <select class="form-select" bind:value={targetFeeSchemeId}>
                                <option value="">Keep Current / Default Scheme</option>
                                {#each data.feeSchemes || [] as fs}
                                    <option value={fs.id}>{fs.name}</option>
                                {/each}
                            </select>
                        </div>

                        <!-- Fee Period (Yearly / Semester Toggle) -->
                        <div class="col-12">
                            <div class="d-flex justify-content-between align-items-center bg-light p-2 rounded border">
                                <label class="form-label fw-semibold mb-0 small text-uppercase">Fee Period</label>
                                <div class="btn-group btn-group-sm">
                                    <button 
                                        type="button" 
                                        class="btn {feePeriod === 'year' ? 'btn-dark fw-bold' : 'btn-outline-dark'}" 
                                        onclick={() => feePeriod = 'year'}
                                    >
                                        Yearly
                                    </button>
                                    <button 
                                        type="button" 
                                        class="btn {feePeriod === 'semester' ? 'btn-dark fw-bold' : 'btn-outline-dark'}" 
                                        onclick={() => feePeriod = 'semester'}
                                    >
                                        Semester
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Button to Review Fee Components for current scheme -->
                        <div class="col-12 mt-2">
                            <button 
                                type="button" 
                                class="btn btn-outline-primary w-100 py-2 fw-semibold" 
                                onclick={() => showComponentsModal = true}
                            >
                                <i class="bi bi-eye-fill me-1"></i> Review Fee Components for Scheme
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- RIGHT COLUMN: Record Payment (Hybrid Collection Form as in Capture.JPG) -->
        <div class="col-lg-7">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-white py-3 border-0">
                    <h5 class="mb-0 fw-bold">Record Payment (Fresh Fee Collection)</h5>
                </div>
                <div class="card-body p-4">
                    <div class="row g-4 mb-4">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Admission Category Code</label>
                            <input 
                                type="text" 
                                class="form-control text-uppercase fw-bold" 
                                placeholder="e.g. V, F, M, G" 
                                bind:value={prefixLetter} 
                                required 
                            />
                            <small class="text-muted">Used for Enrollment ID generation (e.g., 'F' for Fresh / 'V' for Vacant)</small>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Payment Date</label>
                            <input 
                                type="date" 
                                class="form-control" 
                                bind:value={paymentDate} 
                                required 
                            />
                        </div>
                    </div>

                    <div class="mb-4">
                        <label class="form-label fw-bold mb-3">Payment Details (Hybrid Collection)</label>
                        
                        <!-- Simple Amount Inputs Grid -->
                        <div class="row g-3 mb-4">
                            {#each simpleModes as mode}
                                <div class="col-md-6">
                                    <div class="p-3 bg-light rounded border">
                                        <label class="form-label small fw-bold text-uppercase">{mode.type === 'acpc' ? 'ACPC/ACPDC' : mode.type}</label>
                                        <div class="input-group">
                                            <span class="input-group-text">₹</span>
                                            <input 
                                                type="number" 
                                                class="form-control font-monospace" 
                                                bind:value={mode.amount} 
                                                min="0" 
                                                placeholder="0.00" 
                                            />
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>

                        <!-- Detailed Transaction Table -->
                        <div class="table-responsive rounded border mb-4">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th class="ps-3">Transaction Mode</th>
                                        <th width="160">Amount (₹)</th>
                                        <th class="pe-3">Reference / Transaction ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each detailedModes as mode}
                                        <tr>
                                            <td class="ps-3 text-capitalize fw-medium">
                                                {mode.type === 'cheque' ? 'Cheque/DD' : mode.type}
                                            </td>
                                            <td>
                                                <input 
                                                    type="number" 
                                                    class="form-control form-control-sm font-monospace" 
                                                    bind:value={mode.amount} 
                                                    min="0" 
                                                    placeholder="0.00" 
                                                />
                                            </td>
                                            <td class="pe-3">
                                                <input 
                                                    type="text" 
                                                    class="form-control form-control-sm" 
                                                    bind:value={mode.reference} 
                                                    placeholder="Ref No." 
                                                    disabled={mode.amount <= 0} 
                                                />
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Summary Cards -->
                    <div class="row g-3 mb-4">
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded text-center border">
                                <small class="text-muted d-block mb-1">Total Fee for Scheme</small>
                                <h5 class="mb-0 fw-bold text-danger">₹{totalSchemeFee.toLocaleString()}</h5>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-primary bg-opacity-10 rounded text-center border border-primary border-opacity-25">
                                <small class="text-primary d-block mb-1">Collecting Now</small>
                                <h5 class="mb-0 fw-bold text-primary">₹{totalCollectingNow.toLocaleString()}</h5>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded text-center border">
                                <small class="text-muted d-block mb-1">Balance After</small>
                                <h5 class="mb-0 fw-bold {balanceAfter <= 0 ? 'text-success' : 'text-dark'}">₹{balanceAfter.toLocaleString()}</h5>
                            </div>
                        </div>
                    </div>

                    <div class="mb-4">
                        <label for="remarks" class="form-label fw-bold">Internal Comment / Remarks</label>
                        <textarea 
                            id="remarks" 
                            class="form-control" 
                            rows="2" 
                            bind:value={remarks}
                            placeholder="Add notes (e.g. Re-initiation reason, cheque details, transfer notes)..."
                        ></textarea>
                    </div>

                    <button 
                        type="button" 
                        class="btn btn-warning text-dark fw-bold btn-lg w-100 py-3 shadow-sm"
                        onclick={openReviewConfirmationModal}
                    >
                        <i class="bi bi-shield-check me-2 fs-5"></i> Review & Confirm Re-Initiation
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 1. POPUP MODAL: Review Fee Components Breakdown -->
{#if showComponentsModal}
    <div class="modal fade show d-block tab-index-modal" style="background: rgba(0,0,0,0.5);" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title fw-bold">
                        <i class="bi bi-receipt me-2"></i> Itemized Fee Structure Breakdown
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick={() => showComponentsModal = false}></button>
                </div>
                <div class="modal-body p-4">
                    {#if matchingFeeStructure}
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div>
                                <span class="badge bg-primary fs-6">{matchingFeeStructure.fee_schemes?.name || 'Scheme'}</span>
                                <span class="text-muted ms-2">Total Scheme Fee: <strong>₹{totalSchemeFee.toLocaleString()}</strong></span>
                            </div>
                        </div>

                        <div class="fee-breakdown-container bg-light rounded p-3" style="max-height: 450px; overflow-y: auto;">
                            {#each matchingFeeStructure.fee_components_breakdown || matchingFeeStructure.fee_components || [] as section}
                                <div class="mb-3">
                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 small text-uppercase">
                                        {section.name || section.section}
                                    </h6>
                                    {#each section.items || [] as item}
                                        {@const val = Number(item.amount || 0)}
                                        {@const displayAmt = (feePeriod === 'semester' && item.allow_partial) ? (val / 2) : val}
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <span class="text-muted small">
                                                {item.name}
                                                {#if feePeriod === 'semester' && item.allow_partial}
                                                    <span class="badge bg-info bg-opacity-10 text-primary border border-primary border-opacity-25 ms-1" style="font-size: 0.65rem;">50% Semester</span>
                                                {:else if feePeriod === 'semester'}
                                                    <span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 ms-1" style="font-size: 0.65rem;">100% Full</span>
                                                {/if}
                                            </span>
                                            <span class="small fw-semibold">₹{displayAmt.toLocaleString()}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                            <div class="d-flex justify-content-between mt-3 pt-2 border-top fw-bold text-dark fs-6">
                                <span>Total Fee</span>
                                <span class="text-success">₹{totalSchemeFee.toLocaleString()}</span>
                            </div>
                        </div>
                    {:else}
                        <div class="alert alert-warning text-center py-3 mb-0">
                            <i class="bi bi-exclamation-triangle-fill me-1"></i> No fee structure configured for the selected Target Course & Fee Scheme.
                        </div>
                    {/if}
                </div>
                <div class="modal-footer bg-light px-4 py-3">
                    <button type="button" class="btn btn-secondary" onclick={() => showComponentsModal = false}>Close</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- 2. POPUP MODAL: Pre-Submission Confirmation Dialog -->
{#if showReviewModal}
    {@const studentProfiles = student?.student_profiles}
    {@const currentEnrollment = (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number || 'Pending'}
    {@const selectedCourse = (data.allCoursesWithBranches || []).find((c: any) => c.id === targetCourseId)}
    {@const selectedBranch = selectedCourse?.branches?.find((b: any) => b.id === targetBranchId)}
    {@const selectedFeeScheme = (data.feeSchemes || []).find((fs: any) => fs.id === targetFeeSchemeId)}

    <div class="modal fade show d-block tab-index-modal" style="background: rgba(0,0,0,0.6);" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-warning bg-gradient text-dark">
                    <h5 class="modal-title fw-bold">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i> Confirm Re-Initiation & Hybrid Collection
                    </h5>
                    <button type="button" class="btn-close" onclick={() => showReviewModal = false}></button>
                </div>

                <form method="POST" action="?/reinitiateAdmissionAndCollect">
                    <input type="hidden" name="application_id" value={app.id} />
                    <input type="hidden" name="payment_id" value={targetPayment.id} />
                    <input type="hidden" name="new_course_id" value={targetCourseId} />
                    <input type="hidden" name="new_branch_id" value={targetBranchId} />
                    <input type="hidden" name="new_fee_scheme_id" value={targetFeeSchemeId} />
                    <input type="hidden" name="fee_period" value={feePeriod} />
                    <input type="hidden" name="enrollment_prefix_letter" value={prefixLetter} />
                    <input type="hidden" name="payment_date" value={paymentDate} />
                    <input type="hidden" name="remarks" value={remarks} />
                    <input type="hidden" name="amount" value={totalCollectingNow} />
                    <input type="hidden" name="payment_breakdown" value={paymentBreakdownJson} />

                    <div class="modal-body p-4">
                        <div class="alert alert-info border-info mb-3">
                            <i class="bi bi-info-circle-fill me-1"></i> Submitting will record current admission details into transfer history, generate a new enrollment sequence ID, and record the hybrid fee payment.
                        </div>

                        <div class="card border-0 bg-light p-3 mb-3">
                            <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">
                                <i class="bi bi-person-lines-fill me-1 text-primary"></i> Re-Initiation Summary
                            </h6>
                            <div class="row g-2 small">
                                <div class="col-sm-5 text-muted">Student Name:</div>
                                <div class="col-sm-7 fw-bold text-dark">{student?.full_name || 'N/A'}</div>

                                <div class="col-sm-5 text-muted">Current Enrollment ID:</div>
                                <div class="col-sm-7"><span class="badge bg-dark">{currentEnrollment}</span></div>

                                <div class="col-sm-5 text-muted">Target Course:</div>
                                <div class="col-sm-7 fw-semibold">{selectedCourse?.name || app.courses?.name} ({selectedCourse?.code || 'CRS'})</div>

                                <div class="col-sm-5 text-muted">Target Branch:</div>
                                <div class="col-sm-7 fw-semibold">{selectedBranch?.name || app.branches?.name || 'Default'}</div>

                                <div class="col-sm-5 text-muted">Target Fee Scheme:</div>
                                <div class="col-sm-7 fw-semibold text-primary">{selectedFeeScheme?.name || 'General'}</div>

                                <div class="col-sm-5 text-muted">Collecting Now Total:</div>
                                <div class="col-sm-7 fw-bold text-success fs-6">₹{totalCollectingNow.toLocaleString()}</div>
                            </div>
                        </div>

                        <!-- Hybrid Breakdown Summary -->
                        <div class="card border p-3">
                            <h6 class="fw-bold text-dark mb-2">
                                <i class="bi bi-wallet2 me-1 text-primary"></i> Hybrid Collection Modes Breakdown
                            </h6>
                            <div class="table-responsive">
                                <table class="table table-sm table-bordered mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Payment Mode</th>
                                            <th>Reference / Ref No.</th>
                                            <th class="text-end">Amount (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each paymentModes.filter(m => Number(m.amount) > 0) as m}
                                            <tr>
                                                <td class="text-uppercase fw-semibold">{m.type === 'acpc' ? 'ACPC/ACPDC' : m.type}</td>
                                                <td>{m.reference || 'N/A'}</td>
                                                <td class="text-end fw-bold text-success">₹{Number(m.amount).toLocaleString()}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer bg-light px-4 py-3 justify-content-between">
                        <button type="button" class="btn btn-outline-secondary" onclick={() => showReviewModal = false}>
                            <i class="bi bi-arrow-left me-1"></i> Back & Edit
                        </button>
                        <button type="submit" class="btn btn-warning text-dark fw-bold px-4">
                            <i class="bi bi-check-circle-fill me-1"></i> Confirm & Submit Re-Initiation
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

<!-- 3. POPUP MODAL: Post-Submission Success Summary Dialog -->
{#if showSuccessModal && successData}
    <div class="modal fade show d-block tab-index-modal" style="background: rgba(0,0,0,0.6);" tabindex="-1">
        <div class="modal-dialog modal-md modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title fw-bold">
                        <i class="bi bi-patch-check-fill me-2"></i> Re-Initiation Successful
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick={() => goto('/fee-collector/payments')}></button>
                </div>
                <div class="modal-body p-4">
                    <div class="alert alert-success text-center py-2 mb-3">
                        <i class="bi bi-check-circle-fill me-1"></i> Fresh fee collection completed & receipt issued!
                    </div>

                    <div class="card border-0 bg-light p-3 mb-3">
                        <div class="row g-2 small">
                            <div class="col-5 text-muted">Student Name:</div>
                            <div class="col-7 fw-bold text-dark">{successData.studentName}</div>

                            <div class="col-5 text-muted">Previous Enrollment ID:</div>
                            <div class="col-7"><span class="badge bg-secondary">{successData.previousEnrollmentNumber}</span></div>

                            <div class="col-5 text-muted">New Enrollment ID:</div>
                            <div class="col-7"><span class="badge bg-success fs-6">{successData.newEnrollmentNumber}</span></div>

                            <div class="col-5 text-muted">Receipt Number:</div>
                            <div class="col-7 fw-bold text-primary">{successData.receiptNo || 'N/A'}</div>

                            <div class="col-5 text-muted">Total Amount Paid:</div>
                            <div class="col-7 fw-bold text-success fs-6">₹{Number(successData.amount).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-light px-4 py-3 justify-content-between">
                    <a href="/fee-collector/payments" class="btn btn-outline-secondary">
                        Back to Payments
                    </a>
                    {#if successData.createdPayment}
                        <button type="button" class="btn btn-primary" onclick={() => printReceipt(successData.createdPayment)}>
                            <i class="bi bi-printer me-1"></i> Print Receipt PDF
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
