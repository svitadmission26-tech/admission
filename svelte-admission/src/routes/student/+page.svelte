<script lang="ts">
    import type { PageData } from './$types';
    import { page } from '$app/stores';
    import { toastStore } from '$lib/stores/toastStore';
    import { onMount } from 'svelte';

    export let data: PageData;

    onMount(() => {
        if ($page.url.searchParams.get('error') === 'apply_first') {
            toastStore.error('Please submit an admission form before accessing your profile.');
        }
    });

    // Extract all active admission cycle IDs to check against existing applications
    $: activeCycleIds = (data.activeYears || []).flatMap((year: any) => 
        year.admission_cycles?.map((cycle: any) => cycle.id) || []
    );

    // Helper to find if an application already exists for a course in an active cycle
    $: getExistingApplication = (courseId: string) => {
        return (data.applications || []).find((app: any) => 
            app.course_id === courseId && 
            activeCycleIds.includes(app.cycle_id)
        );
    };

    // Derived alerts from applications and documents
    $: applicationAlerts = (data.applications || []).flatMap((app: any) => {
        const alerts = [];
        const appAny = app as any;
        const courseName = appAny.courses?.name || 'Unknown Course';

        if (app.status === 'approved') {
            alerts.push({ type: 'success', message: `Application for ${courseName} has been APPROVED!` });
        } else if (app.status === 'rejected') {
            alerts.push({ type: 'danger', message: `Application for ${courseName} was REJECTED. Reason: ${app.rejection_reason || 'N/A'}` });
        } else if (app.status === 'needs_correction') {
            alerts.push({ type: 'warning', message: `Application for ${courseName} needs correction.` });
        }

        if (app.documents) {
            const rejectedDocs = app.documents.filter((d: any) => d.status === 'rejected');
            rejectedDocs.forEach((d: any) => {
                const doc = d as any;
                alerts.push({ type: 'danger', message: `Document '${doc.document_type}' for ${courseName} was REJECTED. Reason: ${doc.rejection_reason || 'N/A'}` });
            });
        }
        return alerts;
    });

    // Helper to check if a circular is "New" (less than 7 days old)
    const isNew = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return diffDays <= 7;
    };

    function getStatusRowStyle(status: string): string {
        switch (status) {
            case 'draft': return 'background-color: #f8f9fa; border-left: 5px solid #6c757d;'; // Light Grey
            case 'submitted': return 'background-color: #e8f5e9; border-left: 5px solid #198754;'; // Pastel Green
            case 'verified': return 'background-color: #e0f7fa; border-left: 5px solid #0dcaf0;'; // Pastel Cyan
            case 'approved': return 'background-color: #d1e7dd; border-left: 5px solid #198754;'; // Greenish
            case 'rejected': return 'background-color: #f8d7da; border-left: 5px solid #dc3545;'; // Pastel Red
            case 'waitlisted': return 'background-color: #fff3cd; border-left: 5px solid #ffc107;'; // Pastel Yellow
            case 'needs_correction': return 'background-color: #fff3cd; border-left: 5px solid #ffc107;'; // Pastel Yellow
            default: return 'background-color: #ffffff; border-left: 5px solid #dee2e6;'; // Default White
        }
    }

    // Helper to get payment fee status badge
    function getPaymentStatusBadge(status: string) {
        switch (status?.toLowerCase()) {
            case 'paid':
            case 'completed':
                return { class: 'bg-success', icon: 'bi-check-circle-fill', text: 'Paid' };
            case 'pending':
            case 'initiated':
                return { class: 'bg-warning text-dark', icon: 'bi-hourglass-split', text: 'Pending' };
            case 'submitted':
                return { class: 'bg-info', icon: 'bi-check2-square', text: 'Submitted' };
            case 'processing':
                return { class: 'bg-primary', icon: 'bi-arrow-repeat', text: 'Processing' };
            case 'failed':
            case 'rejected':
                return { class: 'bg-danger', icon: 'bi-x-circle-fill', text: 'Failed' };
            case 'cancelled':
                return { class: 'bg-secondary', icon: 'bi-stop-circle-fill', text: 'Cancelled' };
            case 'not_applicable':
                return { class: 'bg-light text-dark border', icon: 'bi-dash-circle', text: 'N/A' };
            default:
                return { class: 'bg-secondary', icon: 'bi-question-circle', text: status || 'Unknown' };
        }
    }

    // Hardcoded merit timings based on rank
    function getMeritTiming(rank: number) {
        if (!rank) return null;
        if (rank >= 1 && rank <= 50) return { date: '26/06/2026', time: '11:00 AM to 12:00 PM' };
        if (rank >= 51 && rank <= 100) return { date: '26/06/2026', time: '12:00 PM to 01:00 PM' };
        if (rank >= 101 && rank <= 150) return { date: '26/06/2026', time: '02:00 PM to 04:00 PM' };
        if (rank >= 151 && rank <= 200) return { date: '27/06/2026', time: '11:00 AM to 12:00 PM' };
        if (rank >= 201) return { date: '27/06/2026', time: '01:00 PM to 04:00 PM' };
        return null;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Student Dashboard</h1>

    {#if applicationAlerts.length > 0}
        <div class="row mb-4">
            <div class="col-12">
                {#each applicationAlerts as alert}
                    <div class="alert alert-{alert.type} alert-dismissible fade show" role="alert">
                        {alert.message}
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Notices & Circulars Section -->
    {#if data.circulars && data.circulars.length > 0}
    <div class="row mb-4">
        <div class="col-12">
            <div class="card shadow-sm border-info">
                <div class="card-header bg-info text-white d-flex align-items-center">
                    <i class="bi bi-megaphone-fill me-2"></i>
                    <h5 class="mb-0">Notices & Circulars</h5>
                </div>
                <div class="card-body p-0">
                    <div class="list-group list-group-flush">
                        {#each data.circulars as circular}
                            <div class="list-group-item">
                                <div class="d-flex w-100 justify-content-between align-items-center">
                                    <div class="flex-grow-1">
                                        <div class="d-flex align-items-center gap-2 mb-1">
                                            <h6 class="mb-0 fw-bold">{circular.title}</h6>
                                            {#if isNew(circular.created_at)}
                                                <span class="badge bg-danger rounded-pill" style="font-size: 0.65rem;">NEW</span>
                                            {/if}
                                            {#if circular.courses}
                                                {@const courseAny = circular.courses as any}
                                                <span class="badge bg-secondary" style="font-size: 0.65rem;">{courseAny.name}</span>
                                            {/if}
                                        </div>
                                        {#if circular.description}
                                            <p class="mb-1 text-muted small">{circular.description}</p>
                                        {/if}
                                        <small class="text-muted" style="font-size: 0.75rem;">
                                            <i class="bi bi-calendar3 me-1"></i>{new Date(circular.created_at).toLocaleDateString()}
                                        </small>
                                    </div>
                                    {#if circular.signedUrl}
                                        <a href={circular.signedUrl} target="_blank" class="btn btn-sm btn-outline-primary ms-3">
                                            <i class="bi bi-download me-1"></i> Download
                                        </a>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>
    {/if}

    <div class="row">
        <!-- Moved Available Courses to top -->
        <div class="col-md-6 mb-4">
            <div class="card shadow-sm h-100">
                <div class="card-header bg-secondary text-white">
                    <h4 class="mb-0"><i class="bi bi-journal-bookmark-fill me-2"></i>Available Courses</h4>
                </div>
                <div class="card-body">
                    {#if data.availableCourses && data.availableCourses.length > 0}
                        <div class="list-group">
                            {#each data.availableCourses as course}
                                {@const courseAny = course as any}
                                {@const existingApp = getExistingApplication(course.id)}
                                <div class="list-group-item list-group-item-action flex-column align-items-start my-1">
                                    <div class="d-flex w-100 justify-content-between align-items-center">
                                        <div>
                                            <h5 class="mb-1">{course.name} <span class="badge bg-light text-dark border ms-2">{course.code}</span></h5>
                                            <small class="text-muted"><i class="bi bi-building me-1"></i>{courseAny.colleges?.name}, {courseAny.colleges?.universities?.name}</small>
                                        </div>
                                        <div class="ms-2 d-flex gap-2">
                                            {#if existingApp}
                                                <a href="/student/apply?applicationId={existingApp.id}" class="btn btn-sm btn-outline-secondary">View Existing</a>
                                            {/if}
                                            <a href="/student/apply?courseId={course.id}" class="btn btn-sm btn-primary">Apply</a>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="text-center py-4">
                            <i class="bi bi-emoji-frown fs-1 text-muted"></i>
                            <p class="mt-2 text-muted">No courses are currently open for application.</p>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <div class="col-md-6 mb-4">
            <div class="card shadow-sm h-100">
                <div class="card-header bg-secondary text-white">
                    <h4 class="mb-0"><i class="bi bi-file-earmark-text-fill me-2"></i>My Applications</h4>
                </div>
                <div class="card-body">
                    {#if data.applications && data.applications.length > 0}
                        <div class="list-group list-group-flush">
                            {#each data.applications as app}
                                {@const appAny = app as any}
                                {@const pendingDocs = app.documents?.filter((d: any) => d.status === 'pending').length || 0}
                                {@const approvedDocs = app.documents?.filter((d: any) => d.status === 'approved').length || 0}
                                {@const rejectedDocs = app.documents?.filter((d: any) => d.status === 'rejected').length || 0}
                                {@const feeStatusBadge = getPaymentStatusBadge(app.application_fee_status)}
                                <div class="list-group-item d-flex justify-content-between align-items-start mb-2 shadow-sm" style="{getStatusRowStyle(app.status)}">
                                    <div style="flex: 1;">
                                        <strong>{appAny.courses?.name}</strong>
                                        {#if appAny.branches?.name} <span class="badge bg-secondary ms-1">{appAny.branches.name}</span> {/if}
                                        <span class="badge bg-light text-dark border ms-1">{app.form_type || 'N/A'}</span>
                                        <br/>
                                        <small class="text-muted">{appAny.admission_cycles?.name} ({appAny.admission_cycles?.academic_years?.name})</small>
                                        <br />
                                        <small class="fw-bold">Application Status: 
                                            <span class="badge {app.status === 'approved' ? 'bg-success' : app.status === 'rejected' ? 'bg-danger' : app.status === 'submitted' ? 'bg-info' : 'bg-warning'}">
                                                {app.status.toUpperCase()}
                                            </span>
                                        </small>
                                        
                                        <!-- Payment Fee Status Badge -->
                                        {#if app.application_fee_status}
                                            <br />
                                            <small class="fw-bold mt-2 d-inline-block">Application Fee: 
                                                <span class="badge {feeStatusBadge.class} d-inline-flex align-items-center gap-1" style="font-size: 0.75rem; padding: 0.3rem 0.5rem; margin-top: 0.2rem;">
                                                    <i class="bi {feeStatusBadge.icon}"></i>
                                                    {feeStatusBadge.text}
                                                </span>
                                            </small>
                                        {/if}
                                        
                                        <!-- Merit Status (Prominent) -->
                                        {#if app.is_merit_published && app.merit_rank && (['verified', 'approved', 'waitlisted'].includes(app.status) || (app.status === 'submitted' && app.application_fee_status === 'paid'))}
                                            {@const timing = getMeritTiming(app.merit_rank)}
                                            <div class="alert alert-primary mt-2 mb-0 p-2 shadow-sm border-primary">
                                                <div class="d-flex align-items-center justify-content-between">
                                                    <div>
                                                        <h5 class="mb-0 text-primary fw-bold">
                                                            <i class="bi bi-trophy-fill me-1"></i>Merit Rank: #{app.merit_rank}
                                                        </h5>
                                                        {#if timing}
                                                            <div class="mt-1 small">
                                                                <i class="bi bi-calendar-check me-1"></i> <strong>Counseling Schedule:</strong> {timing.date} | {timing.time}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                    {#if app.status === 'waitlisted'}
                                                        <span class="badge bg-warning text-dark border border-dark">Waitlisted</span>
                                                    {/if}
                                                </div>
                                            </div>
                                        {:else if (['verified', 'approved'].includes(app.status) || (app.status === 'submitted' && app.application_fee_status === 'paid')) && !app.is_merit_published}
                                            <div class="mt-2 p-2 bg-light border rounded text-muted small">
                                                <i class="bi bi-clock-history me-1"></i> Merit List Pending Publication
                                            </div>
                                        {/if}

                                        <div class="mt-2">
                                            <span class="badge bg-secondary">
                                                <i class="bi bi-file-earmark me-1"></i>
                                                Docs: {approvedDocs} <span class="text-success">✓</span>, {pendingDocs} <span class="text-warning">⏳</span>, {rejectedDocs} <span class="text-danger">✗</span>
                                            </span>
                                        </div>
                                    </div>
                                    <div style="margin-left: 1rem;">
                                        <a href="/student/apply?applicationId={app.id}" class="btn btn-sm btn-outline-primary">
                                            <i class="bi bi-pencil-square me-1"></i>View/Edit
                                        </a>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="text-center py-4">
                            <p class="card-text text-muted mb-3">You have not submitted any applications yet.</p>
                            <a href="#available-courses" class="btn btn-outline-primary">Browse Courses</a>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5); /* Dim the background */
    }

    .badge {
        font-weight: 500;
        letter-spacing: 0.3px;
        transition: all 0.2s ease;
    }

    .badge i {
        font-size: 0.85em;
    }

    .list-group-item {
        border-radius: 0.5rem;
        transition: all 0.3s ease;
    }

    .list-group-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
    }

    .card {
        border: 1px solid #dee2e6;
        transition: all 0.3s ease;
    }

    .card:hover {
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    .card-header {
        background-color: #f8f9fa;
        border-bottom: 2px solid #dee2e6;
        font-weight: 600;
    }

    .btn-sm {
        font-size: 0.8rem;
        padding: 0.4rem 0.6rem;
        transition: all 0.2s ease;
    }

    .btn-sm:hover {
        transform: translateY(-1px);
    }

    .alert {
        border-radius: 0.5rem;
        border-left: 4px solid currentColor;
    }
</style>
