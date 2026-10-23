<script lang="ts">
    import type { PageData } from './$types';
    import * as XLSX from 'xlsx';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    let { data } = $props<{ data: PageData }>();

    let viewMode = $state<'detailed' | 'simple'>('simple');
    let selectedMetric = $state<'all' | 'submitted' | 'approved' | 'paid' | 'admitted' | 'admitted_id' | 'admitted_paid'>('paid');
    let includeUnassigned = $state(true);

    // Derived filtered data
    let filteredCapacityData = $derived(
        data.capacityData.map((college: any) => ({
            ...college,
            courses: college.courses.map((course: any) => ({
                ...course,
                filteredBranches: includeUnassigned 
                    ? course.branches 
                    : (course.branches || []).filter((b: any) => b.name !== 'Unassigned/Other')
            }))
        }))
    );

    function branchTotal(branches: any[], field: string): number {
        const filtered = includeUnassigned ? branches : (branches || []).filter(b => b.name !== 'Unassigned/Other');
        
        if (field === 'capacity') return filtered.reduce((sum: number, branch: any) => sum + (branch.capacity || 0), 0);
        if (field === 'metric_total') {
            return filtered.reduce((sum: number, branch: any) => sum + (branch.metrics?.[selectedMetric]?.total || 0), 0);
        }
        return filtered.reduce((sum: number, branch: any) => sum + (branch?.[field] || 0), 0);
    }

    function courseMetricTotal(branches: any[], fType: string): number {
        const filtered = includeUnassigned ? branches : (branches || []).filter(b => b.name !== 'Unassigned/Other');
        return filtered.reduce((sum: number, branch: any) => sum + (branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0), 0);
    }

    let grandTotalCapacity = $derived(
        filteredCapacityData.reduce((acc: number, college: any) => {
            return acc + college.courses.reduce((cAcc: number, course: any) => cAcc + branchTotal(course.filteredBranches, 'capacity'), 0);
        }, 0)
    );

    let grandTotalMetricTotal = $derived(
        filteredCapacityData.reduce((acc: number, college: any) => {
            return acc + college.courses.reduce((cAcc: number, course: any) => cAcc + branchTotal(course.filteredBranches, 'metric_total'), 0);
        }, 0)
    );

    let grandMetricTotals = $derived(
        (data.globalUniqueFormTypes || []).map((fType: string) => {
            return filteredCapacityData.reduce((acc: number, college: any) => {
                return acc + college.courses.reduce((cAcc: number, course: any) => cAcc + courseMetricTotal(course.filteredBranches, fType), 0);
            }, 0);
        })
    );

    function handleYearChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('academic_year_id', target.value);
        goto(`?${params.toString()}`);
    }

    function handleRejectedToggle(event: Event) {
        const target = event.target as HTMLInputElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('include_rejected', target.checked.toString());
        goto(`?${params.toString()}`);
    }

    function handleExcludeProvToggle(event: Event) {
        const target = event.target as HTMLInputElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('exclude_prov', target.checked.toString());
        goto(`?${params.toString()}`);
    }

    function handleCancelledToggle(event: Event) {
        const target = event.target as HTMLInputElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('include_cancelled', target.checked.toString());
        goto(`?${params.toString()}`);
    }

    function handleTransferredToggle(event: Event) {
        const target = event.target as HTMLInputElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('include_transferred', target.checked.toString());
        goto(`?${params.toString()}`);
    }

    function handleAdmissionTypeChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const params = new URLSearchParams($page.url.searchParams);
        if (target.value && target.value !== 'all') {
            params.set('admission_type', target.value);
        } else {
            params.delete('admission_type');
        }
        goto(`?${params.toString()}`);
    }

    const metrics = [
        { id: 'approved', label: 'Approved Apps', icon: 'bi-check-all' },
        { id: 'paid', label: 'Paid Students', icon: 'bi-currency-dollar' },
        { id: 'submitted', label: 'Submitted Apps', icon: 'bi-file-earmark-check' },
        { id: 'admitted_id', label: 'ID Generated', icon: 'bi-person-vcard' },
        { id: 'admitted_paid', label: 'ID & Paid', icon: 'bi-person-check' },
        { id: 'admitted', label: 'Final Admissions', icon: 'bi-person-badge' },
        { id: 'all', label: 'All Applications', icon: 'bi-list-ul' }
    ];

    function calculateVacancy(capacity: number, admissions: number): number {
        return Math.max(0, capacity - admissions);
    }

    async function downloadPDF() {
        if (!data.capacityData || data.capacityData.length === 0) {
            alert('No capacity data available to export.');
            return;
        }

        const metricLabel = metrics.find(m => m.id === selectedMetric)?.label.toUpperCase() || 'UNKNOWN';

        try {
            // Dynamic import to avoid SSR issues and only load when needed
            const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js');
            const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
            const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
            
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const tableBody = [];
            
            // Header
            const headerRow = ['COURSE / BRANCH', 'INTAKE'];
            data.globalUniqueFormTypes.forEach((f: string) => headerRow.push(f.toUpperCase()));
            tableBody.push(headerRow.map(text => ({ text, style: 'tableHeader' })));

            // Data Rows
            filteredCapacityData.forEach((college: any) => {
                college.courses.forEach((course: any) => {
                    // Course Header Row
                    tableBody.push([
                        { text: course.courseName.toUpperCase(), colSpan: headerRow.length, style: 'courseHeader' },
                        ...Array(headerRow.length - 1).fill('')
                    ]);

                    // Branches
                    course.filteredBranches.forEach((branch: any) => {
                        const row = [branch.name, branch.capacity.toString()];
                        data.globalUniqueFormTypes.forEach((fType: string) => {
                            row.push((branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0).toString());
                        });
                        tableBody.push(row.map((text, idx) => ({ 
                            text, 
                            alignment: idx === 0 ? 'left' : 'center',
                            bold: idx > 1 && parseInt(text) > 0
                        })));
                    });

                    // Subtotal
                    const subtotalRow = [{ text: 'Total :-', alignment: 'right', bold: true }, branchTotal(course.branches, 'capacity').toString()];
                    data.globalUniqueFormTypes.forEach((fType: string) => {
                        subtotalRow.push(courseMetricTotal(course.branches, fType).toString());
                    });
                    
                    tableBody.push(subtotalRow.map((cell: any, idx) => {
                        const cellObj = typeof cell === 'string' ? { text: cell } : cell;
                        return { ...cellObj, bold: true, fillColor: '#f8f9fa', alignment: idx === 0 ? 'right' : 'center' };
                    }));
                });
            });

            // Dynamically scale options based on row count and column count to ensure single-page A4 fit
            const rowCount = tableBody.length;
            const numFormTypes = data.globalUniqueFormTypes.length;

            let dynamicFontSize = 11.5;
            let dynamicHeaderSize = 16;
            let dynamicSubheaderSize = 12;
            let dynamicCourseHeaderSize = 12;
            let dynamicTableHeaderSize = 12;
            let dynamicMargin = 15;
            let dynamicPaddingTopBottom = 2.5;
            let dynamicPaddingLeftRight = 4.0;
            let headerMarginBottom = 2;
            let subheaderMarginBottom = 6;

            // Adjust based on rows (vertical height constraint)
            if (rowCount > 50) {
                dynamicFontSize = 8.5;
                dynamicHeaderSize = 13;
                dynamicSubheaderSize = 10.0;
                dynamicCourseHeaderSize = 9.0;
                dynamicTableHeaderSize = 9.0;
                dynamicMargin = 8;
                dynamicPaddingTopBottom = 1.0;
                dynamicPaddingLeftRight = 1.8;
                headerMarginBottom = 1;
                subheaderMarginBottom = 3;
            } else if (rowCount > 35) {
                dynamicFontSize = 9.5;
                dynamicHeaderSize = 14;
                dynamicSubheaderSize = 10.5;
                dynamicCourseHeaderSize = 10.0;
                dynamicTableHeaderSize = 10.0;
                dynamicMargin = 10;
                dynamicPaddingTopBottom = 1.4;
                dynamicPaddingLeftRight = 2.2;
                headerMarginBottom = 1;
                subheaderMarginBottom = 4;
            } else if (rowCount > 25) {
                dynamicFontSize = 10.5;
                dynamicHeaderSize = 15;
                dynamicSubheaderSize = 11.5;
                dynamicCourseHeaderSize = 11.0;
                dynamicTableHeaderSize = 11.0;
                dynamicMargin = 12;
                dynamicPaddingTopBottom = 1.8;
                dynamicPaddingLeftRight = 3.0;
                headerMarginBottom = 2;
                subheaderMarginBottom = 5;
            }

            // Adjust based on columns (horizontal width constraint)
            // Make adjustments milder so font size remains legible even with many columns
            if (numFormTypes > 10) {
                dynamicFontSize = Math.min(dynamicFontSize, 8.5);
                dynamicTableHeaderSize = Math.min(dynamicTableHeaderSize, 8.5);
                dynamicPaddingLeftRight = Math.min(dynamicPaddingLeftRight, 1.8);
            } else if (numFormTypes > 7) {
                dynamicFontSize = Math.min(dynamicFontSize, 9.5);
                dynamicTableHeaderSize = Math.min(dynamicTableHeaderSize, 9.5);
                dynamicPaddingLeftRight = Math.min(dynamicPaddingLeftRight, 2.2);
            } else if (numFormTypes > 5) {
                dynamicFontSize = Math.min(dynamicFontSize, 10.5);
                dynamicTableHeaderSize = Math.min(dynamicTableHeaderSize, 10.5);
                dynamicPaddingLeftRight = Math.min(dynamicPaddingLeftRight, 3.0);
            }

            const grandTotalFontSize = dynamicFontSize + 2;

            // Grand Total
            const grandTotalRow = [{ text: 'GRAND Total :-', alignment: 'right', bold: true, fontSize: grandTotalFontSize }, grandTotalCapacity.toString()];
            grandMetricTotals.forEach((total: number) => {
                grandTotalRow.push(total.toString());
            });
            
            tableBody.push(grandTotalRow.map((cell: any, idx) => {
                const cellObj = typeof cell === 'string' ? { text: cell } : cell;
                return { 
                    ...cellObj, 
                    bold: true, 
                    fontSize: grandTotalFontSize, 
                    fillColor: '#e9ecef',
                    color: 'black',
                    alignment: idx === 0 ? 'right' : 'center'
                };
            }));

            // Dynamically scale first column width based on number of columns to prevent too much blank space
            let courseBranchWidth = 180;
            let intakeWidth = 50;
            if (numFormTypes > 8) {
                courseBranchWidth = 140;
                intakeWidth = 40;
            } else if (numFormTypes > 5) {
                courseBranchWidth = 160;
                intakeWidth = 45;
            }

            // Distribute remaining space equally to the form type columns
            const widths = [courseBranchWidth, intakeWidth, ...data.globalUniqueFormTypes.map(() => '*')];

            const admTypeSuffix = data.selectedAdmissionType && data.selectedAdmissionType !== 'all' ? ` (${data.selectedAdmissionType.toUpperCase()})` : '';
            const admTypeFileStr = data.selectedAdmissionType && data.selectedAdmissionType !== 'all' ? `_${data.selectedAdmissionType}` : '';

            const docDefinition = {
                pageSize: 'A4',
                pageOrientation: 'portrait',
                pageMargins: [dynamicMargin, dynamicMargin, dynamicMargin, dynamicMargin],
                content: [
                    { text: `CAPACITY REPORT - ${metricLabel}${admTypeSuffix}`, style: 'header' },
                    { text: `Report Date: ${new Date().toLocaleDateString('en-GB')}`, style: 'subheader' },
                    {
                        table: {
                            headerRows: 1,
                            widths: widths,
                            body: tableBody
                        },
                        layout: {
                            hLineWidth: function (i: number, node: any) {
                                return (i === 0 || i === node.table.body.length) ? 1.5 : 0.5;
                            },
                            vLineWidth: function (i: number, node: any) {
                                return (i === 0 || i === node.table.widths.length) ? 1.5 : 0.5;
                            },
                            hLineColor: function (i: number) {
                                return (i === 0 || i === 1) ? 'black' : '#dddddd';
                            },
                            vLineColor: function (i: number) {
                                return '#dddddd';
                            },
                            paddingLeft: function(i: number) { return dynamicPaddingLeftRight; },
                            paddingRight: function(i: number) { return dynamicPaddingLeftRight; },
                            paddingTop: function(i: number) { return dynamicPaddingTopBottom; },
                            paddingBottom: function(i: number) { return dynamicPaddingTopBottom; }
                        }
                    }
                ],
                styles: {
                    header: { fontSize: dynamicHeaderSize, bold: true, alignment: 'center', margin: [0, 0, 0, headerMarginBottom] },
                    subheader: { fontSize: dynamicSubheaderSize, alignment: 'center', margin: [0, 0, 0, subheaderMarginBottom], color: '#666666' },
                    tableHeader: { bold: true, fontSize: dynamicTableHeaderSize, color: 'black', fillColor: '#f1f1f1', alignment: 'center', margin: [0, 1, 0, 1] },
                    courseHeader: { bold: true, fontSize: dynamicCourseHeaderSize, fillColor: '#f8f9fa', margin: [2, 1, 2, 1] }
                },
                defaultStyle: {
                    fontSize: dynamicFontSize
                }
            };

            pdfMake.createPdf(docDefinition).download(`${metricLabel.replace(' ', '_')}${admTypeFileStr}_Capacity_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('PDF Generation Error:', error);
            alert('Failed to generate PDF. Please try again.');
        }
    }

    async function downloadCapacityReport() {
        if (!data.capacityData || data.capacityData.length === 0) {
            alert('No capacity data available to export.');
            return;
        }

        const workbook = XLSX.utils.book_new();
        const metricLabel = metrics.find(m => m.id === selectedMetric)?.label || 'Metric';

        filteredCapacityData.forEach((collegeGroup: any) => {
            collegeGroup.courses.forEach((course: any) => {
                const branchesToExport = course.filteredBranches;
                if (branchesToExport && branchesToExport.length > 0) {
                    const sheetData = branchesToExport.map((branch: any) => {
                        if (viewMode === 'simple') {
                            const row: any = {
                                'Branch Name': branch.name,
                                'INTAKE': branch.capacity,
                            };
                            data.globalUniqueFormTypes.forEach((ft: string) => {
                                row[ft] = branch.metrics?.[selectedMetric]?.formTypes?.[ft] || 0;
                            });
                            return row;
                        } else {
                            const row: any = {
                                'College': collegeGroup.collegeName,
                                'Branch Name': branch.name,
                                'Intake Capacity': branch.capacity,
                                'Unique Students': branch.uniqueCount,
                                'Common Applicants': branch.commonCount,
                            };

                            // Add dynamic form type columns based on selected metric
                            data.globalUniqueFormTypes.forEach((fType: string) => {
                                row[fType] = branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0;
                            });

                            row[`Total ${metricLabel}`] = branch.metrics?.[selectedMetric]?.total || 0;
                            row['Admissions Done (ID Gen)'] = branch.metrics.admitted_id.total;
                            row['Tuition Paid'] = branch.metrics.admitted_paid.total;
                            row['Vacancy'] = calculateVacancy(branch.capacity, branch.metrics.admitted_id.total);

                            return row;
                        }
                    });

                    // Add Subtotal row for simple view
                    if (viewMode === 'simple') {
                        const subtotal: any = {
                            'Branch Name': 'Total :-',
                            'INTAKE': branchTotal(course.branches, 'capacity'),
                        };
                        data.globalUniqueFormTypes.forEach((ft: string) => {
                            subtotal[ft] = courseMetricTotal(course.branches, ft);
                        });
                        sheetData.push(subtotal);
                    }

                    const worksheet = XLSX.utils.json_to_sheet(sheetData);
                    const prefix = viewMode === 'simple' ? `${metricLabel.replace(' ', '_')}_` : '';
                    const sheetName = `${prefix}${course.courseName.substring(0, 20)}`.replace(/[\\/?*\[\]]/g, '');
                    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                }
            });
        });

        const admTypeFileStr = data.selectedAdmissionType && data.selectedAdmissionType !== 'all' ? `_${data.selectedAdmissionType}` : '';
        const fileName = viewMode === 'simple' ? `Simple_Capacity_Report_${metricLabel.replace(' ', '_')}${admTypeFileStr}.xlsx` : `Detailed_Capacity_Report${admTypeFileStr}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    }
</script>

<svelte:head>
    <title>Capacity Report - Admission System</title>
    <style>
        @media print {
            @page {
                size: A4 portrait;
                margin: 5mm 6mm;
            }
        }
    </style>
</svelte:head>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-3 no-print">
        <div>
            <h1 class="mb-1">Capacity Report</h1>
            <p class="text-muted mb-2">
                {viewMode === 'simple' 
                    ? 'Summarized view of admitted students categorized by form type.' 
                    : 'Detailed intake capacity, unique student counts, and application breakdowns.'}
            </p>

            <!-- Filters Row -->
            <div class="d-flex align-items-center bg-white border rounded px-3 py-2 shadow-sm flex-wrap gap-2" style="width: fit-content;">
                <div class="form-check mb-0 me-3 border-end pe-3">
                    <input class="form-check-input" type="checkbox" id="includeUnassigned" bind:checked={includeUnassigned}>
                    <label class="form-check-label small fw-bold" for="includeUnassigned">
                        Include Unassigned
                    </label>
                </div>
                <div class="form-check mb-0 me-3 border-end pe-3">
                    <input 
                        class="form-check-input" 
                        type="checkbox" 
                        id="excludeProv" 
                        checked={data.excludeProv}
                        onchange={handleExcludeProvToggle}
                    >
                    <label class="form-check-label small fw-bold text-danger" for="excludeProv" title="Exclude provisional forms to show final admitted students only">
                        Excl. Provisional Forms
                    </label>
                </div>
                <div class="form-check mb-0 me-3 border-end pe-3">
                    <input 
                        class="form-check-input" 
                        type="checkbox" 
                        id="includeCancelled" 
                        checked={data.includeCancelled}
                        onchange={handleCancelledToggle}
                    >
                    <label class="form-check-label small fw-bold" for="includeCancelled" title="Enable or disable cancelled student count in capacity metrics">
                        Include Cancelled
                    </label>
                </div>
                <div class="form-check mb-0 me-3 border-end pe-3">
                    <input 
                        class="form-check-input" 
                        type="checkbox" 
                        id="includeTransferred" 
                        checked={data.includeTransferred}
                        onchange={handleTransferredToggle}
                    >
                    <label class="form-check-label small fw-bold" for="includeTransferred" title="Enable or disable transferred student count in capacity metrics">
                        Include Transferred
                    </label>
                </div>
                <div class="form-check mb-0">
                    <input 
                        class="form-check-input" 
                        type="checkbox" 
                        id="includeRejected" 
                        checked={data.includeRejected}
                        onchange={handleRejectedToggle}
                    >
                    <label class="form-check-label small fw-bold" for="includeRejected">
                        Include Rejected/Removed
                    </label>
                </div>
            </div>
        </div>
        <div class="d-flex gap-2 align-self-start flex-wrap">
            <div class="me-2">
                <select 
                    class="form-select shadow-sm" 
                    value={data.selectedAdmissionType || 'all'} 
                    onchange={handleAdmissionTypeChange}
                    title="Filter by Admission Type"
                >
                    <option value="all">All Admission Types</option>
                    {#each data.availableAdmissionTypes || [] as type}
                        <option value={type}>{type}</option>
                    {/each}
                </select>
            </div>
            <div class="me-2">
                <select 
                    class="form-select shadow-sm" 
                    value={data.selectedYearId} 
                    onchange={handleYearChange}
                >
                    {#each data.academicYears as year}
                        <option value={year.id}>
                            {year.name} {year.id === data.activeYearId ? '(Active)' : ''}
                        </option>
                    {/each}
                </select>
            </div>
            {#if viewMode === 'simple'}
                <div class="dropdown me-2">
                    <button class="btn btn-outline-dark dropdown-toggle shadow-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class={metrics.find(m => m.id === selectedMetric)?.icon}></i> 
                        {metrics.find(m => m.id === selectedMetric)?.label}
                    </button>
                    <ul class="dropdown-menu shadow">
                        {#each metrics as metric}
                            <li>
                                <button 
                                    class="dropdown-item d-flex align-items-center gap-2 {selectedMetric === metric.id ? 'active' : ''}" 
                                    onclick={() => selectedMetric = metric.id as any}
                                >
                                    <i class={metric.icon}></i> {metric.label}
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <div class="btn-group shadow-sm">
                <button 
                    class="btn {viewMode === 'detailed' ? 'btn-primary' : 'btn-outline-primary'}" 
                    onclick={() => viewMode = 'detailed'}
                >
                    Detailed View
                </button>
                <button 
                    class="btn {viewMode === 'simple' ? 'btn-primary' : 'btn-outline-primary'}" 
                    onclick={() => viewMode = 'simple'}
                >
                    Simple View
                </button>
            </div>

            <div class="btn-group shadow-sm">
                <button class="btn btn-success" onclick={downloadCapacityReport}>
                    <i class="bi bi-file-earmark-excel"></i> Export Excel
                </button>
                {#if viewMode === 'simple'}
                    <button class="btn btn-danger" onclick={downloadPDF}>
                        <i class="bi bi-file-earmark-pdf"></i> Export PDF
                    </button>
                {/if}
            </div>
        </div>
    </div>

    {#if data.capacityData && data.capacityData.length > 0}
        {#if viewMode === 'detailed'}
            {#each filteredCapacityData as collegeGroup (collegeGroup.collegeName)}
                <div class="college-group mb-5">
                    <div class="d-flex align-items-center mb-3">
                        <h3 class="mb-0 text-dark border-bottom border-primary border-3 pb-1">{collegeGroup.collegeName}</h3>
                        <span class="badge bg-secondary ms-3">{collegeGroup.courses.length} Courses</span>
                    </div>
                    
                    <div class="row g-4">
                        {#each collegeGroup.courses as course (course.courseName)}
                            <div class="col-12">
                                <div class="card shadow-sm">
                                    <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                                        <h5 class="mb-0">{course.courseName}</h5>
                                        <span class="badge bg-light text-primary fs-6">
                                            Total Intake: {branchTotal(course.filteredBranches, 'capacity')}
                                        </span>
                                    </div>
                                    <div class="card-body p-0">
                                        <div class="table-responsive">
                                            <table class="table table-bordered table-striped table-hover mb-0" style="font-size: 0.85rem;">
                                                <thead class="table-light align-middle text-center">
                                                    <tr>
                                                        <th rowspan="2" class="text-start">Branch</th>
                                                        <th rowspan="2">Intake Capacity</th>
                                                        <th colspan="2" class="bg-info bg-opacity-10">Applicant Metrics</th>
                                                        {#if collegeGroup.uniqueFormTypes.length > 0}
                                                            <th colspan={collegeGroup.uniqueFormTypes.length} class="bg-success bg-opacity-10">
                                                                Form-wise Applications ({metrics.find(m => m.id === selectedMetric)?.label})
                                                            </th>
                                                        {/if}
                                                        <th rowspan="2">Approved / Admitted<br><small class="fw-normal text-muted" style="font-size: 0.7rem;">(Appr / ID Gen)</small></th>
                                                        <th rowspan="2">Admissions Done<br><small class="fw-normal text-muted" style="font-size: 0.7rem;">(ID Gen / Paid)</small></th>
                                                        <th rowspan="2">Vacancy</th>
                                                    </tr>
                                                    <tr>
                                                        <th class="bg-info bg-opacity-10 small">Unique Students</th>
                                                        <th class="bg-info bg-opacity-10 small">Common Appls</th>
                                                        {#each collegeGroup.uniqueFormTypes as fType}
                                                            <th class="bg-success bg-opacity-10 small">{fType}</th>
                                                        {/each}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {#each course.filteredBranches as branch (branch.id)}
                                                        <tr class="text-center">
                                                            <td class="fw-bold text-start">{branch.name}</td>
                                                            <td>{branch.capacity}</td>
                                                            <td class="table-info bg-opacity-10">{branch.uniqueCount}</td>
                                                            <td class="table-info bg-opacity-10">
                                                                {#if branch.commonCount > 0}
                                                                    <span class="badge bg-primary rounded-pill">{branch.commonCount}</span>
                                                                {:else}
                                                                    <span class="text-muted">-</span>
                                                                {/if}
                                                            </td>
                                                            
                                                            {#each collegeGroup.uniqueFormTypes as fType}
                                                                <td class="table-success bg-opacity-10">
                                                                    {#if (branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0) > 0}
                                                                        <span class="fw-bold">{branch.metrics[selectedMetric].formTypes[fType]}</span>
                                                                    {:else}
                                                                        <span class="text-muted small">-</span>
                                                                    {/if}
                                                                </td>
                                                            {/each}

                                                            <td>
                                                                <div class="d-flex flex-column align-items-center">
                                                                    <span class="fw-bold" title="Total Approved">{branch.approved}</span>
                                                                    <span class="text-secondary" style="font-size: 0.75rem;" title="College ID Generated">(ID: {branch.metrics.admitted_id.total})</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div class="d-flex flex-column align-items-center">
                                                                    <span class="fw-bold" title="College ID Generated">{branch.metrics.admitted_id.total}</span>
                                                                    <span class="text-primary" style="font-size: 0.75rem;" title="Tuition Fee Paid">(Paid: {branch.metrics.admitted_paid.total})</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span class="badge {calculateVacancy(branch.capacity, branch.metrics.admitted_id.total) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                                    {calculateVacancy(branch.capacity, branch.metrics.admitted_id.total)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    {/each}
                                                    <tr class="table-secondary fw-bold text-center align-middle">
                                                        <td class="text-start">Total</td>
                                                        <td>{branchTotal(course.filteredBranches, 'capacity')}</td>
                                                        <td>{branchTotal(course.filteredBranches, 'uniqueCount')}</td>
                                                        <td>{branchTotal(course.filteredBranches, 'commonCount')}</td>
                                                        
                                                        {#each collegeGroup.uniqueFormTypes as fType}
                                                            <td>
                                                                {courseMetricTotal(course.filteredBranches, fType)}
                                                            </td>
                                                        {/each}

                                                        <td>
                                                            <div class="d-flex flex-column align-items-center">
                                                                <span>{branchTotal(course.filteredBranches, 'approved')}</span>
                                                                <span class="text-secondary" style="font-size: 0.75rem;">(ID: {course.filteredBranches.reduce((sum: number, b: any) => sum + (b.metrics.admitted_id.total || 0), 0)})</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div class="d-flex flex-column align-items-center">
                                                                <span>{course.filteredBranches.reduce((sum: number, b: any) => sum + (b.metrics.admitted_id.total || 0), 0)}</span>
                                                                <span class="text-primary" style="font-size: 0.75rem;">(Paid: {course.filteredBranches.reduce((sum: number, b: any) => sum + (b.metrics.admitted_paid.total || 0), 0)})</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span class="badge {calculateVacancy(branchTotal(course.filteredBranches, 'capacity'), course.filteredBranches.reduce((sum: number, b: any) => sum + (b.metrics.admitted_id.total || 0), 0)) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                                {calculateVacancy(branchTotal(course.filteredBranches, 'capacity'), course.filteredBranches.reduce((sum: number, b: any) => sum + (b.metrics.admitted_id.total || 0), 0))}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
        {#if viewMode === 'simple'}
            <!-- Simple View Table Matching PDF -->
            <div class="card shadow-sm border-0 bg-white">
                <div class="card-body p-4">
                    <div class="text-center mb-4">
                        <h4 class="fw-bold mb-1">
                            CAPACITY REPORT - {metrics.find(m => m.id === selectedMetric)?.label.toUpperCase()}
                            {#if data.selectedAdmissionType && data.selectedAdmissionType !== 'all'}
                                ({data.selectedAdmissionType.toUpperCase()})
                            {/if}
                        </h4>
                        <p class="text-muted small mb-0">{new Date().toLocaleDateString('en-GB')}</p>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered simple-report border-dark">
                            <thead class="text-center align-middle fw-bold bg-light">
                                <tr class="border-dark border-bottom-2">
                                    <th class="text-start py-2">COURSE / BRANCH</th>
                                    <th style="width: 100px;">INTAKE</th>
                                    {#each data.globalUniqueFormTypes || [] as fType}
                                        <th style="width: 80px;">{fType.toUpperCase()}</th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody>
                                {#each filteredCapacityData as college}
                                    {#each college.courses as course}
                                        <tr class="bg-light fw-bold text-uppercase border-dark border-top-2 border-bottom-1">
                                            <td colspan={(data.globalUniqueFormTypes?.length || 0) + 2} class="py-2 px-3">
                                                {course.courseName}
                                            </td>
                                        </tr>
                                        {#each course.filteredBranches as branch}
                                            <tr class="text-center align-middle">
                                                <td class="text-start px-3">{branch.name}</td>
                                                <td>{branch.capacity}</td>
                                                {#each data.globalUniqueFormTypes || [] as fType}
                                                    <td class={(branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0) > 0 ? 'fw-bold' : 'text-muted'}>
                                                        {branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0}
                                                    </td>
                                                {/each}
                                            </tr>
                                        {/each}
                                        <!-- Course Subtotal -->
                                        <tr class="fw-bold text-center bg-light border-dark border-top-1 border-bottom-2">
                                            <td class="text-end px-3 py-2">Total :-</td>
                                            <td>{branchTotal(course.filteredBranches, 'capacity')}</td>
                                            {#each data.globalUniqueFormTypes || [] as fType}
                                                <td>{courseMetricTotal(course.filteredBranches, fType)}</td>
                                            {/each}
                                        </tr>
                                    {/each}
                                {/each}
                            </tbody>
                            <tfoot class="fw-bold text-center align-middle bg-light">
                                <tr class="border-dark border-top-3">
                                    <td class="text-end px-3 py-3 fs-5">GRAND Total :-</td>
                                    <td class="fs-5">{grandTotalCapacity}</td>
                                    {#each grandMetricTotals as total}
                                        <td class="fs-5">{total}</td>
                                    {/each}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        {/if}
    {:else}
        <div class="alert alert-warning">No capacity data is available for your assigned college or across the system.</div>
    {/if}
</div>

<style>
    .x-small { font-size: 0.75rem; }
    .table-responsive {
        border-radius: 0 0 0.375rem 0.375rem;
    }
    
    /* Modern, premium table styles */
    .simple-report {
        font-size: 0.875rem;
    }
    
    .simple-report th {
        background-color: #f8f9fa;
        color: #212529;
        font-weight: 600;
        font-size: 0.75rem;
        letter-spacing: 0.5px;
    }
    
    @media print {
        :global(header),
        :global(.sidebar-container),
        :global(footer),
        :global(.no-print) {
            display: none !important;
        }
        
        :global(.main-layout-content-wrapper) {
            padding-top: 0 !important;
            margin: 0 !important;
            display: block !important;
        }
        
        :global(main) {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
        }
        
        .container-fluid {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
        }
        
        .card {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        
        .card-body {
            padding: 0 !important;
            margin: 0 !important;
        }
        
        .table-responsive {
            overflow: visible !important;
            border: none !important;
        }
        
        .simple-report {
            width: 100% !important;
            font-size: 7.2pt !important;
            border-collapse: collapse !important;
        }
        
        .simple-report th,
        .simple-report td {
            padding: 1.5px 3px !important;
            line-height: 1.05 !important;
            border: 1px solid #000 !important;
        }
        
        .simple-report th {
            background-color: #f1f1f1 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        .simple-report tr.bg-light {
            background-color: #f8f9fa !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        .simple-report tfoot tr {
            background-color: #e9ecef !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        .simple-report tr {
            page-break-inside: avoid !important;
        }
        
        :global(.text-center.mb-4) {
            margin-bottom: 0.25rem !important;
        }
        
        :global(.text-center.mb-4 h4) {
            font-size: 10pt !important;
            margin: 0 !important;
            font-weight: bold !important;
        }
        
        :global(.text-center.mb-4 p) {
            font-size: 7pt !important;
            margin: 0 !important;
        }
    }
</style>
