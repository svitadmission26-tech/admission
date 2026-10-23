<script lang="ts">
    export let data: any;

    function exportCSV() {
        const headers = ['Sr. No.', 'Student Name', 'Email', 'College ID', 'Prov Admission No', 'Prov Date', 'Final Admission No', 'Final Date', 'Payment Date', 'Merit Rank', 'Status'];
        const rows = data.reportData.map((r: any, idx: number) => [
            idx + 1,
            r.student_name,
            r.student_email,
            r.college_id,
            r.prov_admission_no,
            new Date(r.prov_date).toLocaleDateString(),
            r.final_admission_no,
            r.final_date ? new Date(r.final_date).toLocaleDateString() : '-',
            r.payment_date ? new Date(r.payment_date).toLocaleDateString() : '-',
            r.merit_rank,
            r.status
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map((e: any) => e.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'conversion_report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Provisional Conversion Report</h1>
        <div class="d-flex align-items-center gap-2">
            <a href="/adm-officer/reports" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left"></i> Back
            </a>
            <button class="btn btn-success" on:click={exportCSV}>
                <i class="bi bi-file-earmark-spreadsheet me-1"></i> Export CSV
            </button>
        </div>
    </div>

    <!-- Stats -->
    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card bg-primary text-white h-100">
                <div class="card-body">
                    <h5 class="card-title">Total Provisional</h5>
                    <h2 class="display-6">{data.stats.totalProv}</h2>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-success text-white h-100">
                <div class="card-body">
                    <h5 class="card-title">Converted</h5>
                    <h2 class="display-6">{data.stats.convertedCount}</h2>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-warning text-dark h-100">
                <div class="card-body">
                    <h5 class="card-title">Pending</h5>
                    <h2 class="display-6">{data.stats.pendingCount}</h2>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-info text-white h-100">
                <div class="card-body">
                    <h5 class="card-title">Conversion Rate</h5>
                    <h2 class="display-6">{data.stats.conversionRate}%</h2>
                </div>
            </div>
        </div>
    </div>

    <!-- Table -->
    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th>Sr. No.</th>
                            <th>Student</th>
                            <th>College ID</th>
                            <th>Provisional ID</th>
                            <th>Prov Date</th>
                            <th>Final ID</th>
                            <th>Final Date</th>
                            <th>Payment Date</th>
                            <th>Merit Rank</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.reportData as row, idx}
                            <tr>
                                <td class="text-muted font-monospace">{idx + 1}</td>
                                <td>
                                    <div class="fw-bold">{row.student_name}</div>
                                    <small class="text-muted">{row.student_email}</small>
                                </td>
                                <td>
                                    {#if row.college_id && row.college_id !== '-'}
                                        <span class="badge bg-light text-dark border font-monospace">{row.college_id}</span>
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                <td><span class="badge bg-secondary">{row.prov_admission_no}</span></td>
                                <td>{new Date(row.prov_date).toLocaleDateString()}</td>
                                <td>
                                    {#if row.final_admission_no !== '-'}
                                        <span class="badge bg-success">{row.final_admission_no}</span>
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                <td>{row.final_date ? new Date(row.final_date).toLocaleDateString() : '-'}</td>
                                <td>{row.payment_date ? new Date(row.payment_date).toLocaleDateString() : '-'}</td>
                                <td>
                                    {#if row.merit_rank !== '-'}
                                        <span class="badge bg-primary rounded-pill">#{row.merit_rank}</span>
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                <td>
                                    {#if row.status === 'Converted'}
                                        <span class="badge bg-success">Converted</span>
                                    {:else}
                                        <span class="badge bg-warning text-dark">Pending</span>
                                    {/if}
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="10" class="text-center py-4 text-muted">No provisional admissions found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
