<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { toastStore } from '$lib/stores/toastStore';
    import { goto, invalidateAll } from '$app/navigation';
    import { generateReceiptPDF, downloadReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

    let { data, form } = $props();

    let payment = $derived(data.payment);
    let app = $derived(payment.applications as any);
    let student = $derived(app.student_user);

    let isEditingName = $state(false);
    let editNameValue = $state('');

    let paymentDate = $state(payment.payment_date.split('T')[0]);
    let receiptNumber = $state(payment.receipt_number || '');
    
    // Initialize payment modes from existing breakdown
    let paymentModes = $state([
        { type: 'cash', amount: 0, reference: '' },
        { type: 'online', amount: 0, reference: '' },
        { type: 'cheque', amount: 0, reference: '' },
        { type: 'acpc', amount: 0, reference: '' },
        { type: 'advance', amount: 0, reference: '' },
        { type: 'freeship', amount: 0, reference: '' }
    ]);

    // Fill initial values from existing breakdown
    if (payment.payment_breakdown) {
        payment.payment_breakdown.forEach((m: any) => {
            const mode = paymentModes.find(pm => pm.type === (m.type || m.mode));
            if (mode) {
                mode.amount = Number(m.amount) || 0;
                mode.reference = m.ref || m.reference || '';
            } else {
                // Handle unknown modes if any
                paymentModes.push({
                    type: m.type || m.mode,
                    amount: Number(m.amount) || 0,
                    reference: m.ref || m.reference || ''
                });
            }
        });
    }

    let totalAmount = $derived(paymentModes.reduce((sum, m) => sum + (Number(m.amount) || 0), 0));
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
                if (form.success) goto('/fee-collector/payments');
            }
        }
    });

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
        
        if (response.ok) {
            toastStore.success('Student name updated!');
            isEditingName = false;
            await invalidateAll();
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
            name: 'SVIT, Vasad',
            address: 'Vasad, Gujarat',
            contactEmail: 'admission@svitvasad.ac.in',
            logoUrl: undefined
        };

        const college = app.courses?.colleges;
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
            admissionNumber: app.account_admissions?.[0]?.admission_number || app.account_admissions?.admission_number,
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

    function goBack() {
        window.history.back();
    }
</script>

<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-lg-8">
            <div class="d-flex align-items-center justify-content-between mb-4">
                <div class="d-flex align-items-center">
                    <button class="btn btn-outline-secondary me-3" on:click={goBack}>
                        <i class="bi bi-arrow-left"></i>
                    </button>
                    <h1 class="h3 mb-0">Edit Payment Record</h1>
                </div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-secondary px-3" on:click={() => printReceipt(payment)}>
                        <i class="bi bi-printer me-2"></i>Print Receipt
                    </button>
                    <button type="button" class="btn btn-outline-secondary px-3" on:click={() => downloadReceipt(payment)}>
                        <i class="bi bi-download me-2"></i>Download Receipt
                    </button>
                </div>
            </div>

            <div class="card shadow-sm border-0 mb-4">
                <div class="card-body p-4">
                    <div class="d-flex align-items-center mb-4">
                        <div class="avatar bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 50px; height: 50px;">
                            <i class="bi bi-person fs-3"></i>
                        </div>
                        <div>
                            {#if isEditingName}
                                <div class="input-group input-group-sm mb-1" style="max-width: 300px;">
                                    <input type="text" class="form-control" bind:value={editNameValue} placeholder="Full Name" />
                                    <button class="btn btn-success" type="button" on:click={handleUpdateName}>
                                        <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="btn btn-outline-secondary" type="button" on:click={() => isEditingName = false}>
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            {:else}
                                <h5 class="mb-0 fw-bold d-flex align-items-center">
                                    {student?.full_name}
                                    <button class="btn btn-sm text-muted p-0 ms-2" type="button" on:click={startEditingName} title="Edit student name">
                                        <i class="bi bi-pencil-square"></i>
                                    </button>
                                </h5>
                            {/if}
                            <p class="text-muted mb-0 small">{student?.email}</p>
                        </div>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <small class="text-muted d-block text-uppercase">Course</small>
                            <span class="fw-bold">{app.courses.name}</span>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted d-block text-uppercase">Branch</small>
                            <span class="fw-bold">{app.branches?.name || 'General'}</span>
                        </div>
                    </div>

                    <hr/>

                    <form method="POST" action="?/updatePayment" use:enhance={() => {
                        startLoading();
                        return async ({ result, update }) => {
                            stopLoading();
                            await update();
                        };
                    }}>
                        <input type="hidden" name="amount" value={totalAmount} />
                        <input type="hidden" name="payment_breakdown" value={paymentBreakdownJson} />

                        <div class="row g-4 mb-4">
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Receipt Number</label>
                                <input type="text" name="receipt_number" class="form-control" bind:value={receiptNumber} required />
                            </div>
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Payment Date</label>
                                <input type="date" name="payment_date" class="form-control" bind:value={paymentDate} required />
                            </div>
                        </div>

                        <div class="mb-4">
                            <label class="form-label fw-bold mb-3">Payment Breakdown</label>
                            <div class="table-responsive rounded border">
                                <table class="table table-hover align-middle mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="ps-3">Mode</th>
                                            <th width="150">Amount (₹)</th>
                                            <th class="pe-3">Reference / Transaction ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each paymentModes as mode}
                                            <tr>
                                                <td class="ps-3 text-capitalize fw-medium">
                                                    {mode.type === 'cheque' ? 'Cheque/DD' : mode.type === 'acpc' ? 'ACPC/ACPDC' : mode.type}
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
                                    <tfoot>
                                        <tr class="table-light fw-bold">
                                            <td class="ps-3">Total Amount</td>
                                            <td>₹{totalAmount.toLocaleString()}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div class="alert alert-info">
                            <i class="bi bi-info-circle me-2"></i>
                            Editing this record will update the payment details in the database and linked transactions. This is intended for correcting data entry errors.
                        </div>

                        <div class="d-grid gap-2 d-md-flex justify-content-md-end">
                            <button type="button" class="btn btn-light px-4" on:click={goBack}>Cancel</button>
                            <button type="submit" class="btn btn-primary px-4 fw-bold" disabled={totalAmount <= 0}>
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .avatar { flex-shrink: 0; }
</style>
