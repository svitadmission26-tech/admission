<script lang="ts">
    import { page } from "$app/state";
    import { untrack } from "svelte";

    let { data } = $props();

    let searchVal = $state("");
    let filterFormType = $state("all");
    let filterAdmissionType = $state("all");
    let filterAdmissionStatus = $state("Admitted"); // default to Admitted
    let filterApplicationStatus = $state("all");

    // Scope-level filters (for college/university HODs)
    let filterCollege = $state("");  // for university-scope HODs
    let filterCourse  = $state("");  // course ID
    let filterBranch  = $state("");  // branch ID

    let showModal = $state(false);
    let selectedFields = $state<string[]>([]);

    const staticFields = [
        { key: 'Sr. No', label: 'Sr. No' },
        { key: 'Branch', label: 'Branch' },
        { key: 'College ID (Enrollment No)', label: 'College ID (Enrollment No)' },
        { key: 'Admission ID', label: 'Admission ID' },
        { key: 'Student Name', label: 'Student Name' },
        { key: 'Email', label: 'Email' },
        { key: 'Admission Status', label: 'Admission Status' },
        { key: 'Form Type', label: 'Form Type' },
        { key: 'Admission Mode', label: 'Admission Mode' },
        { key: 'Admitted Date', label: 'Admitted Date' }
    ];

    let dynamicFields = $derived.by(() => {
        const keys = new Set<string>();
        data.students.forEach((s: any) => {
            if (s.formData && typeof s.formData === 'object') {
                Object.keys(s.formData).forEach(k => keys.add(k));
            }
        });
        return Array.from(keys).sort().map(k => ({
            key: `Form Field: ${k}`,
            label: `Form Field: ${k}`
        }));
    });

    const profileFields = [
        { key: 'Profile: Contact Number', label: 'Contact Number' },
        { key: 'Profile: Alternate Contact', label: 'Alternate Contact' },
        { key: 'Profile: Gender', label: 'Gender' },
        { key: 'Profile: Category', label: 'Category' },
        { key: 'Profile: Religion', label: 'Religion' },
        { key: 'Profile: Caste', label: 'Caste' },
        { key: 'Profile: Birth Date', label: 'Birth Date' },
        { key: 'Profile: Aadhar Card No', label: 'Aadhar Card No' },
        { key: 'Profile: Father Name', label: 'Father Name' },
        { key: 'Profile: Father Contact', label: 'Father Contact' },
        { key: 'Profile: Mother Name', label: 'Mother Name' },
        { key: 'Profile: Mother Contact', label: 'Mother Contact' },
        { key: 'Profile: Permanent Address', label: 'Permanent Address' },
        { key: 'Profile: Correspondence Address', label: 'Correspondence Address' }
    ];

    let allFields = $derived([...staticFields, ...profileFields, ...dynamicFields]);

    // Initialize selectedFields from localStorage or default on mount
    $effect(() => {
        const storageKey = `hod_export_template_${data.department.branchName}`;
        const saved = localStorage.getItem(storageKey);
        const defaultFields = [...staticFields, ...profileFields].map(f => f.key);
        untrack(() => {
            if (saved) {
                try {
                    selectedFields = JSON.parse(saved);
                } catch (e) {
                    selectedFields = defaultFields;
                }
            } else {
                selectedFields = defaultFields;
            }
        });
    });

    function saveTemplate() {
        const storageKey = `hod_export_template_${data.department.branchName}`;
        localStorage.setItem(storageKey, JSON.stringify(selectedFields));
        showModal = false;
    }

    function resetToDefault() {
        selectedFields = [...staticFields, ...profileFields].map(f => f.key);
    }

    let downloadUrl = $derived.by(() => {
        const params = new URLSearchParams();
        if (selectedFields.length > 0) {
            params.append('fields', selectedFields.join(','));
        }
        if (filterFormType !== 'all') {
            params.append('form_type', filterFormType);
        }
        if (filterAdmissionType !== 'all') {
            params.append('admission_type', filterAdmissionType);
        }
        if (searchVal.trim() !== '') {
            params.append('search', searchVal.trim());
        }
        return `/hod/export?${params.toString()}`;
    });

    // Extract unique form types and admission types for filter dropdowns
    let formTypes = $derived([
        ...new Set(data.students.map((s: any) => s.formType).filter(Boolean))
    ]);
    
    let admissionTypes = $derived([
        ...new Set(data.students.map((s: any) => s.admissionType).filter(Boolean))
    ]);

    // Scope-aware derived filter option lists (grouped by code/name to prevent duplicate filter options)
    let availableCourses = $derived.by(() => {
        const rawCourses = !filterCollege 
            ? data.filterOptions.courses 
            : data.filterOptions.courses.filter((c: any) => c.college_id === filterCollege);
        
        const seen = new Set<string>();
        return rawCourses.filter((c: any) => {
            const key = (c.code || c.name || '').toUpperCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    });

    let availableBranches = $derived.by(() => {
        const selectedCourseCode = filterCourse || '';
        const rawBranches = data.filterOptions.branches.filter((b: any) => {
            const course = data.filterOptions.courses.find((c: any) => c.id === b.course_id);
            if (!course) return true;
            
            if (selectedCourseCode) {
                const courseKey = (course.code || course.name || '').toUpperCase().trim();
                if (courseKey !== selectedCourseCode.toUpperCase().trim()) return false;
            }
            if (filterCollege) {
                return course.college_id === filterCollege;
            }
            return true;
        });

        const seen = new Set<string>();
        return rawBranches.filter((b: any) => {
            const key = (b.name || '').toUpperCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    });

    // Reactively filter students based on search term and filters
    let filteredStudents = $derived(
        data.students.filter((student: any) => {
            const matchesSearch = 
                student.fullName.toLowerCase().includes(searchVal.toLowerCase()) ||
                student.email.toLowerCase().includes(searchVal.toLowerCase()) ||
                student.enrollmentNumber.toLowerCase().includes(searchVal.toLowerCase()) ||
                student.admissionNumber.toLowerCase().includes(searchVal.toLowerCase()) ||
                (student.contactNumber || '').toLowerCase().includes(searchVal.toLowerCase());

            const matchesForm = 
                filterFormType === "all" ? true :
                filterFormType === "exclude_provisional" ? student.formType !== "Provisional" :
                student.formType === filterFormType;
                
            const matchesAdmission = filterAdmissionType === "all" || student.admissionType === filterAdmissionType;
            const matchesStatus    = filterAdmissionStatus === "all" || student.admissionStatus === filterAdmissionStatus;
            const matchesAppStatus = filterApplicationStatus === "all" || student.applicationStatus === filterApplicationStatus;
            
            const matchesCollege   = !filterCollege || student.collegeId === filterCollege;
            
            const studentCourseKey = (student.courseCode || student.courseName || '').toUpperCase().trim();
            const matchesCourse    = !filterCourse  || studentCourseKey === filterCourse.toUpperCase().trim();
            
            const studentBranchKey = (student.branchName || '').toUpperCase().trim();
            const matchesBranch    = !filterBranch  || studentBranchKey === filterBranch.toUpperCase().trim();

            return matchesSearch && matchesForm && matchesAdmission && matchesStatus && matchesAppStatus
                && matchesCollege && matchesCourse && matchesBranch;
        })
    );

    let sortBy = $state("enrollmentNumber");
    let sortOrder = $state<"asc" | "desc">("asc");

    function toggleSort(column: string) {
        if (sortBy === column) {
            sortOrder = sortOrder === "asc" ? "desc" : "asc";
        } else {
            sortBy = column;
            sortOrder = "asc";
        }
    }

    let sortedStudents = $derived.by(() => {
        const list = [...filteredStudents];
        list.sort((a: any, b: any) => {
            let valA = a[sortBy];
            let valB = b[sortBy];
            
            // Handle numeric values
            if (sortBy === "meritScore") {
                const numA = parseFloat(valA) || 0;
                const numB = parseFloat(valB) || 0;
                return sortOrder === "asc" ? numA - numB : numB - numA;
            }
            
            // Handle dates
            if (sortBy === "submittedAt") {
                const dateA = new Date(valA).getTime() || 0;
                const dateB = new Date(valB).getTime() || 0;
                return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
            }

            // Fallback to string comparison
            const strA = String(valA || "").toLowerCase();
            const strB = String(valB || "").toLowerCase();
            if (strA < strB) return sortOrder === "asc" ? -1 : 1;
            if (strA > strB) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    });

    // Dynamic stats
    let totalStudentsCount = $derived(data.students.length);
    let filteredCount = $derived(filteredStudents.length);

    // Helper to check if a student matches all filters except status and search
    function matchesFiltersExceptStatus(student: any) {
        const matchesForm = 
            filterFormType === "all" ? true :
            filterFormType === "exclude_provisional" ? student.formType !== "Provisional" :
            student.formType === filterFormType;
            
        const matchesAdmission = filterAdmissionType === "all" || student.admissionType === filterAdmissionType;
        const matchesCollege   = !filterCollege || student.collegeId === filterCollege;
        
        const studentCourseKey = (student.courseCode || student.courseName || '').toUpperCase().trim();
        const matchesCourse    = !filterCourse  || studentCourseKey === filterCourse.toUpperCase().trim();
        
        const studentBranchKey = (student.branchName || '').toUpperCase().trim();
        const matchesBranch    = !filterBranch  || studentBranchKey === filterBranch.toUpperCase().trim();

        return matchesForm && matchesAdmission && matchesCollege && matchesCourse && matchesBranch;
    }

    let admittedCount = $derived(
        data.students.filter((s: any) => s.admissionStatus?.toLowerCase() === "admitted" && matchesFiltersExceptStatus(s)).length
    );

    let cancelledCount = $derived(
        data.students.filter((s: any) => s.admissionStatus?.toLowerCase() === "cancelled" && matchesFiltersExceptStatus(s)).length
    );

    function resetAllFilters() {
        searchVal = "";
        filterFormType = "all";
        filterAdmissionType = "all";
        filterAdmissionStatus = "Admitted";
        filterApplicationStatus = "all";
        filterCollege = "";
        filterCourse = "";
        filterBranch = "";
    }

    // When college changes, reset course/branch
    $effect(() => { filterCollege; filterCourse = ""; filterBranch = ""; });
    // When course changes, reset branch
    $effect(() => { filterCourse; filterBranch = ""; });
</script>

<div class="container-fluid py-4">
    <!-- Header -->
    <div class="row mb-4">
        <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
                <h1 class="h2 mb-1 text-dark fw-bold">Department Report
                    {#if data.department.hodScope === 'college'}
                        <span class="badge bg-warning-subtle text-warning border border-warning fs-7 fw-normal ms-2">College-Wide</span>
                    {:else if data.department.hodScope === 'university'}
                        <span class="badge bg-purple-subtle text-purple border fs-7 fw-normal ms-2" style="background:#f3e8ff;color:#7c3aed;border-color:#c4b5fd">University-Wide</span>
                    {/if}
                </h1>
            </div>
            
            <div class="d-flex align-items-center gap-2">
                <button 
                    type="button"
                    class="btn btn-outline-primary d-flex align-items-center gap-2 px-3 shadow-sm"
                    onclick={() => showModal = true}
                >
                    <i class="bi bi-gear-fill"></i>
                    <span>Configure Columns</span>
                </button>
                <a 
                    href={downloadUrl} 
                    class="btn btn-success d-flex align-items-center gap-2 px-4 shadow-sm"
                    download
                >
                    <i class="bi bi-file-earmark-excel-fill fs-5"></i>
                    <span class="fw-semibold">Export Admitted Students</span>
                </a>
            </div>
        </div>
    </div>

    <!-- Quick Stats Row -->
    <div class="row g-3 mb-4">
        <div class="col-md-4 col-sm-6">
            <div class="card border-0 shadow-sm text-white card-hover" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                <div class="card-body p-3">
                    <h6 class="text-white-50 text-uppercase mb-1 small fw-bold">Admitted Student Count</h6>
                    <h3 class="mb-0 fw-bold text-white">{admittedCount}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-4 col-sm-6">
            <div class="card border-0 shadow-sm text-white card-hover" style="background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%);">
                <div class="card-body p-3">
                    <h6 class="text-white-50 text-uppercase mb-1 small fw-bold">Cancelled Student Count</h6>
                    <h3 class="mb-0 fw-bold text-white">{cancelledCount}</h3>
                </div>
            </div>
        </div>
    </div>

    <!-- Data Table Card -->
    <div class="card border-0 shadow-sm">
        <!-- Filters Header -->
        <div class="card-header bg-white border-bottom py-3">
            <!-- Row 1: Search + basic filters -->
            <div class="row g-2 align-items-center mb-2">
                <!-- Search Input -->
                <div class="col-md-3">
                    <div class="input-group" title="Search students by Name, College ID, Admission ID, Email, or Contact number">
                        <span class="input-group-text bg-light border-end-0 text-muted">
                            <i class="bi bi-search"></i>
                        </span>
                        <input 
                            type="text" 
                            class="form-control bg-light border-start-0 ps-0" 
                            placeholder="Search by Name, ID, Email or Contact..."
                            bind:value={searchVal}
                        />
                    </div>
                </div>
                
                <!-- Form Type Filter -->
                <div class="col-md-2">
                    <select class="form-select bg-light" bind:value={filterFormType} title="Filter students by Admission Form Type">
                        <option value="exclude_provisional">Excl. Provisional</option>
                        <option value="all">All Form Types</option>
                        {#each formTypes as type}
                            <option value={type}>{type}</option>
                        {/each}
                    </select>
                </div>

                <!-- Admission Status Filter -->
                <div class="col-md-2">
                    <select class="form-select bg-light" bind:value={filterAdmissionStatus} title="Filter students by their Admission Status (Admitted, Pending, Cancelled)">
                        <option value="all">All Admission Statuses</option>
                        <option value="Admitted">✅ Admitted</option>
                        <option value="pending">⏳ Pending</option>
                        <option value="Cancelled">❌ Cancelled</option>
                    </select>
                </div>

                <!-- Application Status Filter -->
                <div class="col-md-2">
                    <select class="form-select bg-light" bind:value={filterApplicationStatus} title="Filter students by Application Lifecycle Status (Approved, Verified, Submitted, etc.)">
                        <option value="all">All App Statuses</option>
                        <option value="approved">Approved</option>
                        <option value="verified">Verified</option>
                        <option value="submitted">Submitted</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <!-- Admission Mode Filter -->
                <div class="col-md-2">
                    <select class="form-select bg-light" bind:value={filterAdmissionType} title="Filter students by Admission Mode (Regular, D2D, C2D, etc.)">
                        <option value="all">All Modes</option>
                        {#each admissionTypes as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
                </div>

                <!-- Reset Button -->
                <div class="col-md-1 text-md-end">
                    <button 
                        class="btn btn-outline-secondary w-100 px-0" 
                        onclick={resetAllFilters}
                        title="Reset all filters to default values"
                    >
                        <i class="bi bi-arrow-counterclockwise"></i> Reset
                    </button>
                </div>
            </div>

            <!-- Row 2: Scope filters (college / university HODs only) -->
            {#if data.department.hodScope === 'college' || data.department.hodScope === 'university'}
            <div class="row g-2 align-items-center pt-2 border-top mt-2">
                <div class="col-auto">
                    <span class="badge bg-primary-subtle text-primary border border-primary px-3 py-2 rounded-pill fs-7 fw-semibold">
                        <i class="bi bi-funnel-fill me-1"></i>Scope Filters
                    </span>
                </div>

                <!-- College filter (university-scope HODs only) -->
                {#if data.department.hodScope === 'university' && data.filterOptions.colleges.length > 0}
                <div class="col-md-3">
                    <div class="input-group input-group-sm shadow-sm rounded" title="Filter by College">
                        <span class="input-group-text bg-white border-end-0 text-muted"><i class="bi bi-bank"></i></span>
                        <select class="form-select form-select-sm bg-light border-start-0 ps-0 fw-medium text-secondary" bind:value={filterCollege}>
                            <option value="">All Colleges</option>
                            {#each data.filterOptions.colleges as college}
                                <option value={college.id}>{college.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                {/if}

                <!-- Course filter -->
                {#if availableCourses.length > 0}
                <div class="col-md-3">
                    <div class="input-group input-group-sm shadow-sm rounded" title="Filter by Course">
                        <span class="input-group-text bg-white border-end-0 text-muted"><i class="bi bi-book-half"></i></span>
                        <select class="form-select form-select-sm bg-light border-start-0 ps-0 fw-medium text-secondary" bind:value={filterCourse}>
                            <option value="">All Courses</option>
                            {#each availableCourses as course}
                                <option value={course.code || course.name}>{course.name} ({course.code})</option>
                            {/each}
                        </select>
                    </div>
                </div>
                {/if}

                <!-- Branch filter -->
                {#if availableBranches.length > 0}
                <div class="col-md-3">
                    <div class="input-group input-group-sm shadow-sm rounded" title="Filter by Branch">
                        <span class="input-group-text bg-white border-end-0 text-muted"><i class="bi bi-tags"></i></span>
                        <select class="form-select form-select-sm bg-light border-start-0 ps-0 fw-medium text-secondary" bind:value={filterBranch}>
                            <option value="">All Branches</option>
                            {#each availableBranches as branch}
                                <option value={branch.name}>{branch.name} ({branch.code})</option>
                            {/each}
                        </select>
                    </div>
                </div>
                {/if}

                {#if filterCollege || filterCourse || filterBranch}
                <div class="col-auto ms-2">
                    <button class="btn btn-sm btn-link text-danger p-0 fw-semibold text-decoration-none" 
                        onclick={() => { filterCollege = ''; filterCourse = ''; filterBranch = ''; }}>
                        <i class="bi bi-x-circle-fill me-1"></i>Clear scope
                    </button>
                </div>
                {/if}
            </div>
            {/if}
        </div>

        <!-- Table Body -->
        <div class="table-responsive" style="max-height: 60vh;">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light text-uppercase fs-7 fw-bold text-muted border-bottom">
                    <tr>
                        <th class="ps-3 text-secondary select-none" style="width: 50px;">#</th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('enrollmentNumber')}>
                            College ID
                            {#if sortBy === 'enrollmentNumber'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('admissionNumber')}>
                            Admission ID
                            {#if sortBy === 'admissionNumber'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('admissionStatus')}>
                            Status
                            {#if sortBy === 'admissionStatus'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('fullName')}>
                            Student Name
                            {#if sortBy === 'fullName'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('email')}>
                            Email
                            {#if sortBy === 'email'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('contactNumber')}>
                            Contact
                            {#if sortBy === 'contactNumber'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('city')}>
                            City
                            {#if sortBy === 'city'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap" onclick={() => toggleSort('formType')}>
                            Form Type
                            {#if sortBy === 'formType'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        <th class="cursor-pointer select-none text-secondary text-nowrap pe-4" onclick={() => toggleSort('admissionType')}>
                            Mode
                            {#if sortBy === 'admissionType'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        {#if data.department.hodScope === 'college'}
                        <th class="cursor-pointer select-none text-secondary text-nowrap pe-4" onclick={() => toggleSort('branchName')}>
                            Branch
                            {#if sortBy === 'branchName'}
                                <i class="bi bi-chevron-{sortOrder === 'asc' ? 'up' : 'down'} text-primary ms-1"></i>
                            {/if}
                        </th>
                        {/if}
                    </tr>
                </thead>
                <tbody class="border-top-0">
                    {#each sortedStudents as student, i}
                        <tr>
                            <td class="ps-3 fw-semibold text-muted text-nowrap" style="width:50px;">{i + 1}</td>
                            <td class="text-nowrap">
                                <span class="badge bg-secondary-subtle text-secondary border font-monospace px-2 py-1 fs-7">
                                    {student.enrollmentNumber}
                                </span>
                            </td>
                            <td class="text-nowrap">
                                <span class="badge bg-primary-subtle text-primary border font-monospace px-2 py-1 fs-7">
                                    {student.admissionNumber}
                                </span>
                            </td>
                            <td class="text-nowrap">
                                {#if student.admissionStatus === 'Admitted'}
                                    <span class="badge bg-success-subtle text-success border border-success px-2 py-1">Admitted</span>
                                {:else if student.admissionStatus === 'Cancelled'}
                                    <span class="badge bg-danger-subtle text-danger border border-danger px-2 py-1">Cancelled</span>
                                {:else}
                                    <span class="badge bg-warning-subtle text-warning border border-warning px-2 py-1">Pending</span>
                                {/if}
                            </td>
                            <td class="text-nowrap">
                                <div class="fw-semibold text-dark">{student.fullName}</div>
                            </td>
                            <td class="text-muted text-nowrap" style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">{student.email}</td>
                            <td class="text-muted small text-nowrap">{student.contactNumber || '—'}</td>
                            <td class="text-muted small text-nowrap">{student.city || '—'}</td>
                            <td class="text-nowrap">
                                <span class="badge bg-light text-dark border px-2 py-1">
                                    {student.formType}
                                </span>
                            </td>
                            <td class="pe-4 text-nowrap">
                                <span class="badge bg-info-subtle text-info border px-2 py-1">
                                    {student.admissionType}
                                </span>
                            </td>
                            {#if data.department.hodScope === 'college'}
                            <td class="text-muted small pe-4 text-nowrap">{student.branchName}</td>
                            {/if}
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="11" class="text-center py-5 text-muted">
                                <div class="mb-2 fs-4">
                                    <i class="bi bi-inbox text-muted opacity-50"></i>
                                </div>
                                <div>No students match your selection criteria.</div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        
        <!-- Footer info -->
        <div class="card-footer bg-white border-top text-muted small py-3">
            Showing {filteredCount} of {totalStudentsCount} students in your department.
        </div>
    </div>
</div>

{#if showModal}
    <div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5); z-index: 1050;">
        <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
            <div class="modal-content shadow border-0">
                <div class="modal-header bg-light border-0 py-3">
                    <h5 class="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                        <i class="bi bi-layout-three-columns text-primary"></i>
                        Configure Excel Columns
                    </h5>
                    <button type="button" class="btn-close" onclick={() => showModal = false}></button>
                </div>
                <div class="modal-body p-4" style="max-height: calc(100vh - 200px); overflow-y: auto;">
                    <div class="alert alert-info border-0 bg-light-primary text-primary small mb-4">
                        <i class="bi bi-info-circle-fill me-2"></i>
                        Choose which student profile and application fields to include in your Excel sheet. Your selection is automatically saved as your template.
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-secondary" onclick={() => selectedFields = allFields.map(f => f.key)}>
                                Select All
                            </button>
                            <button type="button" class="btn btn-outline-secondary" onclick={() => selectedFields = []}>
                                Deselect All
                            </button>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick={resetToDefault}>
                            Reset to System Default
                        </button>
                    </div>

                    <div class="row g-4">
                        <!-- Col 1: Static Fields -->
                        <div class="col-md-4 border-end">
                            <h6 class="fw-bold small text-secondary text-uppercase tracking-wider mb-3">
                                <i class="bi bi-person-badge-fill me-1"></i> Static Profile
                            </h6>
                            <div class="pe-2" style="max-height: 350px; overflow-y: auto;">
                                {#each staticFields as field}
                                    <div class="form-check py-2 border-bottom border-light">
                                        <input type="checkbox" class="form-check-input" id="field_{field.key}" value={field.key} bind:group={selectedFields}>
                                        <label class="form-check-label small fw-semibold text-dark cursor-pointer" for="field_{field.key}">
                                            {field.label}
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <!-- Col 2: Student JSONB Profile Fields -->
                        <div class="col-md-4 border-end">
                            <h6 class="fw-bold small text-secondary text-uppercase tracking-wider mb-3">
                                <i class="bi bi-person-lines-fill me-1"></i> Student Info
                            </h6>
                            <div class="pe-2" style="max-height: 350px; overflow-y: auto;">
                                {#each profileFields as field}
                                    <div class="form-check py-2 border-bottom border-light">
                                        <input type="checkbox" class="form-check-input" id="field_{field.key}" value={field.key} bind:group={selectedFields}>
                                        <label class="form-check-label small fw-semibold text-dark cursor-pointer" for="field_{field.key}">
                                            {field.label.replace('Profile: ', '')}
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <!-- Col 3: Custom Application Fields -->
                        <div class="col-md-4">
                            <h6 class="fw-bold small text-secondary text-uppercase tracking-wider mb-3">
                                <i class="bi bi-list-nested me-1"></i> Form Fields
                            </h6>
                            <div>
                                {#if dynamicFields.length === 0}
                                    <div class="text-center py-4">
                                        <i class="bi bi-file-earmark-text text-muted fs-3 mb-2 d-block"></i>
                                        <span class="text-muted small">No custom form fields are active.</span>
                                    </div>
                                {:else}
                                    <div style="max-height: 350px; overflow-y: auto;" class="pe-2">
                                        {#each dynamicFields as field}
                                            <div class="form-check py-2 border-bottom border-light">
                                                <input type="checkbox" class="form-check-input" id="field_{field.key}" value={field.key} bind:group={selectedFields}>
                                                <label class="form-check-label small fw-semibold text-dark cursor-pointer" for="field_{field.key}">
                                                    {field.label.replace('Form Field: ', '')}
                                                </label>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-light border-0 py-3">
                    <button type="button" class="btn btn-sm btn-secondary px-3" onclick={() => showModal = false}>Cancel</button>
                    <button type="button" class="btn btn-sm btn-success px-4" onclick={saveTemplate}>
                        Save Template & Apply
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .fs-7 {
        font-size: 0.75rem;
    }
    .cursor-pointer {
        cursor: pointer;
    }
</style>
