<script lang="ts">
    import type { PageData } from './$types';
    import { downloadReceiptPDF, generateReceiptPDF } from '$lib/utils/pdfGenerator';

    export let data: PageData;
    const { payment, university, college } = data;
    const app = payment.applications;
    const student = app?.student_user;
    const profile = student?.student_profiles;
    const course = app?.courses;
    const branch = app?.branches;
    
    // Explicitly check for is_prov
    const isProvisional = app?.form_types?.is_prov || payment.payment_type === 'provisional_fee';

    const admissionNo = Array.isArray(app?.account_admissions) 
        ? app?.account_admissions[0]?.admission_number 
        : app?.account_admissions?.admission_number;

    const academicYear = app?.admission_cycles?.academic_years?.name || '-';
    
    const feePeriod = payment.fee_period || 'year';
    let feeBreakdown = (payment.fee_components_breakdown || []).map((s: any) => ({
        ...s,
        name: s.section || s.name || '',
        items: (s.items || []).map((i: any) => {
            const val = parseAmount(i.amount);
            const displayAmt = (feePeriod === 'semester' && i.allow_partial) ? (val / 2) : val;
            return { ...i, amount: displayAmt };
        })
    }));

    let paymentModes = payment.payment_breakdown || [];

    // Fallback: If JSON breakdown is empty but flat columns have data
    if ((!paymentModes || paymentModes.length === 0) && payment.payment_mode) {
        paymentModes = [{
            mode: payment.payment_mode,
            amount: payment.amount,
            ref: payment.reference_no
        }];
    }

    // Robust amount parsing
    function parseAmount(val: any): number {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace(/[^0-9.-]+/g, '');
        const parsed = parseFloat(clean);
        return isNaN(parsed) ? 0 : parsed;
    }

    let grandTotal = parseAmount(payment.amount);

    function numberToWords(num: number): string {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        let numStr = num.toString();
        if (numStr.length > 9) return 'overflow';
        const n: any = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return ''; 
        let str = '';
        str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'Crore ' : '';
        str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'Lakh ' : '';
        str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'Thousand ' : '';
        str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'Hundred ' : '';
        str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) + 'Only' : 'Only';
        return str.trim();
    }

    function triggerPrint() {
        const receiptData = {
            receiptNumber: payment.receipt_number || payment.transaction_id || 'PENDING',
            date: payment.payment_date,
            studentName: student?.full_name || 'N/A',
            email: student?.email || 'N/A',
            enrollmentNumber: profile?.enrollment_number,
            admissionNumber: admissionNo,
            courseName: course?.name || 'N/A',
            branchName: branch?.name,
            academicYear: academicYear,
            semester: feePeriod === 'semester' ? 'SEMESTER' : 'ACADEMIC YEAR',
            paymentType: payment.payment_type || 'fee',
            isProvisional,
            transactionId: payment.transaction_id,
            amount: grandTotal,
            totalStructureFee: grandTotal, 
            feeBreakdown: feeBreakdown.map((s: any) => ({
                name: s.name,
                items: (s.items || []).map((i: any) => ({ name: i.name, amount: i.amount }))
            })),
            paymentModes: paymentModes.map((m: any) => ({ 
                mode: m.mode || m.type, 
                amount: parseAmount(m.amount), 
                ref: m.ref || m.reference,
                date: m.date || payment.payment_date,
                bankName: m.bankName
            })),
            collegeAlias: college?.code || 'SVIT',
            university: {
                name: college?.name || university?.name || 'SVIT, Vasad',
                logoUrl: college?.logo_url || university?.logo_url,
                address: college?.address || university?.address || 'Vasad',
                contactEmail: university?.contact_email || 'admission@svitvasad.ac.in'
            }
        };
        generateReceiptPDF(receiptData);
    }

    function triggerDownload() {
        const receiptData = {
            receiptNumber: payment.receipt_number || payment.transaction_id || 'PENDING',
            date: payment.payment_date,
            studentName: student?.full_name || 'N/A',
            email: student?.email || 'N/A',
            enrollmentNumber: profile?.enrollment_number,
            admissionNumber: admissionNo,
            courseName: course?.name || 'N/A',
            branchName: branch?.name,
            academicYear: academicYear,
            semester: feePeriod === 'semester' ? 'SEMESTER' : 'ACADEMIC YEAR',
            paymentType: payment.payment_type || 'fee',
            isProvisional,
            transactionId: payment.transaction_id,
            amount: grandTotal,
            totalStructureFee: grandTotal,
            feeBreakdown: feeBreakdown.map((s: any) => ({
                name: s.name,
                items: (s.items || []).map((i: any) => ({ name: i.name, amount: i.amount }))
            })),
            paymentModes: paymentModes.map((m: any) => ({ 
                mode: m.mode || m.type, 
                amount: parseAmount(m.amount), 
                ref: m.ref || m.reference,
                date: m.date || payment.payment_date,
                bankName: m.bankName
            })),
            collegeAlias: college?.code || 'SVIT',
            university: {
                name: college?.name || university?.name || 'SVIT, Vasad',
                logoUrl: college?.logo_url || university?.logo_url,
                address: college?.address || university?.address || 'Vasad',
                contactEmail: university?.contact_email || 'admission@svitvasad.ac.in'
            }
        };
        downloadReceiptPDF(receiptData);
    }

    const getMode = (type: string) => paymentModes.find((m: any) => (m.mode || m.type).toLowerCase() === type.toLowerCase());

