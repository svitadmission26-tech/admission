<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { startLoading, stopLoading, isLoading } from '$lib/stores/loadingStore';
    import { toastStore } from '$lib/stores/toastStore';
    import { goto, invalidateAll } from '$app/navigation';
    import { generateReceiptPDF, downloadReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

    let { data, form } = $props();

    let admission = $derived(data.admission);
    let app = $derived(admission.applications as any);
    let student = $derived(app.student_user);
    let college = $derived(app.courses.colleges);

    let isEditingName = $state(false);
    let editNameValue = $state('');

    let feePeriod = $state('year'); 
    let paymentDate = $state(new Date().toISOString().split('T')[0]);
    let admissionCategoryCode = $state('');
    let selectedFeeSchemeId = $state(
        app.assigned_fee_scheme_id || 
        data.feeStructure?.fee_scheme_id || 
        data.feeSchemes.find((s: any) => s.name.toLowerCase() === 'general')?.id || 
        ''
    );
    let showSchemeEdit = $state(false);

    let paymentModes = $state([
        { type: 'cash', amount: 0, reference: '' },
        { type: 'online', amount: 0, reference: '' },
        { type: 'cheque', amount: 0, reference: '' },
        { type: 'acpc', amount: 20000, reference: '' },
        { type: 'advance', amount: 0, reference: '' },
        { type: 'freeship', amount: 0, reference: '' }
    ]);

    // Helpers to access specific modes safely
    let simpleModes = $derived(paymentModes.filter(m => ['cash', 'acpc', 'advance', 'freeship'].includes(m.type)));
    let detailedModes = $derived(paymentModes.filter(m => ['online', 'cheque'].includes(m.type)));

    // DERIVED CALCULATIONS
    let totalPaidForStudent = $derived(data.studentPayments.filter(p => p.payment_type === 'tuition_fee').reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    
    let firstSemAmount = $derived(() => {
        if (!data.feeStructure) return 0;
        const fs = data.feeStructure;
        if (fs.installment_json && fs.installment_json.length > 0) {
            return Number(fs.installment_json[0].amount) || 0;
        }
        let total = 0;
        (fs.fee_components || []).forEach((section: any) => {
            (section.items || []).forEach((item: any) => {
                const val = Number(item.amount) || 0;
                total += item.allow_partial ? (val / 2) : val;
            });
        });
        return total || (fs.total_fee / 2);
    });

    let amountDue = $derived(feePeriod === 'semester' ? firstSemAmount() : (data.feeStructure?.total_fee || 0));
    let initialRemainingAmount = $derived(amountDue - totalPaidForStudent);
    let totalCollectingNow = $derived(paymentModes.reduce((sum, m) => sum + (Number(m.amount) || 0), 0));
    let finalRemainingAmount = $derived(initialRemainingAmount - totalCollectingNow);

    let paymentBreakdownJson = $derived(JSON.stringify(paymentModes.filter(m => m.amount > 0).map(m => ({
        mode: m.type,
        amount: Number(m.amount) || 0,
        ref: m.reference
    }))));

    $effect(() => {
        if (form?.message) {
            if (form.error) toastStore.error(form.message);
            else {
                toastStore.success(form.message);
                if (form.success) {
                    if (form.action === 'updateStudentName') {
                        isEditingName = false;
                        invalidateAll();
                    } else {
                        // Reset payment input fields
                        paymentModes.forEach(m => {
                            m.amount = m.type === 'acpc' ? 20000 : 0;
                            m.reference = '';
                        });
                        invalidateAll();
                    }
                }
            }
        }
    });

    async function handleUpdateScheme() {
        if (!selectedFeeSchemeId) return;
        startLoading();
        const formData = new FormData();
        formData.append('application_id', app.id);
        formData.append('fee_scheme_id', selectedFeeSchemeId);
        const response = await fetch('?/updateAssignedScheme', { method: 'POST', body: formData });
        if (response.ok) {
            toastStore.success('Fee scheme updated!');
            window.location.reload();
        } else {
            toastStore.error('Failed to update scheme.');
        }
        stopLoading();
    }

    function startEditingName() {
        editNameValue = student?.full_name || '';
        isEditingName = true;
    }

    async function handleUpdateName() {
        if (!editNameValue.trim()) {
            toastStore.error('Name cannot be empty.');
            return;
        }
        startLoading();
        const formData = new FormData();
        formData.append('student_id', app.student_id);
        formData.append('full_name', editNameValue);
        const response = await fetch('?/updateStudentName', { method: 'POST', body: formData });
        const result = await response.json();
        
        if (response.ok) {
            toastStore.success('Student name updated!');
            isEditingName = false;
            window.location.reload();
        } else {
            toastStore.error('Failed to update name.');
        }
        stopLoading();
    }

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

        // Map fee_components_breakdown to ReceiptData.feeBreakdown
        // If it's tuition_fee, we want the detailed component breakdown
        const feeBreakdown = (payment.fee_components_breakdown || []).map((section: any) => ({
            name: section.name || section.section,
            items: (section.items || []).map((item: any) => {
                const val = Number(item.amount) || 0;
                // If semester payment, apply 50% to partial items to match displayed total
                const displayAmt = (feePeriod === 'semester' && item.allow_partial) ? (val / 2) : val;
                return {
                    name: item.name,
                    amount: displayAmt
                };
            })
        }));
        
        let universityData = {
            name: college?.name || 'SVIT, Vasad',
            address: college?.address || 'Vasad, Gujarat',
            contactEmail: college?.universities?.contact_email || 'admission@svitvasad.ac.in',
            logoUrl: college?.logo_url || college?.universities?.logo_url
        };

        let periodDisplay: 'SEMESTER' | 'ACADEMIC YEAR';
        if (data.userProfile?.role === 'fee_collector' && isTuition) {
            periodDisplay = (feePeriod === 'year') ? 'ACADEMIC YEAR' : 'SEMESTER';
        } else {
            periodDisplay = 'ACADEMIC YEAR'; // Default for others
        }
        
        const studentProfiles = student?.student_profiles;
        const enrollmentNumber = (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number;
        
        return {
            receiptNumber: payment.receipt_number || 'N/A',
            date: payment.payment_date,
            studentName: student?.full_name || student?.email || 'N/A',
            email: student?.email || '',
            enrollmentNumber: enrollmentNumber,
            admissionNumber: admission.admission_number,
            courseName: app.courses.name || 'N/A',
            branchName: app.branches?.name,
            academicYear: app.admission_cycles?.academic_years?.name,
            semester: periodDisplay, // Add this property
            paymentType: payment.payment_type,
            isProvisional: isProv,
            transactionId: payment.transaction_id,
            amount: Number(payment.amount),
            totalStructureFee: Number(payment.amount), // Fallback
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

<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div class="d-flex align-items-center">
            <button class="btn btn-outline-secondary me-3" on:click={() => goto('/fee-collector/payments')}>
                <i class="bi bi-arrow-left"></i>
            </button>
            <h1 class="h3 mb-0">Collect Admission Fees</h1>
        </div>
        <div class="d-flex align-items-center gap-2">
            <button class="btn btn-primary" on:click={() => goto('/fee-collector/payments')}>
                <i class="bi bi-list-ul me-1"></i> Go to Payments Page
            </button>
            <div class="badge bg-primary fs-6 px-3 py-2">
                ID: {admission.admission_number}
            </div>
        </div>
    </div>

    <div class="row">
        <!-- LEFT: Student Info & Fee Breakdown -->
        <div class="col-lg-5">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-body p-4">
                    <div class="d-flex align-items-center mb-4">
                        <div class="avatar bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 60px; height: 60px;">
                            <i class="bi bi-person fs-2"></i>
                        </div>
                        <div>
                            {#if isEditingName}
                                <div class="input-group mb-2">
                                    <input type="text" class="form-control" bind:value={editNameValue} placeholder="Full Name" />
                                    <button class="btn btn-success" on:click={handleUpdateName}>
                                        <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="btn btn-outline-secondary" on:click={() => isEditingName = false}>
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            {:else}
                                <h4 class="mb-0 fw-bold d-flex align-items-center">
                                    {student?.full_name}
                                    <button class="btn btn-sm text-muted p-0 ms-2" on:click={startEditingName}>
                                        <i class="bi bi-pencil-square"></i>
                                    </button>
                                </h4>
                            {/if}
                            <p class="text-muted mb-0">{student?.email}</p>
                            <span class="badge bg-light text-dark border mt-1">
                                Enrollment: {student?.student_profiles?.[0]?.enrollment_number || 'Pending'}
                            </span>
                        </div>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-6">
                            <small class="text-muted d-block text-uppercase">Course</small>
                            <span class="fw-bold">{app.courses.name}</span>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block text-uppercase">Branch</small>
                            <span class="fw-bold">{app.branches?.name || 'General'}</span>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block text-uppercase">Academic Year</small>
                            <span class="fw-bold">{app.admission_cycles.academic_years.name}</span>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block text-uppercase">Scheme</small>
                            <span class="fw-bold text-primary">{data.feeStructure?.fee_schemes?.name || 'General'}</span>
                            <button class="btn btn-sm p-0 ms-2 text-muted" on:click={() => showSchemeEdit = !showSchemeEdit}>
                                <i class="bi bi-pencil-square"></i>
                            </button>
                        </div>
                    </div>

                    {#if showSchemeEdit}
                        <div class="bg-light p-3 rounded mb-4 border">
                            <label class="form-label small fw-bold">Change Fee Scheme</label>
                            <div class="input-group input-group-sm">
                                <select class="form-select" bind:value={selectedFeeSchemeId}>
                                    <option value="" disabled>Select Scheme</option>
                                    {#each data.feeSchemes as scheme}
                                        <option value={scheme.id}>{scheme.name}</option>
                                    {/each}
                                </select>
                                <button class="btn btn-success" on:click={handleUpdateScheme}>Update</button>
                            </div>
                        </div>
                    {/if}

                    <hr/>

                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="mb-0 fw-bold">Fee Breakdown</h5>
                        <div class="btn-group btn-group-sm">
                            <button class="btn {feePeriod === 'year' ? 'btn-dark' : 'btn-outline-dark'}" on:click={() => feePeriod = 'year'}>Yearly</button>
                            <button class="btn {feePeriod === 'semester' ? 'btn-dark' : 'btn-outline-dark'}" on:click={() => feePeriod = 'semester'}>Semester</button>
                        </div>
                    </div>

                    {#if data.feeStructure}
                        <div class="fee-breakdown-container bg-light rounded p-3" style="max-height: 400px; overflow-y: auto;">
                            {#each data.feeStructure.fee_components || [] as section}
                                <div class="mb-3">
                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 small text-uppercase">{section.name || section.section}</h6>
                                    {#each section.items || [] as item}
                                        {@const val = Number(item.amount) || 0}
                                        {@const displayAmt = (feePeriod === 'semester' && item.allow_partial) ? (val / 2) : val}
                                        <div class="d-flex justify-content-between mb-1">
                                            <span class="text-muted small">{item.name}</span>
                                            <span class="small fw-medium">₹{displayAmt.toLocaleString()}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                            <div class="d-flex justify-content-between mt-3 pt-2 border-top fw-bold">
                                <span>Total Payable ({feePeriod.toUpperCase()})</span>
                                <span>₹{amountDue.toLocaleString()}</span>
                            </div>
                        </div>
                    {:else}
                        <div class="alert alert-warning">No fee structure found for this student.</div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- RIGHT: Payment Recording Form -->
        <div class="col-lg-7">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-white py-3 border-0">
                    <h5 class="mb-0 fw-bold">Record Payment</h5>
                </div>
                <div class="card-body p-4">
                    <form method="POST" action="?/recordPayment" use:enhance={() => {
                        startLoading();
                        return async ({ result, update }) => {
                            stopLoading();
                            await update();
                        };
                    }}>
                        <input type="hidden" name="application_id" value={app.id} />
                        <input type="hidden" name="fee_period" value={feePeriod} />
                        <input type="hidden" name="amount" value={totalCollectingNow} />
                        <input type="hidden" name="payment_breakdown" value={paymentBreakdownJson} />

                        <div class="row g-4 mb-4">
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Admission Category Code</label>
                                <input type="text" name="admission_category_code" class="form-control" placeholder="e.g. V, F, M, G" bind:value={admissionCategoryCode} required />
                                <small class="text-muted">Used for Enrollment ID generation (e.g., 'V' for Vacant)</small>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Payment Date</label>
                                <input type="date" name="payment_date" class="form-control" bind:value={paymentDate} required />
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
                                                <input type="number" class="form-control" bind:value={mode.amount} min="0" placeholder="0.00">
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            <!-- Detailed Transaction Table -->
                            <div class="table-responsive rounded border">
                                <table class="table table-hover align-middle mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="ps-3">Transaction Mode</th>
                                            <th width="150">Amount (₹)</th>
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
                                                    <input type="number" class="form-control form-control-sm" bind:value={mode.amount} min="0" placeholder="0.00">
                                                </td>
                                                <td class="pe-3">
                                                    <input type="text" class="form-control form-control-sm" bind:value={mode.reference} placeholder="Ref No." disabled={mode.amount <= 0}>
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
                                    <small class="text-muted d-block mb-1">Total Outstanding</small>
                                    <h5 class="mb-0 fw-bold text-danger">₹{initialRemainingAmount.toLocaleString()}</h5>
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
                                    <h5 class="mb-0 fw-bold {finalRemainingAmount <= 0 ? 'text-success' : 'text-dark'}">₹{finalRemainingAmount.toLocaleString()}</h5>
                                </div>
                            </div>
                        </div>

                        <div class="mb-4">
                            <label for="remarks" class="form-label fw-bold">Internal Comment / Remarks</label>
                            <textarea 
                                id="remarks" 
                                name="remarks" 
                                class="form-control" 
                                rows="2" 
                                placeholder="Add any notes about this payment (e.g. cheque details, partial payment reason)..."
                            ></textarea>
                        </div>

                        <div class="d-grid">
                            <button type="submit" class="btn btn-primary btn-lg py-3 fw-bold" disabled={totalCollectingNow <= 0 || initialRemainingAmount <= 0 || $isLoading}>
                                <i class="bi bi-cash-stack me-2"></i> Confirm & Record Payment
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- PAYMENT HISTORY -->
            <div class="card shadow-sm border-0">
                <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
                    <h5 class="mb-0 fw-bold">Student Payment History</h5>
                    <span class="badge bg-success">Total Paid: ₹{totalPaidForStudent.toLocaleString()}</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="ps-3">Date</th>
                                    <th>Receipt No.</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th class="pe-3 text-end">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each data.studentPayments as payment}
                                    <tr>
                                        <td class="ps-3">{new Date(payment.payment_date).toLocaleDateString()}</td>
                                        <td class="font-monospace small">{payment.receipt_number || '-'}</td>
                                        <td>
                                            <span class="badge bg-light text-dark border text-uppercase">{payment.payment_type.replace('_', ' ')}</span>
                                        </td>
                                        <td class="fw-bold">₹{payment.amount.toLocaleString()}</td>
                                        <td class="pe-3 text-end">
                                            <div class="btn-group">
                                                <a href="/fee-collector/payments/edit/{payment.id}" class="btn btn-sm btn-outline-primary" title="Edit Payment">
                                                    <i class="bi bi-pencil"></i>
                                                </a>
                                                <button class="btn btn-sm btn-outline-secondary" title="Print" on:click={() => printReceipt(payment)}>
                                                    <i class="bi bi-printer"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline-secondary" title="Download" on:click={() => downloadReceipt(payment)}>
                                                    <i class="bi bi-download"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {:else}
                                    <tr>
                                        <td colspan="5" class="text-center py-4 text-muted">No payments recorded yet.</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="d-flex justify-content-center mt-4">
        <button class="btn btn-primary btn-lg px-5" on:click={() => goto('/fee-collector/payments')}>
            <i class="bi bi-list-ul me-2"></i> Go to Payments Page
        </button>
    </div>
</div>

<style>
    .avatar { flex-shrink: 0; }
    .fee-breakdown-container::-webkit-scrollbar { width: 6px; }
    .fee-breakdown-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
</style>
