<script lang="ts">
    import * as XLSX from 'xlsx';
    
    let { data } = $props<{ data: { payments: any[] } }>();

    function exportToExcel() {
        const tableData = data.payments.map((p: any) => ({
            'Receipt No': p.receipt_number,
            'Enrollment No': p.student?.student_profiles?.enrollment_number || 'N/A',
            'Student Name': p.student?.full_name || 'N/A',
            'Academic Year': p.academic_years?.name,
            'Amount (INR)': p.total_amount,
            'Transaction ID': p.transaction_number,
            'Payment Date': new Date(p.payment_date).toLocaleDateString('en-GB'),
            'Collected By': p.collector?.email || 'N/A'
        }));

        const worksheet = XLSX.utils.json_to_sheet(tableData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Bus Seva Payments');
        XLSX.writeFile(workbook, 'Bus_Seva_Payments_Report.xlsx');
    }
</script>

<div class="container mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Bus Seva Payments Report</h2>
        <div>
            <a href="/busseva" class="btn btn-outline-secondary me-2">Back to Search</a>
            <button class="btn btn-success" onclick={exportToExcel}>Export Excel</button>
        </div>
    </div>

    <div class="table-responsive bg-white rounded shadow-sm">
        <table class="table align-middle mb-0">
            <thead>
                <tr>
                    <th>Receipt No</th>
                    <th>Enrollment No</th>
                    <th>Student Name</th>
                    <th>Year</th>
                    <th>Amount</th>
                    <th>Transaction ID</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                {#each data.payments as p}
                    <tr>
                        <td class="fw-bold">{p.receipt_number}</td>
                        <td>{p.student?.student_profiles?.enrollment_number || 'N/A'}</td>
                        <td>{p.student?.full_name || 'N/A'}</td>
                        <td>{p.academic_years?.name}</td>
                        <td>INR {p.total_amount.toLocaleString('en-IN')}</td>
                        <td class="text-monospace">{p.transaction_number}</td>
                        <td>{new Date(p.payment_date).toLocaleDateString('en-GB')}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>
