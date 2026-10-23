<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { page } from '$app/stores';
    import PaymentButton from '$lib/components/PaymentButton.svelte';

    export let data: PageData;
    export let form: ActionData;

    // Helper to get fee structure for a given application
    $: getFeeStructure = (appId: string) => {
        if (!data.feeStructures) return null;
        const fsEntry = data.feeStructures.find(fs => fs && fs.applicationId === appId);
        return fsEntry?.feeStructure || null;
    };

    // Helper to calculate paid amount for an application (Tuition Only)
    $: getTuitionPaidAmount = (appId: string) => {
        if (!data.payments) return 0;
        return data.payments
            .filter(p => p.application_id === appId && p.status === 'completed' && p.payment_type === 'tuition_fee')
            .reduce((sum, p) => sum + p.amount, 0);
    };

    // Helper to calculate outstanding balance for tuition
    $: getOutstandingTuition = (appId: string) => {
        const feeStructure = getFeeStructure(appId);
        if (!feeStructure) return null;
        const totalFee = feeStructure.total_fee;
        const paid = getTuitionPaidAmount(appId);
        return totalFee - paid;
    };

    // Helper to get payment status badge styling and icon
    function getPaymentStatusBadge(status: string) {
        switch (status?.toLowerCase()) {
            case 'paid':
            case 'completed':
                return { class: 'bg-success', icon: 'bi-check-circle-fill', text: 'Paid' };
            case 'pending':
            case 'initiated':
                return { class: 'bg-warning text-dark', icon: 'bi-hourglass-split', text: 'Pending' };
            case 'submitted':
                return { class: 'bg-info', icon: 'bi-check2-square', text: 'Submitted' };
            case 'processing':
                return { class: 'bg-primary', icon: 'bi-arrow-repeat', text: 'Processing' };
            case 'failed':
            case 'rejected':
                return { class: 'bg-danger', icon: 'bi-x-circle-fill', text: 'Failed' };
            case 'cancelled':
                return { class: 'bg-secondary', icon: 'bi-stop-circle-fill', text: 'Cancelled' };
            case 'not_applicable':
                return { class: 'bg-light text-dark border', icon: 'bi-dash-circle', text: 'N/A' };
            default:
                return { class: 'bg-secondary', icon: 'bi-question-circle', text: status || 'Unknown' };
        }
    }

    // Helper to get payment type badge color
    function getPaymentTypeBadge(paymentType: string) {
        switch (paymentType?.toLowerCase()) {
            case 'application_fee':
                return { class: 'bg-info text-white', text: 'Application Fee', icon: 'bi-file-earmark' };
            case 'provisional_fee':
                return { class: 'bg-warning text-dark', text: 'Provisional Fee', icon: 'bi-hourglass' };
            case 'tuition_fee':
                return { class: 'bg-primary text-white', text: 'Tuition Fee', icon: 'bi-book' };
            default:
                return { class: 'bg-secondary', text: paymentType || 'Unknown', icon: 'bi-info-circle' };
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">My Payments</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <!-- Application Fees Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h4>Application Fees</h4>
        </div>
        <div class="card-body">
            {#if data.applicationsWithFees.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Fee Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.applicationsWithFees as app}
                                {@const appAny = app as any}
                                {@const statusBadge = getPaymentStatusBadge(appAny.application_fee_status)}
                                <tr>
                                    <td>{appAny.courses?.name}</td>
                                    <td>{appAny.admission_cycles?.academic_years?.name}</td>
                                    <td>₹{appAny.form_fee}</td>
                                    <td>
                                        <span class="badge {statusBadge.class} d-inline-flex align-items-center gap-1" style="font-size: 0.85rem; padding: 0.5rem 0.75rem;">
                                            <i class="bi {statusBadge.icon}"></i>
                                            {statusBadge.text}
                                        </span>
                                    </td>
                                    <td>
                                        {#if appAny.application_fee_status === 'paid' || appAny.application_fee_status === 'completed'}
                                            <span class="badge bg-success d-inline-flex align-items-center gap-1" style="font-size: 0.85rem; padding: 0.5rem 0.75rem;">
                                                <i class="bi bi-check-circle-fill"></i>
                                                Paid
                                            </span>
                                        {:else if appAny.form_fee > 0}
                                            <PaymentButton 
                                                applicationId={appAny.id} 
                                                studentId={$page.data.session?.user?.id || ''} 
                                                amount={appAny.form_fee} 
                                                paymentType="application_fee" 
                                                buttonText="Pay Fee" 
                                                buttonClass="btn btn-sm btn-primary" 
                                            />
                                        {:else}
                                            <span class="text-muted small" title="Fee amount not set">Contact Admin</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No pending application fees.</p>
            {/if}
        </div>
    </div>

    <!-- Provisional Fees Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h4>Provisional Fees</h4>
        </div>
        <div class="card-body">
            {#if data.provisionalFeeApps && data.provisionalFeeApps.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Admission No.</th>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Fee Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.provisionalFeeApps as app}
                                {@const appAny = app as any}
                                {@const provEnrollmentStatus = appAny.account_admissions?.[0]?.enrollment_status || 'pending'}
                                {@const statusBadge = getPaymentStatusBadge(provEnrollmentStatus)}
                                <tr>
                                    <td>{appAny.account_admissions?.[0]?.admission_number || 'N/A'}</td>
                                    <td>{appAny.courses?.name}</td>
                                    <td>{appAny.admission_cycles?.academic_years?.name}</td>
                                    <td><strong>₹{appAny.prov_fee || 'N/A'}</strong></td>
                                    <td>
                                        <span class="badge {statusBadge.class} d-inline-flex align-items-center gap-1" style="font-size: 0.85rem; padding: 0.5rem 0.75rem;">
                                            <i class="bi {statusBadge.icon}"></i>
                                            {statusBadge.text}
                                        </span>
                                    </td>
                                    <td>
                                        {#if appAny.prov_fee > 0 && provEnrollmentStatus !== 'confirmed'}
                                            <PaymentButton 
                                                applicationId={appAny.id} 
                                                studentId={$page.data.session?.user?.id || ''} 
                                                amount={appAny.prov_fee} 
                                                paymentType="provisional_fee" 
                                                buttonText="Pay Provisional Fee" 
                                                buttonClass="btn btn-sm btn-info" 
                                            />
                                        {:else if provEnrollmentStatus === 'confirmed'}
                                            <span class="badge bg-success d-inline-flex align-items-center gap-1" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                                <i class="bi bi-check-circle-fill"></i>
                                                Confirmed
                                            </span>
                                        {:else}
                                            <span class="text-muted small">No Fee Required</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No pending provisional fees.</p>
            {/if}
        </div>
    </div>

    <!-- Tuition Fees Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h4>Tuition Fees</h4>
        </div>
        <div class="card-body">
            {#if data.tuitionFeeApps.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Admission No.</th>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Total Fee</th>
                                <th>Paid</th>
                                <th>Outstanding</th>
                                <th>Progress</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.tuitionFeeApps as app}
                                {@const appAny = app as any}
                                {@const feeStructure = getFeeStructure(appAny.id)}
                                {@const paidAmount = getTuitionPaidAmount(appAny.id)}
                                {@const outstanding = getOutstandingTuition(appAny.id)}
                                {@const progressPercent = feeStructure ? Math.round((paidAmount / feeStructure.total_fee) * 100) : 0}
                                {@const isFullyPaid = outstanding !== null && outstanding <= 0}
                                <tr>
                                    <td>{appAny.account_admissions?.[0]?.admission_number || 'N/A'}</td>
                                    <td>{appAny.courses?.name}</td>
                                    <td>{appAny.admission_cycles?.academic_years?.name}</td>
                                    <td><strong>₹{feeStructure?.total_fee || 'N/A'}</strong></td>
                                    <td><span class="badge bg-success">₹{paidAmount}</span></td>
                                    <td>
                                        {#if outstanding !== null}
                                            <span class="badge {outstanding > 0 ? 'bg-danger' : 'bg-success'}">
                                                ₹{outstanding > 0 ? outstanding : 0}
                                            </span>
                                        {:else}
                                            <span class="text-muted">N/A</span>
                                        {/if}
                                    </td>
                                    <td>
                                        <div class="progress" style="height: 20px; width: 100px;">
                                            <div 
                                                class="progress-bar {isFullyPaid ? 'bg-success' : 'bg-info'}" 
                                                role="progressbar" 
                                                style="width: {progressPercent}%"
                                                title="{progressPercent}% paid">
                                                <small>{progressPercent}%</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        {#if outstanding && outstanding > 0}
                                            <PaymentButton 
                                                applicationId={appAny.id} 
                                                studentId={$page.data.session?.user?.id || ''} 
                                                amount={outstanding} 
                                                paymentType="tuition_fee" 
                                                buttonText="Pay Tuition" 
                                                buttonClass="btn btn-sm btn-success" 
                                            />
                                        {:else if isFullyPaid}
                                            <span class="badge bg-success d-inline-flex align-items-center gap-1" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                                <i class="bi bi-check-circle-fill"></i>
                                                Paid
                                            </span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No approved applications requiring tuition payment at this time.</p>
            {/if}
        </div>
    </div>

    <!-- Payment History -->
    <div class="card">
        <div class="card-header">
            <h4>Payment History</h4>
        </div>
        <div class="card-body">
            {#if data.payments.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Application ID</th>
                                <th>Payment Type</th>
                                <th>Amount</th>
                                <th>Transaction ID</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Receipt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.payments as payment}
                                {@const typeBadge = getPaymentTypeBadge(payment.payment_type)}
                                {@const statusBadge = getPaymentStatusBadge(payment.status)}
                                <tr>
                                    <td title={payment.application_id}><small>{payment.application_id.substring(0, 8)}...</small></td>
                                    <td>
                                        <span class="badge {typeBadge.class} d-inline-flex align-items-center gap-1" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                            <i class="bi {typeBadge.icon}"></i>
                                            {typeBadge.text}
                                        </span>
                                    </td>
                                    <td><strong>₹{payment.amount}</strong></td>
                                    <td><small class="text-muted">{payment.transaction_id?.substring(0, 12)}...</small></td>
                                    <td>
                                        <span class="badge {statusBadge.class} d-inline-flex align-items-center gap-1" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                            <i class="bi {statusBadge.icon}"></i>
                                            {statusBadge.text}
                                        </span>
                                    </td>
                                    <td><small>{new Date(payment.payment_date).toLocaleDateString()}</small></td>
                                    <td>
                                        {#if payment.status === 'completed'}
                                            <a href="/receipts/print?payment_id={payment.id}" target="_blank" class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1">
                                                <i class="bi bi-printer"></i> Print
                                            </a>
                                        {:else}
                                            <span class="text-muted small">-</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No payment history found.</p>
            {/if}
        </div>
    </div>
</div>

<style>
    .badge {
        font-weight: 500;
        letter-spacing: 0.3px;
    }

    .badge i {
        font-size: 0.9em;
    }

    .progress {
        background-color: #e9ecef;
        border-radius: 0.25rem;
    }

    .progress-bar {
        transition: width 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .table-hover tbody tr:hover {
        background-color: rgba(0, 0, 0, 0.02);
    }

    .card {
        border: 1px solid #dee2e6;
        box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        transition: box-shadow 0.3s ease;
    }

    .card:hover {
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    .card-header {
        background-color: #f8f9fa;
        border-bottom: 2px solid #dee2e6;
        font-weight: 600;
    }

    .btn-sm {
        font-size: 0.8rem;
        padding: 0.4rem 0.6rem;
    }
</style>
