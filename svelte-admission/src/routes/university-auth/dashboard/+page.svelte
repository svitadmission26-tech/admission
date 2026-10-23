<script lang="ts">
    import type { PageData } from './$types';
    import { onMount, onDestroy } from 'svelte';

    let { data }: { data: PageData } = $props();

    // Filters
    let selectedCollegeId = $state('');
    let showCapacity = $state(true);
    let isInitialized = $state(false);

    // Initialize selection once data is available
    onMount(() => {
        if (data.collegeStats && data.collegeStats.length > 0) {
            selectedCollegeId = (data.collegeStats[0] as any).id;
        }
        isInitialized = true;
    });
    
    // Derived Data for Selected College
    let selectedCollege = $derived(data.collegeStats?.find(c => (c as any).id === selectedCollegeId));
    let courseStats = $derived(data.collegeCourseStats?.find(c => (c as any).collegeId === selectedCollegeId));
    let branchStats = $derived(data.collegeBranchStats?.find(c => (c as any).collegeId === selectedCollegeId));

    // Client-side pagination for the table
    let currentCollegePage = $state(1);
    let pageSize = 10;

    let totalPages = $derived(Math.ceil((data.collegeStats?.length || 0) / pageSize));
    let paginatedColleges = $derived(
        data.collegeStats ? data.collegeStats.slice((currentCollegePage - 1) * pageSize, currentCollegePage * pageSize) : []
    );

    // Chart logic
    let Chart: any;
    let chartInstances: any[] = [];

    // Custom Plugin to draw values above bars
    const dataLabelPlugin = {
        id: 'dataLabel',
        afterDatasetsDraw(chart: any) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            chart.data.datasets.forEach((dataset: any, i: number) => {
                const meta = chart.getDatasetMeta(i);
                meta.data.forEach((bar: any, index: number) => {
                    const data = dataset.data[index];
                    if (data > 0) {
                        ctx.fillText(data.toString(), bar.x, bar.y - 5);
                    }
                });
            });
            ctx.restore();
        }
    };

    async function initCharts() {
        if (!isInitialized) return;
        
        // Cleanup old charts
        chartInstances.forEach(c => c.destroy());
        chartInstances = [];

        if (!Chart) {
            const chartModule = await import('chart.js');
            Chart = chartModule.Chart;
            Chart.register(
                chartModule.BarController, 
                chartModule.PieController, 
                chartModule.BarElement, 
                chartModule.ArcElement, 
                chartModule.CategoryScale, 
                chartModule.LinearScale, 
                chartModule.Tooltip, 
                chartModule.Legend,
                dataLabelPlugin
            );
        }

        // 1. Course-wise Bar Chart for Selected College
        if (courseStats?.courses.length) {
            const canvas = document.getElementById('course-admission-chart') as HTMLCanvasElement;
            if (canvas) {
                const existingChart = Chart.getChart(canvas);
                if (existingChart) {
                    existingChart.destroy();
                }
                const chart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: courseStats.courses.map(c => c.name),
                        datasets: [
                            ...(showCapacity ? [{ 
                                label: 'Capacity', 
                                data: courseStats.courses.map(c => c.capacity), 
                                backgroundColor: '#4361ee', 
                                barPercentage: 1.0, 
                                categoryPercentage: 0.8 
                            }] : []),
                            { 
                                label: 'Admitted', 
                                data: courseStats.courses.map(c => c.admitted), 
                                backgroundColor: '#f72585', 
                                barPercentage: showCapacity ? 1.0 : 0.6, 
                                categoryPercentage: 0.8 
                            }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        layout: { padding: { top: 20 } },
                        plugins: { legend: { position: 'bottom' } },
                        scales: { 
                            y: { beginAtZero: true, grace: '10%', grid: { color: 'rgba(0,0,0,0.05)' } },
                            x: { grid: { display: false } }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        }

        // 2. Branch-wise Charts (Multiple, per Course)
        branchStats?.courses.forEach((course, idx) => {
            const canvasId = `branch-chart-${idx}`;
            const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
            if (canvas) {
                const existingChart = Chart.getChart(canvas);
                if (existingChart) {
                    existingChart.destroy();
                }
                const chart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: course.branches.map(b => b.name),
                        datasets: [
                            ...(showCapacity ? [{ 
                                label: 'Capacity', 
                                data: course.branches.map(b => b.capacity), 
                                backgroundColor: '#3a0ca3', 
                                barPercentage: 1.0, 
                                categoryPercentage: 0.8 
                            }] : []),
                            { 
                                label: 'Admitted', 
                                data: course.branches.map(b => b.admitted), 
                                backgroundColor: '#4cc9f0', 
                                barPercentage: showCapacity ? 1.0 : 0.6, 
                                categoryPercentage: 0.8 
                            }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        layout: { padding: { top: 20 } },
                        plugins: { 
                            legend: { position: 'bottom' },
                            title: { display: true, text: `Branches: ${course.courseName}`, padding: 10, font: { size: 14, weight: 'bold' } }
                        },
                        scales: { 
                            y: { beginAtZero: true, grace: '10%', grid: { color: 'rgba(0,0,0,0.05)' } },
                            x: { grid: { display: false } }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        });

        // 3. Global Pie Charts (Admitted by College)
        const pieCanvas = document.getElementById('pie-college-global') as HTMLCanvasElement;
        if (pieCanvas && data.admittedByCollegePie?.length) {
            const existingChart = Chart.getChart(pieCanvas);
            if (existingChart) {
                existingChart.destroy();
            }
            const chart = new Chart(pieCanvas, {
                type: 'pie',
                data: {
                    labels: data.admittedByCollegePie.map(d => d.name),
                    datasets: [{ 
                        data: data.admittedByCollegePie.map(d => d.value), 
                        backgroundColor: ['#4361ee', '#f72585', '#4cc9f0', '#7209b7', '#ffbe0b', '#fb5607', '#ff006e'],
                        borderWidth: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
            chartInstances.push(chart);
        }
    }

    $effect(() => {
        if (isInitialized && selectedCollegeId) {
            initCharts();
        }
    });

    // Handle capacity toggle change
    $effect(() => {
        if (isInitialized && (showCapacity !== undefined)) {
            initCharts();
        }
    });

    onDestroy(() => {
        chartInstances.forEach(chart => chart.destroy());
    });
</script>

<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800">University Analytics Dashboard</h1>
            <p class="text-muted mb-0">Admission & Intake Monitoring</p>
        </div>
        <div class="d-flex gap-3 align-items-center">
            <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="showCapacityToggle" bind:checked={showCapacity}>
                <label class="form-check-label small fw-bold" for="showCapacityToggle">Show Capacity Bars</label>
            </div>
            <select class="form-select" bind:value={selectedCollegeId} style="min-width: 250px;">
                {#each data.collegeStats || [] as college}
                    <option value={college.id}>{college.name}</option>
                {/each}
            </select>
        </div>
    </div>

    {#if data.error}
        <div class="alert alert-danger">{data.error}</div>
    {:else}
        <!-- Top Stats Row -->
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="card border-0 shadow-sm bg-primary text-white h-100">
                    <div class="card-body">
                        <div class="small text-white-50 text-uppercase fw-bold">Total Applications</div>
                        <div class="h2 fw-bold mb-0">{data.stats?.total || 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-0 shadow-sm bg-success text-white h-100">
                    <div class="card-body">
                        <div class="small text-white-50 text-uppercase fw-bold">Total Admitted</div>
                        <div class="h2 fw-bold mb-0">{data.stats?.admitted || 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-0 shadow-sm bg-warning text-dark h-100">
                    <div class="card-body">
                        <div class="small text-dark-50 text-uppercase fw-bold">Pending Processing</div>
                        <div class="h2 fw-bold mb-0">{data.stats?.pending || 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-0 shadow-sm bg-info text-white h-100">
                    <div class="card-body">
                        <div class="small text-white-50 text-uppercase fw-bold">Affiliated Colleges</div>
                        <div class="h2 fw-bold mb-0">{data.stats?.collegesCount || 0}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row g-4">
            <!-- Left Column: Selection Analytics -->
            <div class="col-lg-8">
                <!-- Course-wise Column Chart -->
                <div class="card shadow-sm mb-4 border-0">
                    <div class="card-header bg-white py-3 border-bottom-0">
                        <h5 class="card-title mb-0">Course-wise Intake vs Admitted</h5>
                        <small class="text-muted">{selectedCollege?.name || 'All Courses'}</small>
                    </div>
                    <div class="card-body">
                        <div style="height: 350px;">
                            {#if courseStats?.courses.length}
                                <canvas id="course-admission-chart"></canvas>
                            {:else}
                                <div class="h-100 d-flex align-items-center justify-content-center text-muted">
                                    No course data found for this institute.
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- Branch-wise Column Charts -->
                <h5 class="mb-3 px-1"><i class="bi bi-diagram-3 me-2"></i>Branch-wise Performance per Course</h5>
                <div class="row g-4 mb-4">
                    {#if branchStats?.courses.length}
                        {#each branchStats.courses as course, idx}
                            <div class="col-md-6">
                                <div class="card shadow-sm border-0 h-100">
                                    <div class="card-body">
                                        <div style="height: 250px;">
                                            <canvas id="branch-chart-{idx}"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {:else}
                        <div class="col-12 text-center py-5 text-muted bg-white rounded shadow-sm">
                            No branches found for the selected institute.
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Right Column: Global Insights & Table -->
            <div class="col-lg-4">
                <!-- Pie Chart -->
                <div class="card shadow-sm mb-4 border-0">
                    <div class="card-header bg-white py-3 border-bottom-0">
                        <h5 class="card-title mb-0">Admitted by College</h5>
                    </div>
                    <div class="card-body">
                        <div style="height: 250px;">
                            <canvas id="pie-college-global"></canvas>
                        </div>
                    </div>
                </div>

                <!-- College Performance Summary -->
                <div class="card shadow-sm border-0">
                    <div class="card-header bg-white py-3">
                        <h5 class="card-title mb-0">College Comparison</h5>
                    </div>
                    <div class="list-group list-group-flush">
                        {#each paginatedColleges as college}
                            <div class="list-group-item px-3 py-3 border-0 border-bottom">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <span class="fw-bold small text-truncate" style="max-width: 70%;">{college.name}</span>
                                    <span class="badge bg-light text-primary">{Math.round((college.admitted / (college.capacity || 1)) * 100)}%</span>
                                </div>
                                <div class="progress bg-dark bg-opacity-10" style="height: 6px;">
                                    <div class="progress-bar bg-primary" style="width: {(college.admitted / (college.capacity || 1)) * 100}%"></div>
                                </div>
                                <div class="d-flex justify-content-between mt-1">
                                    <small class="text-muted">Admitted: {college.admitted}</small>
                                    <small class="text-muted">Capacity: {college.capacity}</small>
                                </div>
                            </div>
                        {/each}
                    </div>
                    {#if totalPages > 1}
                        <div class="card-footer bg-white border-0 d-flex justify-content-center pb-3">
                            <button class="btn btn-sm btn-outline-secondary me-2" disabled={currentCollegePage <= 1} onclick={() => currentCollegePage--}>
                                <i class="bi bi-chevron-left"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" disabled={currentCollegePage >= totalPages} onclick={() => currentCollegePage++}>
                                <i class="bi bi-chevron-right"></i>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    :global(.card) {
        transition: transform 0.2s ease-in-out;
    }
    :global(.card:hover) {
        transform: translateY(-2px);
    }
</style>
