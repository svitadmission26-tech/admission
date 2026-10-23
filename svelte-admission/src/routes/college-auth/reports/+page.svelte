<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    let searchQuery = data.search; // Local state for input

    function triggerSearch() {
        updateQuery({ search: searchQuery, page: '1' });
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') triggerSearch();
    }

    function handleSort(event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        updateQuery({ sort: value });
    }

    function handleTypeFilter(event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        updateQuery({ type: value, page: '1' });
    }

    function changePage(newPage: number) {
        updateQuery({ page: newPage.toString() });
    }

    function setActiveTab(tab: string) {
        // Reset search and type when switching tabs
        searchQuery = ''; 
        updateQuery({ tab, page: '1', search: '', type: 'all' });
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
    
    $: totalPages = Math.ceil((data.tab === 'admitted' ? data.admittedCount : data.paymentsCount) / data.limit);
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Reports Center</h1>
        <div>
            {#if data.tab === 'admitted' && data.admittedStudents.length > 0}
                <button class="btn btn-outline-primary" on:click={() => exportToCSV('admitted.csv', data.admittedStudents)}>Export CSV</button>
            {:else if data.tab === 'payments' && data.payments.length > 0}
                <button class="btn btn-outline-primary" on:click={() => exportToCSV('payments.csv', data.payments)}>Export CSV</button>
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
                        <input type="text" class="form-control" placeholder="Name, College ID, Receipt..." 
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

                {#if data.tab === 'payments'}
                    <div class="col-md-3">
                        <label class="form-label">Fee Type</label>
                        <select class="form-select" value={data.type} on:change={handleTypeFilter}>
                            <option value="all">All Types</option>
                            <option value="application_fee">Application Fee</option>
                            <option value="tuition_fee">Admission/Tuition Fee</option>
                        </select>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
            <button class="nav-link {data.tab === 'admitted' ? 'active' : ''}" on:click={() => setActiveTab('admitted')}>Admitted Students</button>
        </li>
        <li class="nav-item">
            <button class="nav-link {data.tab === 'payments' ? 'active' : ''}" on:click={() => setActiveTab('payments')}>Fee Reports</button>
        </li>
    </ul>

    <div class="card shadow-sm">
        <div class="card-body">
            {#if data.tab === 'admitted'}
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead><tr><th>Name</th><th>College ID</th><th>Course</th><th>Status</th></tr></thead>
                        <tbody>
                            {#each data.admittedStudents as s}
                                <tr>
                                    <td>{s.student_user?.full_name}</td>
                                    <td>{s.student_user?.student_profiles?.enrollment_number || '-'}</td>
                                    <td>{s.courses?.name}</td>
                                    <td>{s.status}</td>
                                </tr>
                            {:else}
                                <tr><td colspan="4" class="text-center">No records found.</td></tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else if data.tab === 'payments'}
                <div class="alert alert-info mb-3">
                    <strong>Total Collected Fees (Filtered):</strong> ₹{data.totalCollectedFees?.toLocaleString('en-IN') || '0'}
                </div>
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead><tr><th>Date</th><th>Receipt</th><th>Student</th><th>Type</th><th>Amount</th></tr></thead>
                        <tbody>
                            {#each data.payments as p}
                                <tr>
                                    <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                                    <td>{p.receipt_number}</td>
                                    <td>{p.applications?.student_user?.full_name}</td>
                                    <td>
                                        {#if p.payment_type === 'application_fee'}
                                            <span class="badge bg-secondary">Application</span>
                                        {:else}
                                            <span class="badge bg-success">Tuition</span>
                                        {/if}
                                    </td>
                                    <td class="fw-bold">₹{p.amount}</td>
                                </tr>
                            {:else}
                                <tr><td colspan="5" class="text-center">No records found.</td></tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}

            <!-- Pagination -->
            {#if totalPages > 1}
                <div class="d-flex justify-content-center mt-3">
                    <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                    <span class="align-self-center">Page {data.page} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
                </div>
            {/if}
        </div>
    </div>
</div>
