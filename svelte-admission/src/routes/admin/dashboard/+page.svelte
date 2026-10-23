<script lang="ts">
    import type { PageData } from './$types';
    import { NAVIGATION_CONFIG } from '$lib/config/navigation';

    export let data: PageData;

    const adminNav = NAVIGATION_CONFIG.admin;
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3 mb-0 text-dark">Admin Control Panel</h1>
    </div>

    <div class="row g-4">
        <!-- Welcome Card -->
        <div class="col-12">
            <div class="card border-0 shadow-sm bg-primary text-white p-4 welcome-banner">
                <div class="d-flex align-items-center">
                    <div class="me-4 d-none d-md-block">
                        <i class="bi bi-shield-check display-1 opacity-50"></i>
                    </div>
                    <div>
                        <h2 class="fw-bold mb-2">Welcome, {data.user?.full_name || data.user?.email}!</h2>
                        <p class="lead mb-0">You are logged in as a System Administrator. Use the tabs above or the cards below to manage the application.</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Quick Access Grid -->
        <div class="col-12 mt-5">
            <h4 class="mb-4 text-dark fw-bold">Quick Management Access</h4>
            <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 row-cols-xl-4 g-4">
                {#each adminNav.items as item}
                    {#if item.href !== '/admin/dashboard'}
                        <div class="col">
                            <a href={item.href} class="text-decoration-none">
                                <div class="card h-100 shadow-sm hover-card border-0 border-top border-primary border-4">
                                    <div class="card-body">
                                        <div class="d-flex align-items-center mb-3">
                                            <div class="bg-primary bg-opacity-10 p-3 rounded-circle me-3">
                                                <i class="bi {item.icon} fs-3 text-primary"></i>
                                            </div>
                                            <h5 class="card-title text-dark mb-0">{item.title}</h5>
                                        </div>
                                        <p class="text-muted small mb-0">Manage and configure {item.title.toLowerCase()} settings.</p>
                                    </div>
                                </div>
                            </a>
                        </div>
                    {/if}
                {/each}
            </div>
        </div>
    </div>
</div>

<style>
    .hover-card {
        transition: all 0.3s ease;
    }
    .hover-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(0,0,0,0.1) !important;
        background-color: #f8f9fa;
    }

    .welcome-banner {
        background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%);
    }
</style>
