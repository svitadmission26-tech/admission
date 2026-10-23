<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    let searchQuery = data.search; // Local state

    function triggerSearch() {
        updateQuery({ search: searchQuery, page: '1' });
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') triggerSearch();
    }

    function changePage(newPage: number) {
        updateQuery({ page: newPage.toString() });
    }

    function handleSort(event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        updateQuery({ sort: value });
    }

    function handleTypeFilter(event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        updateQuery({ type: value, page: '1' });
    }

    function updateQuery(updates: Record<string, string>) {
        const params = new URLSearchParams($page.url.searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        goto(`?${params.toString()}`);
    }

    function exportToCSV(filename: string, rows: any[]) {
        if (!rows || rows.length === 0) return;
        const headers = Object.keys(rows[0]);
        const csvContent = [headers.join(','), ...rows.map(row => headers.map(f => `"${row[f] || ''}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
    }

    // Derived helpers
    $: totalPages = Math.ceil(data.paymentsCount / data.limit);
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>University Reports</h1>
        <div>
            {#if data.payments.length > 0}
                <button class="btn btn-outline-primary" on:click={() => exportToCSV('univ_payments.csv', data.payments)}>Export CSV</button>
            {/if}
        </div>
    </div>

    <!-- Controls -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="row g-3 align-items-end">
                <div class="col-md-5">
                    <label class="form-label">Search</label>
                    <div class="input-group">
                        <input type="text" class="form-control" placeholder="Receipt, Transaction ID..." 
                               bind:value={searchQuery} on:keydown={handleKeydown}>
                        <button class="btn btn-primary" on:click={triggerSearch}>
                            <i class="bi bi-search"></i>
                        </button>
                    </div>
                </div>
                
                <div class="col-md-3">
                    <label class="form-label">Sort By</label>
                    <select class="form-select" value={data.sort} on:change={handleSort}>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>

                <div class="col-md-3">
                    <label class="form-label">Fee Type</label>
                    <select class="form-select" value={data.type} on:change={handleTypeFilter}>
                        <option value="all">All Types</option>
                        <option value="application_fee">Application Fee</option>
                        <option value="tuition_fee">Admission/Tuition Fee</option>
                    </select>
                </div>
            </div>
        </div>
    </div>

    <div class="card shadow-sm">
        <div class="card-body">
            <div class="alert alert-info mb-3">
                <strong>Total Collected Fees (Filtered):</strong> ₹{data.totalCollectedFees?.toLocaleString('en-IN') || '0'}
            </div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Date</th><th>Receipt</th><th>Name</th><th>College ID</th><th>Type</th><th>Amount</th><th>Actions</th></tr></thead>
                    <tbody>
                        {#each data.payments as p}
                            <tr>
                                <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                                <td>{p.receipt_number}</td>
                                <td>{p.applications?.student_user?.full_name}</td>
                                <td>{p.applications?.student_user?.student_profiles?.enrollment_number || 'N/A'}</td>
                                <td>
                                    {#if p.payment_type === 'application_fee'}
                                        <span class="badge bg-secondary">Application</span>
                                    {:else}
                                        <span class="badge bg-success">Tuition</span>
                                    {/if}
                                </td>
                                <td>{p.amount}</td>
                                <td>
                                    <a href="/receipts/print?payment_id={p.id}" target="_blank" 
                                       class="btn btn-sm btn-outline-primary" 
                                       class:disabled={p.status !== 'completed'}>
                                        <i class="bi bi-printer"></i> Print
                                    </a>
                                </td>
                            </tr>
                        {:else}
                            <tr><td colspan="7" class="text-center">No records.</td></tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if totalPages > 1}
                <div class="d-flex justify-content-center mt-3">
                    <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                    <span>Page {data.page} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
                </div>
            {/if}
        </div>
    </div>
</div>
