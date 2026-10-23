
<script lang="ts">
    import type { PageData } from './$types';
    export let data: PageData;
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Saved Reports</h1>
        <a href="/adm-officer/reports" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left"></i> Custom Query
        </a>
    </div>

    <div class="row">
        {#each data.templates as template}
            <div class="col-md-4 mb-4">
                <div class="card h-100 shadow-sm hover-shadow transition">
                    <div class="card-body">
                        <h5 class="card-title text-primary">{template.name}</h5>
                        {#if template.description}
                            <p class="card-text text-muted small">{template.description}</p>
                        {/if}
                        <hr>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="badge bg-light text-dark border">
                                Base: {template.base_table}
                            </span>
                            <a href="/adm-officer/saved-reports/{template.id}" class="btn btn-primary btn-sm">
                                <i class="bi bi-play-fill me-1"></i> Run Report
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <div class="col-12 text-center py-5 text-muted">
                <h4>No Report Templates Available</h4>
                <p>Contact your administrator to create standardized reports for you.</p>
            </div>
        {/each}
    </div>
</div>

<style>
    .hover-shadow:hover {
        box-shadow: 0 .5rem 1rem rgba(0,0,0,.15)!important;
    }
    .transition {
        transition: box-shadow 0.3s ease-in-out;
    }
</style>
