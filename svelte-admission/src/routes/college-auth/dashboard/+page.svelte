<script lang="ts">
    import type { PageData } from './$types';

    export let data: PageData;

    // Default stats if data is missing
    const stats = data.stats || {
        total: 0,
        pending: 0, // treating 'submitted' as pending action
        submitted: 0,
        verified: 0,
        approved: 0,
        rejected: 0,
        needs_correction: 0
    };

    // Aggregate pending
    const pendingAction = stats.submitted + stats.needs_correction; 

    // Client-side pagination for Seat Matrix
    let currentPage = 1;
    let pageSize = 20;
    
    // Flattened list is already in data.seatMatrix
    $: totalPages = Math.ceil((data.seatMatrix?.length || 0) / pageSize);
    $: paginatedSeatMatrix = data.seatMatrix ? data.seatMatrix.slice((currentPage - 1) * pageSize, currentPage * pageSize) : [];
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="mb-0">College Dashboard</h1>
        <span class="text-muted">Welcome back!</span>
    </div>

    {#if data.error}
        <div class="alert alert-danger">{data.error}</div>
    {:else}
        <!-- Statistics Cards -->
        <div class="row g-4 mb-5">
            <div class="col-md-3">
                <div class="card shadow-sm border-primary h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Total Applications</h6>
                        <h2 class="card-title text-primary display-4 fw-bold">{stats.total}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card shadow-sm border-warning h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Pending Action</h6>
                        <h2 class="card-title text-warning display-4 fw-bold">{pendingAction}</h2>
                        <small class="text-muted">Submitted: {stats.submitted} | Correction: {stats.needs_correction}</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card shadow-sm border-info h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Verified & Forwarded</h6>
                        <h2 class="card-title text-info display-4 fw-bold">{stats.verified}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card shadow-sm border-success h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Admitted (Approved)</h6>
                        <h2 class="card-title text-success display-4 fw-bold">{stats.approved}</h2>
                    </div>
                </div>
            </div>
        </div>

        <!-- Seat Matrix & Utilization -->
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                <h5 class="mb-0"><i class="bi bi-grid-3x3-gap me-2"></i>Seat Matrix & Utilization</h5>
                <a href="/college-auth/applications" class="btn btn-sm btn-outline-primary">View Applications</a>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Course</th>
                                <th>Branch / Specialization</th>
                                <th class="text-center">Intake Capacity</th>
                                <th class="text-center">Admitted</th>
                                <th class="text-center">Vacancy</th>
                                <th style="width: 30%;">Utilization</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if paginatedSeatMatrix.length > 0}
                                {#each paginatedSeatMatrix as row}
                                    <tr>
                                        <td class="fw-bold">{row.courseName}</td>
                                        <td>
                                            {#if row.name !== '-'}
                                                {row.name}
                                            {:else}
                                                <span class="text-muted fst-italic">General / No Branch</span>
                                            {/if}
                                        </td>
                                        <td class="text-center">{row.capacity}</td>
                                        <td class="text-center fw-bold text-success">{row.admitted}</td>
                                        <td class="text-center {row.vacancy === 0 ? 'text-danger fw-bold' : ''}">
                                            {row.vacancy}
                                        </td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="progress flex-grow-1" style="height: 10px;">
                                                    <div class="progress-bar {row.utilization >= 100 ? 'bg-danger' : row.utilization > 80 ? 'bg-warning' : 'bg-success'}" 
                                                         role="progressbar" 
                                                         style="width: {row.utilization}%" 
                                                         aria-valuenow={row.utilization} 
                                                         aria-valuemin="0" 
                                                         aria-valuemax="100">
                                                    </div>
                                                </div>
                                                <span class="ms-2 small fw-bold">{row.utilization.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            {:else}
                                <tr>
                                    <td colspan="6" class="text-center py-4 text-muted">
                                        No courses or branches found. Please contact Admin to configure Intake Capacity.
                                    </td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>
            </div>
            <!-- Pagination Controls -->
            {#if totalPages > 1}
                <div class="card-footer d-flex justify-content-center">
                    <button class="btn btn-sm btn-secondary me-2" disabled={currentPage <= 1} on:click={() => currentPage--}>Prev</button>
                    <span class="align-self-center">Page {currentPage} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={currentPage >= totalPages} on:click={() => currentPage++}>Next</button>
                </div>
            {/if}
        </div>
    {/if}
</div>
