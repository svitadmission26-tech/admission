<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    function changePage(newPage: number) {
        const url = new URL($page.url);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    function handleFilterChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        const url = new URL($page.url);
        if (target.value === 'all') {
            url.searchParams.delete('form_type');
        } else {
            url.searchParams.set('form_type', target.value);
        }
        url.searchParams.set('page', '1'); // Reset to page 1 on filter change
        goto(url.toString());
    }

    $: totalPages = Math.ceil((data.incompleteCount || 0) / (data.limit || 10));
</script>

<div class="container-fluid">
    <h1 class="mb-4">DEO Dashboard</h1>

    <div class="row mb-4">
        <div class="col-md-4">
            <div class="card text-white bg-secondary mb-3">
                <div class="card-header">Draft Applications</div>
                <div class="card-body">
                    <h5 class="card-title">{data.stats.draft}</h5>
                    <p class="card-text">Incomplete applications.</p>
                </div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="card text-white bg-primary mb-3">
                <div class="card-header">Submitted Applications</div>
                <div class="card-body">
                    <h5 class="card-title">{data.stats.submitted}</h5>
                    <p class="card-text">Waiting for verification.</p>
                </div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="card text-white bg-success mb-3">
                <div class="card-header">Verified Applications</div>
                <div class="card-body">
                    <h5 class="card-title">{data.stats.verified}</h5>
                    <p class="card-text">Processed applications.</p>
                </div>
            </div>
        </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-3">
            <h3 class="mb-0">Recent Activity</h3>
            <div class="d-flex align-items-center gap-2">
                <label for="formTypeFilter" class="form-label mb-0 small text-muted">Filter Type:</label>
                <select 
                    id="formTypeFilter" 
                    class="form-select form-select-sm w-auto" 
                    value={data.selectedFormType} 
                    on:change={handleFilterChange}
                >
                    <option value="all">All Form Types</option>
                    {#each data.formTypes as ft}
                        <option value={ft.name}>{ft.name}</option>
                    {/each}
                </select>
            </div>
        </div>
        <a href="/deo/apply" class="btn btn-primary">Create New Application</a>
    </div>

    <div class="card mb-4">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Course / Type / Branch</th>
                            <th>Cycle</th>
                            <th>Status</th>
                            <th>Last Updated</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.recentApplications as app}
                            {@const appAny = app as any}
                            {@const completedPayment = appAny.payments?.find((p: any) => p.status === 'completed')}
                            <tr>
                                <td>
                                    {appAny.users?.full_name || 'N/A'}<br>
                                    <small class="text-muted">{appAny.users?.email}</small>
                                </td>
                                <td>
                                    {appAny.courses?.name}
                                    {#if appAny.branches?.name}
                                        <br><small class="text-muted"><i class="bi bi-diagram-3"></i> {appAny.branches.name}</small>
                                    {/if}
                                    <br>
                                    <span class="badge bg-info text-dark mt-1">{appAny.form_type}</span>
                                </td>
                                <td>{appAny.admission_cycles?.name}</td>
                                <td>
                                    <span class="badge {appAny.status === 'approved' ? 'bg-success' : appAny.status === 'submitted' ? 'bg-primary' : 'bg-secondary'}">
                                        {appAny.status}
                                    </span>
                                </td>
                                <td>{new Date(appAny.updated_at).toLocaleDateString()}</td>
                                <td>
                                    {#if completedPayment}
                                        <button class="btn btn-sm btn-success me-1" on:click={() => window.open(`/receipts/print?payment_id=${completedPayment.id}`, '_blank')}>
                                            <i class="bi bi-printer"></i> Receipt
                                        </button>
                                    {/if}
                                    <a href="/deo/apply?applicationId={appAny.id}" class="btn btn-sm btn-outline-primary">
                                        View
                                    </a>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="6" class="text-center text-muted">No recent activity found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Incomplete Forms Section -->
    <div class="card mb-4 border-warning">
        <div class="card-header bg-warning text-dark">
            <h5 class="mb-0"><i class="bi bi-hourglass-split"></i> Incomplete Forms (Drafts)</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Course / Type / Branch</th>
                            <th>Status</th>
                            <th>Last Saved</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.incompleteApplications as app}
                            {@const appAny = app as any}
                            <tr>
                                <td>
                                    {appAny.users?.full_name || 'N/A'} <br>
                                    <small class="text-muted">{appAny.users?.email}</small>
                                </td>
                                <td>
                                    {appAny.courses?.name}
                                    {#if appAny.branches?.name}
                                        <br><small class="text-muted"><i class="bi bi-diagram-3"></i> {appAny.branches.name}</small>
                                    {/if}
                                    <br>
                                    <span class="badge bg-info text-dark mt-1">{appAny.form_type}</span>
                                </td>
                                <td><span class="badge bg-secondary">{appAny.status}</span></td>
                                <td>{new Date(appAny.updated_at).toLocaleDateString()}</td>
                                <td>
                                    <a href="/deo/apply?applicationId={appAny.id}" class="btn btn-sm btn-primary">
                                        Continue <i class="bi bi-arrow-right"></i>
                                    </a>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="5" class="text-center text-muted p-3">No incomplete drafts found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if totalPages > 1}
                <div class="card-footer d-flex justify-content-center">
                    <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                    <span class="align-self-center">Page {data.page} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
                </div>
            {/if}
        </div>
    </div>
</div>