</script>

<svelte:head>
    <title>Fee Receipt - {payment.receipt_number || 'Draft'}</title>
</svelte:head>

<div class="actions-bar text-end p-3 d-print-none bg-light border-bottom">
    <button class="btn btn-secondary me-2 shadow-sm" on:click={triggerPrint}>
        <i class="bi bi-printer me-2"></i> Print Receipt (PDF)
    </button>
    <button class="btn btn-primary shadow-sm" on:click={triggerDownload}>
        <i class="bi bi-download me-2"></i> Download PDF
    </button>
</div>

<div class="receipt-outer-container">
    <div class="receipt-page" id="receipt-element">
        
        {#if payment.payment_type === 'tuition_fee'}
            <!-- DETAILED TUITION LAYOUT -->
            <div class="receipt-header text-center mb-4">
                <div class="d-flex align-items-center justify-content-center mb-2">
                    {#if college?.logo_url || university?.logo_url}
                        <img src={college?.logo_url || university?.logo_url} alt="Logo" class="me-3" style="height: 60px;">
                    {/if}
                    <h2 class="m-0 fw-bold">
                        {#if (college?.name || university?.name || '').includes('(')}
                            {@const nameParts = (college?.name || university?.name || '').split('(')}
                            {nameParts[0].trim()}<br>
                            ({nameParts.slice(1).join('(').trim()}
                        {:else}
                            {college?.name || university?.name || 'College Name'}
                        {/if}
                    </h2>
                </div>
                <h5 class="fw-bold">Academic Year: {academicYear}</h5>
            </div>
            <!-- ... Tuition layout contents remain same ... -->
            <div class="row mb-2">
                <div class="col-7">
                    <p><strong>College ID:</strong> {profile?.enrollment_number || admissionNo || '-'}</p>
                    <p><strong>Branch Name:</strong> {branch?.name || course?.name || '-'}</p>
                </div>
                <div class="col-5 text-end">
                    <p><strong>Receipt Number:</strong> {payment.receipt_number || 'PENDING'}</p>
                    <p><strong>Date:</strong> {new Date(payment.payment_date).toLocaleDateString('en-IN')}</p>
                </div>
            </div>
            <div class="received-section mb-3">
                <p class="mb-1">Recieved From,</p>
                <h5 class="fw-bold mb-2 text-uppercase">{student?.full_name}</h5>
                <p>The Following amount as Fees for the <strong>{course?.name}</strong> for {feePeriod === 'semester' ? 'a' : 'an'} <strong>{feePeriod === 'semester' ? 'SEMESTER' : 'ACADEMIC YEAR'} {academicYear}</strong></p>
            </div>
            <table class="table table-bordered border-dark fee-table mb-2">
                <thead><tr class="bg-light"><th style="width: 50px;" class="text-center">Sr.</th><th>Particulars</th><th style="width: 150px;" class="text-end">Fees in Rs.</th></tr></thead>
                <tbody>
                    {#if feeBreakdown && Array.isArray(feeBreakdown)}
                        {#each feeBreakdown as section}
                            {@const sectionName = section.section || section.name}
                            {#if sectionName}<tr class="section-header"><td></td><td class="fw-bold">{sectionName}</td><td></td></tr>{/if}
                            {#each section.items || [] as item, i}
                                <tr><td class="text-center">{i + 1}</td><td>{item.name}</td><td class="text-end">{parseAmount(item.amount).toLocaleString('en-IN')}</td></tr>
                            {/each}
                            <tr class="subtotal-row"><td></td><td class="text-end fw-bold">SubTotal</td><td class="text-end fw-bold">{section.items?.reduce((s, it) => s + parseAmount(it.amount), 0).toLocaleString('en-IN')}</td></tr>
                        {/each}
                    {:else}
                        <tr><td class="text-center">1</td><td>{payment.payment_type?.replace('_', ' ').toUpperCase()}</td><td class="text-end">{grandTotal.toLocaleString('en-IN')}</td></tr>
                    {/if}
                </tbody>
                <tfoot><tr class="grand-total-row"><td></td><td class="text-end fw-bold">Grand Total in Rs.</td><td class="text-end fw-bold">{grandTotal.toLocaleString('en-IN')}</td></tr></tfoot>
            </table>
            <div class="words-section mb-4"><p><strong>In Words:</strong> {numberToWords(grandTotal)} Only</p></div>
            <div class="payment-grid mb-4">
                <table class="table table-bordered border-dark mb-0">
                    <tbody>
                        <tr><td class="fw-bold bg-light" style="width: 120px;">CASH</td><td>Amount: {getMode('cash') ? Number(getMode('cash').amount).toLocaleString('en-IN') : '0'}</td><td>ADVANCE Amount: {getMode('advance') ? Number(getMode('advance').amount).toLocaleString('en-IN') : '0'}</td><td>Freeship Amount: {getMode('freeship') ? Number(getMode('freeship').amount).toLocaleString('en-IN') : '0'}</td></tr>
                        <tr><td class="fw-bold bg-light">DD/Cheque</td><td>Amount: {(getMode('cheque') || getMode('dd')) ? Number((getMode('cheque') || getMode('dd')).amount).toLocaleString('en-IN') : '0'}</td><td>Bank Name: {(getMode('cheque') || getMode('dd'))?.bankName || '-'}</td><td>Ref.: {(getMode('cheque') || getMode('dd'))?.ref || '-'} Date: {(getMode('cheque') || getMode('dd'))?.date ? new Date((getMode('cheque') || getMode('dd')).date).toLocaleDateString() : '-'}</td></tr>
                        <tr><td class="fw-bold bg-light">Online</td><td>Amount: {getMode('online') ? Number(getMode('online').amount).toLocaleString('en-IN') : '0'}</td><td colspan="2">Reference Number: {getMode('online')?.ref || '-'}</td></tr>
                        <tr><td class="fw-bold bg-light">ACPC</td><td colspan="3">Amount: {getMode('acpc') ? Number(getMode('acpc').amount).toLocaleString('en-IN') : '0'}</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="d-flex justify-content-end mb-5">
                <div class="text-center" style="width: 200px;">
                    <div style="height: 65px; border: 1px solid black; width: 65px; margin: 0 auto 5px;"></div>
                    <p class="mb-0 fw-bold">Authorized Signature</p>
                    <p class="small">{college?.code || 'SVIT'}, Vasad</p>
                </div>
            </div>
            <div class="footer-notes border-top pt-3 mt-auto"><p class="small mb-1 italic"><strong>Note::</strong> In addition to above tuition fees, candidate shall have to pay the fees of course/institute fixed by the Fees Regulatory Committee as and when declared from the academic year {academicYear}</p><p class="small italic"><strong>Note::</strong> Rs.5,000/- refundable deposit after Final Semester clear and verification of original Marksheet</p></div>
        {/if}

        {#if isProvisional && payment.payment_type !== 'tuition_fee'}
            <!-- PROVISIONAL LAYOUT (Matching IMG-20260511-WA0011.jpg) - TWO COPIES -->
            {#each ['STUDENT', 'OFFICE'] as copyType, i}
                {#if i === 1}
                    <div class="cut-line-container my-4">
                        <div class="cut-line"></div>
                        <div class="cut-label"><i class="bi bi-scissors me-2"></i>Cut Here</div>
                    </div>
                {/if}
                <div class="provisional-copy">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div class="d-flex align-items-center">
                            {#if college?.logo_url || university?.logo_url}
                                <img src={college?.logo_url || university?.logo_url} alt="Logo" class="me-3" style="height: 50px;">
                            {/if}
                            <div>
                                <h3 class="fw-bold m-0" style="font-size: 1.3rem;">{college?.name || university?.name || 'SARDAR VALLABHBHAI PATEL INSTITUTE OF TECHNOLOGY'}</h3>
                                <p class="small m-0 text-muted">{college?.address || 'Vasad'}</p>
                                <p class="small m-0 text-muted">{university?.contact_email || 'admission @svitvasad.ac.in'}</p>
                            </div>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-dark px-3 py-2">{copyType} COPY</span>
                        </div>
                    </div>

                    <h4 class="text-center fw-bold mb-4" style="text-decoration: underline;">FEE RECEIPT</h4>

                    <div class="row mb-3">
                        <div class="col-6">
                            <p class="mb-1"><strong>Receipt No:</strong> {payment.receipt_number || 'PENDING'}</p>
                        </div>
                        <div class="col-6 text-end">
                            <p class="mb-1"><strong>Date:</strong> {new Date(payment.payment_date).toLocaleDateString('en-IN')}</p>
                        </div>
                    </div>

                    <div class="row mb-4">
                        <div class="col-6">
                            <h6 class="fw-bold border-bottom pb-1 mb-2">Student Details</h6>
                            <p class="mb-1">Name: <span class="text-uppercase">{student?.full_name}</span></p>
                            <p class="mb-1">Email: {student?.email}</p>
                        </div>
                        <div class="col-6">
                            <h6 class="fw-bold border-bottom pb-1 mb-2">Admission Details</h6>
                            <p class="mb-1">Prov Adm ID: {admissionNo || app?.provisional_admission_id || '-'}</p>
                            <p class="mb-1">Course: {course?.name}</p>
                            <p class="mb-1">Branch: {branch?.name || '-'}</p>
                        </div>
                    </div>

                    <table class="table table-bordered border-dark mb-4">
                        <thead class="bg-light">
                            <tr>
                                <th>Description</th>
                                <th class="text-end" width="150">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="py-3">
                                    <div class="fw-bold">PROVISIONAL FEE</div>
                                    <small class="text-muted">Ref: {payment.transaction_id || '-'}</small>
                                </td>
                                <td class="text-end fw-bold py-3">Rs. {grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="d-flex justify-content-between align-items-end mt-4">
                        <p class="small italic m-0">{college?.name || university?.name}, Vasad</p>
                        <div class="text-center">
                            <p class="mb-0">Signature: ________________</p>
                        </div>
                    </div>
                </div>
            {/each}

        {/if}

        {#if payment.payment_type !== 'tuition_fee' && !isProvisional}
            <!-- SIMPLE ORIGINAL LAYOUT (For Standard Application Fees) -->
            <div class="receipt-header text-center mb-4">
                <div class="d-flex align-items-center justify-content-center mb-2">
                    {#if college?.logo_url || university?.logo_url}
                        <img src={college?.logo_url || university?.logo_url} alt="Logo" class="me-3" style="height: 60px;">
                    {/if}
                    <h2 class="m-0 fw-bold">{college?.name || university?.name || 'College Name'}</h2>
                </div>
                <h4 class="mt-2">FEE RECEIPT</h4>
            </div>
            <div class="row mb-4">
                <div class="col-6">
                    <p><strong>Receipt No:</strong> {payment.receipt_number || 'PENDING'}</p>
                    <p><strong>Date:</strong> {new Date(payment.payment_date).toLocaleDateString('en-IN')}</p>
                </div>
                <div class="col-6 text-end">
                    <p class="text-muted italic">ORIGINAL COPY</p>
                    <p><strong>College ID:</strong> {profile?.enrollment_number || admissionNo || '-'}</p>
                </div>
            </div>
            <div class="mb-4">
                <p><strong>Received with thanks from:</strong> <span class="text-uppercase">{student?.full_name}</span></p>
                <p><strong>Course:</strong> {course?.name}</p>
                <p><strong>Payment Type:</strong> {payment.payment_type?.replace('_', ' ').toUpperCase()}</p>
            </div>
            <table class="table table-bordered mb-4">
                <thead class="bg-light"><tr><th>Description</th><th class="text-end" width="200">Amount (INR)</th></tr></thead>
                <tbody><tr><td>{payment.payment_type?.replace('_', ' ').toUpperCase()} Payment</td><td class="text-end">{grandTotal.toLocaleString('en-IN')}</td></tr></tbody>
                <tfoot><tr class="fw-bold"><td class="text-end">Total Amount Paid</td><td class="text-end">{grandTotal.toLocaleString('en-IN')}</td></tr></tfoot>
            </table>
            <div class="mb-5"><p><strong>Amount in words:</strong> {numberToWords(grandTotal)} Only</p></div>
            <div class="text-center mt-5"><p class="small text-muted">This is a computer-generated receipt and does not require a signature.</p></div>
        {/if}

    </div>
</div>

<style>
    .receipt-outer-container { background-color: #f0f2f5; padding: 40px 0; min-height: 100vh; }
    .receipt-page { max-width: 850px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 0 20px rgba(0,0,0,0.1); min-height: 297mm; display: flex; flex-direction: column; color: black; font-family: Arial, sans-serif; }
    h2 { font-size: 1.5rem; letter-spacing: 0.5px; }
    p { margin-bottom: 0.4rem; font-size: 14px; }
    .fee-table th, .fee-table td { padding: 6px 12px; font-size: 13px; vertical-align: middle; }
    .section-header td { background-color: #f8f9fa; font-size: 13px; }
    .subtotal-row td { border-top: 1px solid #dee2e6; font-size: 13px; }
    .grand-total-row td { border-top: 2px solid black; font-size: 15px; }
    .payment-grid td { padding: 6px 10px; font-size: 12px; border-color: black !important; }
    .footer-notes p { font-size: 11px; line-height: 1.4; }
    .italic { font-style: italic; }
    .border-dashed { border-style: dashed !important; }
    
    .cut-line-container {
        position: relative;
        text-align: center;
        width: 100%;
    }

    .cut-line {
        border-top: 2px dotted #aaa;
        width: 100%;
        position: absolute;
        top: 50%;
        left: 0;
        z-index: 1;
    }

    .cut-label {
        position: relative;
        background: white;
        display: inline-block;
        padding: 0 15px;
        color: #888;
        font-size: 12px;
        font-style: italic;
        z-index: 2;
    }
    
    @media print {
        .actions-bar { display: none !important; }
        .receipt-outer-container { padding: 0; background: white; }
        .receipt-page { box-shadow: none; padding: 15mm; width: 100%; height: 100%; }
        .mt-5 { margin-top: 3rem !important; }
    }
</style>