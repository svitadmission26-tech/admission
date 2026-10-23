<script lang="ts">
    import type { PageData } from './$types';
    import CrystalAnimation from '$lib/components/CrystalAnimation.svelte';

    let { data }: { data: PageData } = $props();
</script>

<div class="landing-page">
    <CrystalAnimation />
    <div class="content container py-5">
        <div class="row align-items-center g-5">
            <!-- Welcome Section -->
            <div class="col-12 text-center">
                <div class="p-4 p-md-5 mb-4 rounded-4 shadow-lg welcome-card">
                    <h1 class="display-4 fw-bold text-dark mb-3">SVIT Admission Portal</h1>
                    <p class="fs-5 text-dark mb-4">Your journey to academic excellence begins here. Join our community of scholars and innovators.</p>
                    <div class="d-flex flex-wrap justify-content-center gap-3 mt-4">
                        <a href="/login" class="btn btn-primary btn-lg px-5 shadow-sm fw-bold">
                            <i class="bi bi-box-arrow-in-right me-2"></i> Login to Dashboard
                        </a>
                    </div>

                    <!-- Student Instructions -->
                    <div class="mt-5 p-4 border rounded-3 bg-light bg-opacity-50 text-start">
                        <h5 class="fw-bold text-dark mb-3"><i class="bi bi-info-circle-fill text-primary me-2"></i>How to Proceed?</h5>
                        <ul class="list-unstyled text-dark mb-0">
                            <li class="mb-2"><i class="bi bi-google me-2 text-primary"></i>Log in using your <strong>Gmail account</strong> (Google Login).</li>
                            <li class="mb-2"><i class="bi bi-headset me-2 text-primary"></i>New students should contact the <strong>Admission Office</strong> for credentials.</li>
                            <li class="mt-4 pt-3 border-top">
                                <div class="d-flex align-items-center gap-3">
                                    <div>
                                        <small class="text-muted d-block">Admission Helpdesk</small>
                                        <span class="fw-bold"><i class="bi bi-telephone-fill me-1"></i> +91 95107 82983/84</span>
                                    </div>
                                    <div class="ms-auto">
                                        <small class="text-muted d-block">Support Email</small>
                                        <a href="mailto:admission@svitvasad.ac.in" class="text-decoration-none fw-bold">admission@svitvasad.ac.in</a>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <!-- Latest Circulars & Notices Section -->
                    {#if data.publicCirculars && data.publicCirculars.length > 0}
                        <div class="mt-5 text-start">
                            <h5 class="fw-bold text-dark mb-4">
                                <i class="bi bi-megaphone-fill text-danger me-2"></i>Latest Circulars & Notices
                            </h5>
                            <div class="list-group shadow-sm">
                                {#each data.publicCirculars as circular}
                                    <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3">
                                        <div class="me-3">
                                            <div class="fw-bold text-dark">{circular.title}</div>
                                            {#if circular.description}
                                                <small class="text-muted d-block">{circular.description}</small>
                                            {/if}
                                            <small class="text-muted"><i class="bi bi-calendar3 me-1"></i>{new Date(circular.created_at).toLocaleDateString()}</small>
                                        </div>
                                        {#if circular.signedUrl}
                                            <a href={circular.signedUrl} target="_blank" class="btn btn-outline-primary btn-sm rounded-pill px-3">
                                                <i class="bi bi-file-earmark-arrow-down me-1"></i>Download
                                            </a>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    .landing-page {
        background-color: #1e2b4a;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        min-height: calc(100vh - 60px);
        position: relative;
        display: flex;
        align-items: center;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        z-index: 1;
    }

    .content {
        position: relative;
        z-index: 2;
    }

    .welcome-card {
        background: #ffffff !important;
        backdrop-filter: none;
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
    }
</style>