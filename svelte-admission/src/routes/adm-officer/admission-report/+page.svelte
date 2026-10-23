<script lang="ts">
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();

  // Available Fields Config
  const fieldOptions = [
    { key: 'student_name', label: 'Student Name', category: 'Basic', default: true },
    { key: 'contact', label: 'Contact Number', category: 'Basic', default: true },
    { key: 'email', label: 'Email ID', category: 'Basic', default: true },
    { key: 'college_id', label: 'College ID (Enrollment No)', category: 'Academic', default: true },
    { key: 'acpc_merit_number', label: 'ACPC / Merit Rank Number', category: 'Academic', default: true },
    { key: 'acpc_application_number', label: 'ACPC / Seat / Application Number', category: 'Academic', default: true },
    { key: 'admission_no', label: 'Admission Number', category: 'Academic', default: true },
    { key: 'photo_url', label: 'Photo URL', category: 'Basic', default: true },
    { key: 'dob', label: 'Date of Birth', category: 'Personal', default: true },
    { key: 'address', label: 'Address', category: 'Personal', default: true },
    { key: 'department', label: 'College / Department', category: 'Academic', default: true },
    { key: 'course', label: 'Course', category: 'Academic', default: true },
    { key: 'branch', label: 'Branch', category: 'Academic', default: true },
    { key: 'admission_type', label: 'Admission Type', category: 'Academic', default: true },
    { key: 'status', label: 'Admission Status', category: 'Academic', default: true },
    { key: 'gender', label: 'Gender', category: 'Personal', default: false },
    { key: 'category', label: 'Category', category: 'Personal', default: false },
    { key: 'father_name', label: 'Father Name', category: 'Personal', default: false },
    { key: 'father_contact', label: 'Father Contact', category: 'Personal', default: false },
    { key: 'mother_name', label: 'Mother Name', category: 'Personal', default: false },
    { key: 'form_type', label: 'Form Type', category: 'Academic', default: true },
    { key: 'submitted_date', label: 'Submitted Date', category: 'Academic', default: false }
  ];

  // Extended Standard Profile Fields List
  const baseProfileFields = [
    { key: 'father_occupation', label: 'Father Occupation', category: 'Parent / Guardian' },
    { key: 'mother_occupation', label: 'Mother Occupation', category: 'Parent / Guardian' },
    { key: 'guardian_name', label: 'Guardian Name', category: 'Parent / Guardian' },
    { key: 'guardian_contact', label: 'Guardian Contact', category: 'Parent / Guardian' },
    { key: 'caste', label: 'Caste', category: 'Personal & Caste' },
    { key: 'sub_caste', label: 'Sub-Caste', category: 'Personal & Caste' },
    { key: 'religion', label: 'Religion', category: 'Personal & Caste' },
    { key: 'nationality', label: 'Nationality', category: 'Personal & Caste' },
    { key: 'blood_group', label: 'Blood Group', category: 'Personal & Caste' },
    { key: 'aadhar_number', label: 'Aadhaar Card Number', category: 'Identity & Govt IDs' },
    { key: 'abc_id', label: 'ABC ID / APAAR ID', category: 'Identity & Govt IDs' },
    { key: 'bank_name', label: 'Bank Name', category: 'Bank Details' },
    { key: 'bank_account_number', label: 'Bank Account Number', category: 'Bank Details' },
    { key: 'ifsc_code', label: 'Bank IFSC Code', category: 'Bank Details' },
    { key: 'ssc_percentage', label: 'SSC Marks / Percentage', category: 'Academic Qualification' },
    { key: 'hsc_percentage', label: 'HSC Marks / Percentage', category: 'Academic Qualification' },
  ];

  // Extended Standard Application Form Fields List
  const baseAppFields = [
    { key: 'gcas_id', label: 'GCAS Application ID', category: 'Application / Entrance' },
    { key: 'gujcet_roll_no', label: 'GUJCET Roll Number', category: 'Application / Entrance' },
    { key: 'gujcet_percentile', label: 'GUJCET Percentile / Marks', category: 'Application / Entrance' },
    { key: 'jee_application_no', label: 'JEE Main App Number', category: 'Application / Entrance' },
    { key: 'jee_percentile', label: 'JEE Main Percentile', category: 'Application / Entrance' },
  ];

  // Merge DB dynamic fields
  let profileFieldsCombined = $derived(() => {
    const existingKeys = new Set(baseProfileFields.map(f => f.key));
    const extra = (data.dbProfileFields || []).filter((pf: any) => !existingKeys.has(pf.key));
    return [...baseProfileFields, ...extra];
  });

  let appFieldsCombined = $derived(() => {
    const existingKeys = new Set(baseAppFields.map(f => f.key));
    const extra = (data.dbAppFields || []).filter((af: any) => !existingKeys.has(af.key));
    return [...baseAppFields, ...extra];
  });

  // Selections State
  let selectedCourseIds = $state<string[]>((data.courses || []).map((c: any) => c.id));
  let selectedBranchIds = $state<string[]>((data.branches || []).map((b: any) => b.id));
  let selectedFormTypes = $state<string[]>([]);
  let excludeProvisional = $state<boolean>(false); // DEFAULT: Include all admitted
  let admissionTypeFilter = $state<string>('all'); // DEFAULT: All admission modes
  let admissionStatusFilter = $state<'admitted' | 'approved' | 'all'>('admitted');
  let paymentStatusFilter = $state<'paid' | 'tuition_paid' | 'app_fee_paid' | 'all'>('all'); // DEFAULT: All admitted students

  let selectedFieldKeys = $state<string[]>(fieldOptions.filter(f => f.default).map(f => f.key));
  let sheetMode = $state<'branch' | 'course' | 'single'>('branch');
  let includeSummary = $state<boolean>(true);
  let searchQuery = $state<string>('');
  let isDownloading = $state<boolean>(false);

  // Drawer & Accordion State
  let isDrawerOpen = $state<boolean>(false);
  let drawerSearchQuery = $state<string>('');
  let drawerTab = $state<'all' | 'profile' | 'application'>('all');
  let activeAccordionTab = $state<'profile' | 'application'>('profile');

  // Filtered fields for drawer search
  let filteredDrawerProfileFields = $derived(
    profileFieldsCombined().filter(f =>
      f.label.toLowerCase().includes(drawerSearchQuery.toLowerCase()) ||
      f.key.toLowerCase().includes(drawerSearchQuery.toLowerCase())
    )
  );

  let filteredDrawerAppFields = $derived(
    appFieldsCombined().filter(f =>
      f.label.toLowerCase().includes(drawerSearchQuery.toLowerCase()) ||
      f.key.toLowerCase().includes(drawerSearchQuery.toLowerCase())
    )
  );

  // Base Filtering (Global criteria ONLY: admission type, provisional switch, form types, status, payment status, search)
  let baseFilteredStudents = $derived(
    (data.allStudents || []).filter((student: any) => {
      // Exclude Provisional filter (Default: Exclude)
      if (excludeProvisional && student.isProv) {
        return false;
      }
      // Admission Type Filter (Default: Regular)
      if (admissionTypeFilter !== 'all' && admissionTypeFilter !== '') {
        if ((student.admissionType || 'Regular').toLowerCase() !== admissionTypeFilter.toLowerCase()) {
          return false;
        }
      }
      // Specific Form Types Selection Filter
      if (selectedFormTypes.length > 0 && !selectedFormTypes.includes(student.formType)) {
        return false;
      }
      // Admission Status filter
      if (admissionStatusFilter === 'admitted' && student.admissionStatus !== 'Admitted' && student.appStatus !== 'approved') {
        return false;
      }
      if (admissionStatusFilter === 'approved' && student.appStatus !== 'approved') {
        return false;
      }
      // Fee Payment Status filter
      if (paymentStatusFilter === 'paid' && !student.hasAnyPaid) {
        return false;
      }
      if (paymentStatusFilter === 'tuition_paid' && !student.hasTuitionPaid) {
        return false;
      }
      if (paymentStatusFilter === 'app_fee_paid' && !student.hasAppFeePaid) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = student.studentName.toLowerCase().includes(q);
        const matchEmail = student.email.toLowerCase().includes(q);
        const matchId = student.collegeId.toLowerCase().includes(q);
        const matchBranch = student.branch.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchId && !matchBranch) {
          return false;
        }
      }
      return true;
    })
  );

  // 1. Reactive Filtering across ALL student records (including Course & Branch checkboxes)
  let filteredStudents = $derived(
    baseFilteredStudents.filter((student: any) => {
      // Course filter
      if (selectedCourseIds.length > 0 && !selectedCourseIds.includes(student.courseId)) {
        return false;
      }
      // Branch filter
      if (selectedBranchIds.length > 0 && student.branchId && !selectedBranchIds.includes(student.branchId)) {
        return false;
      }
      return true;
    })
  );

  // 2. Reactive counts for branches & courses based on base filtered records (before branch/course checkbox filtering)
  let filteredBranchCounts = $derived(() => {
    const counts: Record<string, number> = {};
    baseFilteredStudents.forEach((student: any) => {
      if (student.branchId) {
        counts[student.branchId] = (counts[student.branchId] || 0) + 1;
      }
    });
    return counts;
  });

  let filteredCourseCounts = $derived(() => {
    const counts: Record<string, number> = {};
    baseFilteredStudents.forEach((student: any) => {
      if (student.courseId) {
        counts[student.courseId] = (counts[student.courseId] || 0) + 1;
      }
    });
    return counts;
  });

  // Table DOM rendering slice (first 200 items for max performance)
  let displayedTableStudents = $derived(filteredStudents.slice(0, 200));

  // Toggle handlers for Course
  function toggleCourse(courseId: string) {
    if (selectedCourseIds.includes(courseId)) {
      selectedCourseIds = selectedCourseIds.filter(id => id !== courseId);
      const courseBranches = data.branches.filter((b: any) => b.course_id === courseId).map((b: any) => b.id);
      selectedBranchIds = selectedBranchIds.filter(id => !courseBranches.includes(id));
    } else {
      selectedCourseIds = [...selectedCourseIds, courseId];
      const courseBranches = data.branches.filter((b: any) => b.course_id === courseId).map((b: any) => b.id);
      selectedBranchIds = Array.from(new Set([...selectedBranchIds, ...courseBranches]));
    }
  }

  function selectAllCourses() {
    selectedCourseIds = data.courses.map((c: any) => c.id);
    selectedBranchIds = data.branches.map((b: any) => b.id);
  }

  function deselectAllCourses() {
    selectedCourseIds = [];
    selectedBranchIds = [];
  }

  // Toggle handlers for Branch
  function toggleBranch(branchId: string, courseId: string) {
    if (selectedBranchIds.includes(branchId)) {
      selectedBranchIds = selectedBranchIds.filter(id => id !== branchId);
    } else {
      selectedBranchIds = [...selectedBranchIds, branchId];
      if (!selectedCourseIds.includes(courseId)) {
        selectedCourseIds = [...selectedCourseIds, courseId];
      }
    }
  }

  function toggleAllBranchesForCourse(courseId: string) {
    const courseBranchIds = data.branches.filter((b: any) => b.course_id === courseId).map((b: any) => b.id);
    const allSelected = courseBranchIds.every((id: string) => selectedBranchIds.includes(id));

    if (allSelected) {
      selectedBranchIds = selectedBranchIds.filter((id: string) => !courseBranchIds.includes(id));
    } else {
      selectedBranchIds = Array.from(new Set([...selectedBranchIds, ...courseBranchIds]));
      if (!selectedCourseIds.includes(courseId)) {
        selectedCourseIds = [...selectedCourseIds, courseId];
      }
    }
  }

  // Form Type handlers
  function toggleFormType(type: string) {
    if (selectedFormTypes.includes(type)) {
      selectedFormTypes = selectedFormTypes.filter(t => t !== type);
    } else {
      selectedFormTypes = [...selectedFormTypes, type];
    }
  }

  function selectAllFormTypes() {
    selectedFormTypes = [...data.formTypes];
  }

  function clearFormTypes() {
    selectedFormTypes = [];
  }

  // Field handlers
  function toggleField(key: string) {
    if (selectedFieldKeys.includes(key)) {
      selectedFieldKeys = selectedFieldKeys.filter(k => k !== key);
    } else {
      selectedFieldKeys = [...selectedFieldKeys, key];
    }
  }

  function selectAllFields() {
    selectedFieldKeys = Array.from(new Set([
      ...fieldOptions.map(f => f.key),
      ...profileFieldsCombined().map(f => f.key),
      ...appFieldsCombined().map(f => f.key)
    ]));
  }

  function deselectAllFields() {
    selectedFieldKeys = [];
  }

  function resetDefaultFields() {
    selectedFieldKeys = fieldOptions.filter(f => f.default).map(f => f.key);
  }

  function selectAllProfileFields() {
    const keys = profileFieldsCombined().map(f => f.key);
    selectedFieldKeys = Array.from(new Set([...selectedFieldKeys, ...keys]));
  }

  function deselectAllProfileFields() {
    const keys = new Set(profileFieldsCombined().map(f => f.key));
    selectedFieldKeys = selectedFieldKeys.filter(k => !keys.has(k));
  }

  function selectAllAppFields() {
    const keys = appFieldsCombined().map(f => f.key);
    selectedFieldKeys = Array.from(new Set([...selectedFieldKeys, ...keys]));
  }

  function deselectAllAppFields() {
    const keys = new Set(appFieldsCombined().map(f => f.key));
    selectedFieldKeys = selectedFieldKeys.filter(k => !keys.has(k));
  }

  // Download Trigger
  function triggerExport() {
    if (selectedBranchIds.length === 0 && selectedCourseIds.length === 0) {
      alert('Please select at least one Course or Branch to export.');
      return;
    }
    if (selectedFieldKeys.length === 0) {
      alert('Please select at least one Field/Column to include in the report.');
      return;
    }

    isDownloading = true;

    const params = new URLSearchParams();
    if (selectedCourseIds.length < data.courses.length) {
      params.set('courses', selectedCourseIds.join(','));
    }
    if (selectedBranchIds.length < data.branches.length) {
      params.set('branches', selectedBranchIds.join(','));
    }
    if (selectedFormTypes.length > 0) {
      params.set('form_types', selectedFormTypes.join(','));
    }

    params.set('exclude_provisional', excludeProvisional ? 'true' : 'false');
    params.set('admission_type', admissionTypeFilter);
    params.set('admission_status', admissionStatusFilter);
    params.set('payment_status', paymentStatusFilter);

    params.set('fields', selectedFieldKeys.join(','));
    params.set('sheet_mode', sheetMode);
    params.set('include_summary', includeSummary ? 'true' : 'false');
    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    }

    const exportUrl = `/adm-officer/admission-report/export?${params.toString()}`;
    window.location.href = exportUrl;

    setTimeout(() => {
      isDownloading = false;
    }, 2500);
  }
</script>

<div class="container-fluid py-4 px-4">
  <!-- Header Banner -->
  <div class="card border-0 bg-primary text-white shadow-sm mb-4">
    <div class="card-body p-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="badge bg-white text-primary fw-bold">Admission Officer</span>
          <span class="badge bg-warning text-dark"><i class="bi bi-shield-check me-1"></i> Admitted & Paid Only</span>
          <span class="badge bg-light text-dark border"><i class="bi bi-tag me-1"></i> {admissionTypeFilter} Admission</span>
          {#if excludeProvisional}
            <span class="badge bg-light text-dark border"><i class="bi bi-funnel me-1"></i> Provisional Excluded</span>
          {/if}
        </div>
        <h2 class="h3 fw-bold mb-1"><i class="bi bi-file-earmark-person-fill me-2"></i>Admitted Students Admission Report</h2>
        <p class="mb-0 opacity-75 fs-6">
          Custom multi-sheet Excel report generator with admission type filters, provisional filters, and branch/course sheet separation.
        </p>
      </div>
      <div>
        <button 
          class="btn btn-light btn-lg text-primary fw-bold shadow-sm px-4 d-flex align-items-center gap-2"
          onclick={triggerExport}
          disabled={isDownloading}
        >
          {#if isDownloading}
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Generating Excel...
          {:else}
            <i class="bi bi-download fs-5"></i> Export Excel Report
          {/if}
        </button>
      </div>
    </div>
  </div>

  <!-- KPI Summary Cards -->
  <div class="row g-3 mb-4">
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 border-start border-4 border-primary">
        <div class="card-body">
          <div class="text-muted small fw-semibold">Matching Admitted Students</div>
          <div class="fs-3 fw-bold text-dark mt-1">{filteredStudents.length}</div>
          <div class="small text-success mt-1"><i class="bi bi-person-check-fill me-1"></i> Matching selected criteria</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 border-start border-4 border-info">
        <div class="card-body">
          <div class="text-muted small fw-semibold">Admission Type Filter</div>
          <div class="fs-3 fw-bold text-dark mt-1 text-capitalize">{admissionTypeFilter}</div>
          <div class="small text-muted mt-1">Default: Regular Admission</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 border-start border-4 border-danger">
        <div class="card-body">
          <div class="text-muted small fw-semibold">Provisional Admissions</div>
          <div class="fs-3 fw-bold text-dark mt-1">{excludeProvisional ? 'EXCLUDED' : 'INCLUDED'}</div>
          <div class="small text-muted mt-1">{excludeProvisional ? 'Default setting active' : 'All form types shown'}</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 border-start border-4 border-warning">
        <div class="card-body">
          <div class="text-muted small fw-semibold">Excel Organization</div>
          <div class="fs-4 fw-bold text-dark text-capitalize mt-1">
            {sheetMode === 'branch' ? 'Sheets by Branch' : sheetMode === 'course' ? 'Sheets by Course' : 'Single Sheet'}
          </div>
          <div class="small text-muted mt-1">
            {includeSummary ? 'Includes summary sheet' : 'No summary sheet'}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Primary Filters Bar -->
  <div class="card border-0 shadow-sm mb-4 bg-white">
    <div class="card-body p-4">
      <div class="row g-3 align-items-center">
        <!-- Admission Type Filter (DEFAULT REGULAR) -->
        <div class="col-md-3">
          <div class="p-3 rounded border bg-light">
            <span class="form-label text-muted small fw-semibold mb-1 d-block">Admission Type:</span>
            <select class="form-select border-0 shadow-none bg-white fw-bold text-primary" bind:value={admissionTypeFilter}>
              <option value="Regular">Regular (Default)</option>
              <option value="D2D">D2D (Diploma to Degree)</option>
              <option value="C2D">C2D (Certificate to Degree)</option>
              {#each data.admissionTypes as type (type)}
                {#if type !== 'Regular' && type !== 'D2D' && type !== 'C2D'}
                  <option value={type}>{type}</option>
                {/if}
              {/each}
              <option value="all">All Admission Types</option>
            </select>
          </div>
        </div>

        <!-- Exclude Provisional Switch -->
        <div class="col-md-3">
          <div class="p-3 rounded border bg-light d-flex align-items-center justify-content-between h-100">
            <div>
              <div class="fw-bold text-dark mb-0">Exclude Provisional</div>
              <div class="text-muted small">Default: Excluded</div>
            </div>
            <div class="form-check form-switch ms-2">
              <input 
                class="form-check-input fs-4 cursor-pointer" 
                type="checkbox" 
                role="switch"
                id="excludeProvSwitch"
                bind:checked={excludeProvisional}
              />
            </div>
          </div>
        </div>

        <!-- Admission Status Filter -->
        <div class="col-md-3">
          <div class="p-3 rounded border bg-light">
            <span class="form-label text-muted small fw-semibold mb-1 d-block">Admission Status:</span>
            <select class="form-select border-0 shadow-none bg-white fw-semibold" bind:value={admissionStatusFilter}>
              <option value="admitted">Admitted Students Only (Default)</option>
              <option value="approved">Approved Applications Only</option>
              <option value="all">All Statuses (Admitted & Approved)</option>
            </select>
          </div>
        </div>

        <!-- Fee Payment Status Filter -->
        <div class="col-md-3">
          <div class="p-3 rounded border bg-light">
            <span class="form-label text-muted small fw-semibold mb-1 d-block">Fee Payment Status:</span>
            <select class="form-select border-0 shadow-none bg-white fw-semibold" bind:value={paymentStatusFilter}>
              <option value="paid">Fee Paid (Tuition/App Fee) (Default)</option>
              <option value="tuition_paid">Tuition Fee Paid Only</option>
              <option value="app_fee_paid">Application Fee Paid Only</option>
              <option value="all">All Payment Statuses</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Specific Form Types Selection Collapsible / Checkboxes -->
      <div class="mt-3 pt-3 border-top">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="form-label text-dark fw-bold mb-0">
            <i class="bi bi-tags me-2 text-primary"></i>Filter Specific Form Types:
            {#if selectedFormTypes.length > 0}
              <span class="badge bg-primary ms-1">{selectedFormTypes.length} Selected</span>
            {:else}
              <span class="badge bg-secondary ms-1">All Form Types</span>
            {/if}
          </span>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick={selectAllFormTypes}>Select All</button>
            <button class="btn btn-outline-secondary" onclick={clearFormTypes}>Clear (All)</button>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 pt-1">
          {#each data.formTypes as ft (ft)}
            {@const isProvType = data.provFormTypes?.includes(ft) || ft.toLowerCase().includes('provisional')}
            <label class="btn btn-sm {selectedFormTypes.includes(ft) ? 'btn-primary' : 'btn-outline-secondary'} d-flex align-items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                class="form-check-input mt-0 d-none"
                checked={selectedFormTypes.includes(ft)}
                onchange={() => toggleFormType(ft)}
              />
              <span>{ft}</span>
              {#if isProvType}
                <span class="badge bg-warning text-dark" style="font-size: 0.65rem;">Prov</span>
              {/if}
            </label>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="row g-4">
    <!-- Left Column: Selections & Excel Config -->
    <div class="col-lg-5">
      <!-- Excel Workbook Configuration -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white py-3 border-bottom-0">
          <h5 class="card-title fw-bold mb-0 text-dark"><i class="bi bi-file-earmark-spreadsheet me-2 text-success"></i>Excel Workbook Layout</h5>
        </div>
        <div class="card-body pt-0">
          <span class="form-label text-muted small fw-semibold mb-2 d-block">Sheet Separation Mode:</span>
          <div class="d-flex flex-column gap-2 mb-3">
            <label class="border rounded p-3 d-flex align-items-center gap-3 cursor-pointer {sheetMode === 'branch' ? 'border-primary bg-light' : 'bg-white'}">
              <input type="radio" name="sheetMode" value="branch" bind:group={sheetMode} class="form-check-input mt-0" />
              <div>
                <div class="fw-bold text-dark mb-0">Individual Sheet per Branch <span class="badge bg-primary ms-1">Recommended</span></div>
                <div class="text-muted small">Creates a separate worksheet tab for each selected Branch</div>
              </div>
            </label>
            <label class="border rounded p-3 d-flex align-items-center gap-3 cursor-pointer {sheetMode === 'course' ? 'border-primary bg-light' : 'bg-white'}">
              <input type="radio" name="sheetMode" value="course" bind:group={sheetMode} class="form-check-input mt-0" />
              <div>
                <div class="fw-bold text-dark mb-0">Individual Sheet per Course</div>
                <div class="text-muted small">Creates a separate worksheet tab for each selected Course</div>
              </div>
            </label>
            <label class="border rounded p-3 d-flex align-items-center gap-3 cursor-pointer {sheetMode === 'single' ? 'border-primary bg-light' : 'bg-white'}">
              <input type="radio" name="sheetMode" value="single" bind:group={sheetMode} class="form-check-input mt-0" />
              <div>
                <div class="fw-bold text-dark mb-0">Single Combined Sheet</div>
                <div class="text-muted small">Exports all admitted students into a single master worksheet tab</div>
              </div>
            </label>
          </div>

          <div class="form-check form-switch bg-light p-3 rounded border">
            <input class="form-check-input ms-0 me-2" type="checkbox" id="includeSummaryCheck" bind:checked={includeSummary} />
            <label class="form-check-input-label fw-semibold text-dark cursor-pointer" for="includeSummaryCheck">
              Include "All Admitted Students" Master Summary Sheet as 1st Tab
            </label>
          </div>
        </div>
      </div>

      <!-- Courses & Branches Selection -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center border-bottom-0">
          <h5 class="card-title fw-bold mb-0 text-dark"><i class="bi bi-diagram-3 me-2 text-primary"></i>Courses & Branches Selection</h5>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick={selectAllCourses}>Select All</button>
            <button class="btn btn-outline-secondary" onclick={deselectAllCourses}>Clear All</button>
          </div>
        </div>
        <div class="card-body pt-0" style="max-height: 480px; overflow-y: auto;">
          {#each data.courses as course (course.id)}
            {@const courseBranches = data.branches.filter((b: any) => b.course_id === course.id)}
            {@const allBranchSelected = courseBranches.every((b: any) => selectedBranchIds.includes(b.id))}
            {@const matchCourseCount = filteredCourseCounts()[course.id] || 0}
            <div class="border rounded mb-3 p-3 bg-light">
              <div class="d-flex justify-content-between align-items-center pb-2 mb-2 border-bottom">
                <div class="form-check mb-0">
                  <input
                    type="checkbox"
                    class="form-check-input"
                    id={`course-${course.id}`}
                    checked={selectedCourseIds.includes(course.id)}
                    onchange={() => toggleCourse(course.id)}
                  />
                  <label class="form-check-label fw-bold text-dark cursor-pointer" for={`course-${course.id}`}>
                    {course.name} ({course.code})
                  </label>
                </div>
                {#if courseBranches.length > 0}
                  <button 
                    class="btn btn-link btn-sm p-0 text-decoration-none" 
                    onclick={() => toggleAllBranchesForCourse(course.id)}
                  >
                    {allBranchSelected ? 'Deselect Branches' : 'Select All Branches'}
                  </button>
                {/if}
              </div>

              {#if courseBranches.length > 0}
                <div class="row g-2 ps-3">
                  {#each courseBranches as branch (branch.id)}
                    <div class="col-12">
                      <div class="form-check">
                        <input
                          type="checkbox"
                          class="form-check-input"
                          id={`branch-${branch.id}`}
                          checked={selectedBranchIds.includes(branch.id)}
                          onchange={() => toggleBranch(branch.id, course.id)}
                        />
                        <label class="form-check-label text-dark small cursor-pointer" for={`branch-${branch.id}`}>
                          {branch.name} <span class="text-muted">({branch.code})</span>
                        </label>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-muted small fst-italic ps-3">No specific branches defined for this course.</div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Field / Column Selection -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center border-bottom-0">
          <h5 class="card-title fw-bold mb-0 text-dark"><i class="bi bi-layout-three-columns me-2 text-info"></i>Student Fields to Export</h5>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick={selectAllFields}>All</button>
            <button class="btn btn-outline-secondary" onclick={resetDefaultFields}>Default</button>
            <button class="btn btn-outline-danger" onclick={deselectAllFields}>Clear</button>
          </div>
        </div>
        <div class="card-body pt-0">
          <p class="text-muted small mb-2">Check the fields you want to include as columns in the exported Excel sheets:</p>
          <div class="row g-2">
            {#each fieldOptions as field (field.key)}
              <div class="col-md-6">
                <div class="form-check py-1 px-2.5 rounded border bg-white h-100 d-flex align-items-center gap-2">
                  <input
                    type="checkbox"
                    class="form-check-input ms-1 my-0"
                    id={`field-${field.key}`}
                    checked={selectedFieldKeys.includes(field.key)}
                    onchange={() => toggleField(field.key)}
                  />
                  <label class="form-check-label text-dark small mb-0 cursor-pointer w-100" for={`field-${field.key}`}>
                    {field.label}
                  </label>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Section: Student Profile Fields (Accordion & Drawer Selector) -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center border-bottom-0">
          <div>
            <h5 class="card-title fw-bold mb-0 text-dark">
              <i class="bi bi-person-lines-fill me-2 text-primary"></i>Student Profile Fields
            </h5>
            <div class="text-muted small">Select additional profile or application form fields</div>
          </div>
          <button 
            class="btn btn-outline-primary btn-sm fw-bold d-flex align-items-center gap-1 shadow-sm px-3"
            onclick={() => isDrawerOpen = true}
          >
            <i class="bi bi-arrows-angle-expand"></i>
            <span>Expand as Drawer</span>
          </button>
        </div>

        <div class="card-body pt-0">
          <!-- Accordion View for Student Profile Fields & Application-Wise Fields -->
          <div class="accordion" id="fieldsAccordion">
            <!-- Panel 1: Student Profile Fields -->
            <div class="accordion-item border rounded mb-3 overflow-hidden">
              <h2 class="accordion-header" id="headingProfile">
                <button 
                  class="accordion-button {activeAccordionTab === 'profile' ? '' : 'collapsed'} fw-bold bg-light text-primary py-2 px-3" 
                  type="button" 
                  onclick={() => activeAccordionTab = activeAccordionTab === 'profile' ? 'application' : 'profile'}
                >
                  <i class="bi bi-person-badge me-2 fs-5"></i>
                  <span>Student Profile Fields</span>
                  <span class="badge bg-primary ms-auto me-2">
                    {profileFieldsCombined().filter(f => selectedFieldKeys.includes(f.key)).length} / {profileFieldsCombined().length} Selected
                  </span>
                </button>
              </h2>
              <div class="accordion-collapse collapse {activeAccordionTab === 'profile' ? 'show' : ''}">
                <div class="accordion-body p-2 bg-white">
                  <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                    <span class="small text-muted fw-semibold">Personal, Guardian, Identification & Bank fields:</span>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-xs btn-outline-primary" onclick={selectAllProfileFields}>Select All</button>
                      <button class="btn btn-xs btn-outline-secondary" onclick={deselectAllProfileFields}>Clear</button>
                    </div>
                  </div>
                  <div class="row g-2" style="max-height: 260px; overflow-y: auto;">
                    {#each profileFieldsCombined() as field (field.key)}
                      <div class="col-md-6">
                        <div class="form-check py-1 px-2.5 rounded border bg-light d-flex align-items-center gap-2 h-100">
                          <input
                            type="checkbox"
                            class="form-check-input ms-1 my-0"
                            id={`profile-field-${field.key}`}
                            checked={selectedFieldKeys.includes(field.key)}
                            onchange={() => toggleField(field.key)}
                          />
                          <label class="form-check-label text-dark small mb-0 cursor-pointer w-100" for={`profile-field-${field.key}`}>
                            {field.label}
                          </label>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>

            <!-- Panel 2: Application-Wise Fields -->
            <div class="accordion-item border rounded overflow-hidden">
              <h2 class="accordion-header" id="headingApp">
                <button 
                  class="accordion-button {activeAccordionTab === 'application' ? '' : 'collapsed'} fw-bold bg-light text-info py-2 px-3" 
                  type="button" 
                  onclick={() => activeAccordionTab = activeAccordionTab === 'application' ? 'profile' : 'application'}
                >
                  <i class="bi bi-file-earmark-text me-2 fs-5"></i>
                  <span>Application-Wise Fields</span>
                  <span class="badge bg-info text-dark ms-auto me-2">
                    {appFieldsCombined().filter(f => selectedFieldKeys.includes(f.key)).length} / {appFieldsCombined().length} Selected
                  </span>
                </button>
              </h2>
              <div class="accordion-collapse collapse {activeAccordionTab === 'application' ? 'show' : ''}">
                <div class="accordion-body p-2 bg-white">
                  <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                    <span class="small text-muted fw-semibold">Course form schemas, ACPC & Entrance exam fields:</span>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-xs btn-outline-info" onclick={selectAllAppFields}>Select All</button>
                      <button class="btn btn-xs btn-outline-secondary" onclick={deselectAllAppFields}>Clear</button>
                    </div>
                  </div>
                  <div class="row g-2" style="max-height: 260px; overflow-y: auto;">
                    {#each appFieldsCombined() as field (field.key)}
                      <div class="col-md-6">
                        <div class="form-check py-1 px-2.5 rounded border bg-light d-flex align-items-center gap-2 h-100">
                          <input
                            type="checkbox"
                            class="form-check-input ms-1 my-0"
                            id={`app-field-${field.key}`}
                            checked={selectedFieldKeys.includes(field.key)}
                            onchange={() => toggleField(field.key)}
                          />
                          <label class="form-check-label text-dark small mb-0 cursor-pointer w-100" for={`app-field-${field.key}`}>
                            {field.label}
                          </label>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Student Data Grid & Live Filter -->
    <div class="col-lg-7">
      <div class="card border-0 shadow-sm h-100">
        <div class="card-header bg-white py-3 border-bottom-0">
          <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
            <h5 class="card-title fw-bold mb-0 text-dark">
              <i class="bi bi-table me-2 text-primary"></i>Admitted & Paid Students Preview 
              <span class="badge bg-primary ms-1">{filteredStudents.length} Matching Total</span>
            </h5>
            <div class="input-group input-group-sm" style="max-width: 280px;">
              <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
              <input
                type="text"
                class="form-control"
                placeholder="Search name, email, college id..."
                bind:value={searchQuery}
              />
              {#if searchQuery}
                <button class="btn btn-outline-secondary" aria-label="Clear search" onclick={() => searchQuery = ''}>
                  <i class="bi bi-x"></i>
                </button>
              {/if}
            </div>
          </div>
        </div>

        <div class="card-body p-0">
          {#if filteredStudents.length === 0}
            <div class="p-5 text-center text-muted">
              <i class="bi bi-inbox fs-1 d-block mb-3 text-secondary opacity-50"></i>
              <h6 class="fw-bold">No Matching Students Found</h6>
              <p class="small mb-0">Try adjusting your admission type, provisional switch, form types, or payment status filters.</p>
            </div>
          {:else}
            <div class="table-responsive" style="max-height: 720px; overflow-y: auto;">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light sticky-top shadow-sm">
                  <tr>
                    <th class="ps-3" style="width: 50px;">Sr.</th>
                    <th>College ID</th>
                    <th>Student Details</th>
                    <th>Course & Branch</th>
                    <th>Type, Form & Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each displayedTableStudents as student (student.id)}
                    <tr>
                      <td class="ps-3 text-muted small">{student.srNo}</td>
                      <td>
                        <span class="badge bg-dark font-monospace px-2 py-1 fs-6">
                          {student.collegeId}
                        </span>
                        {#if student.admissionNo && student.admissionNo !== student.collegeId}
                          <div class="text-muted" style="font-size: 0.75rem;">Adm: {student.admissionNo}</div>
                        {/if}
                        {#if student.acpcMeritNo && student.acpcMeritNo !== '-'}
                          <div class="text-primary font-monospace" style="font-size: 0.75rem;">Merit: {student.acpcMeritNo}</div>
                        {/if}
                        {#if student.acpcAppNo && student.acpcAppNo !== '-'}
                          <div class="text-info font-monospace" style="font-size: 0.75rem;">ACPC: {student.acpcAppNo}</div>
                        {/if}
                      </td>
                      <td>
                        <div class="fw-bold text-dark">{student.studentName}</div>
                        <div class="text-muted small">
                          <i class="bi bi-envelope me-1"></i>{student.email}
                        </div>
                        {#if student.contact !== '-'}
                          <div class="text-muted small">
                            <i class="bi bi-telephone me-1"></i>{student.contact}
                          </div>
                        {/if}
                      </td>
                      <td>
                        <div class="fw-semibold text-primary">{student.course}</div>
                        <div class="badge bg-light text-dark border fw-normal">{student.branch}</div>
                      </td>
                      <td>
                        <div class="d-flex flex-column gap-1">
                          <div class="d-flex align-items-center gap-1">
                            <span class="badge bg-success">
                              <i class="bi bi-check-circle me-1"></i>{student.admissionStatus}
                            </span>
                            <span class="badge bg-dark">{student.admissionType}</span>
                          </div>
                          <div class="d-flex align-items-center gap-1">
                            <span class="badge bg-light text-dark border">{student.formType}</span>
                            {#if student.isProv}
                              <span class="badge bg-warning text-dark" style="font-size: 0.65rem;">Prov</span>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td>
                        <a 
                          href="/adm-officer/applications/{student.id}" 
                          class="btn btn-sm btn-outline-primary"
                          target="_blank"
                          title="View Application"
                        >
                          <i class="bi bi-eye"></i>
                        </a>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <div class="card-footer bg-white py-3 border-top d-flex justify-content-between align-items-center">
          <div class="text-muted small">
            Showing {displayedTableStudents.length} of {filteredStudents.length} total matching records. Export generates full Excel dataset.
          </div>
          <button 
            class="btn btn-primary fw-bold px-4"
            onclick={triggerExport}
            disabled={isDownloading}
          >
            <i class="bi bi-download me-2"></i> Download Excel (.xlsx)
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Slide-Over Side Drawer Modal for Full Field Selector -->
{#if isDrawerOpen}
  <div 
    class="offcanvas-backdrop fade show" 
    onclick={() => isDrawerOpen = false}
    role="button"
    tabindex="0"
    aria-label="Close drawer backdrop"
  ></div>
  <div class="drawer-container shadow-lg bg-white d-flex flex-column" role="dialog" aria-modal="true">
    <!-- Drawer Header -->
    <div class="drawer-header p-3 bg-primary text-white d-flex justify-content-between align-items-center">
      <div>
        <h5 class="fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-sliders"></i>
          Student Profile & Application Fields Selector
        </h5>
        <div class="small opacity-75">{selectedFieldKeys.length} total fields selected for export</div>
      </div>
      <button 
        type="button" 
        class="btn-close btn-close-white" 
        onclick={() => isDrawerOpen = false}
        aria-label="Close"
      ></button>
    </div>

    <!-- Drawer Search & Controls -->
    <div class="p-3 bg-light border-bottom">
      <div class="input-group mb-2">
        <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input
          type="text"
          class="form-control"
          placeholder="Search profile or application fields..."
          bind:value={drawerSearchQuery}
        />
        {#if drawerSearchQuery}
          <button class="btn btn-outline-secondary" onclick={() => drawerSearchQuery = ''}>
            <i class="bi bi-x"></i>
          </button>
        {/if}
      </div>

      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div class="btn-group btn-group-sm">
          <button 
            class="btn {drawerTab === 'all' ? 'btn-primary' : 'btn-outline-secondary'}"
            onclick={() => drawerTab = 'all'}
          >
            All ({profileFieldsCombined().length + appFieldsCombined().length})
          </button>
          <button 
            class="btn {drawerTab === 'profile' ? 'btn-primary' : 'btn-outline-secondary'}"
            onclick={() => drawerTab = 'profile'}
          >
            Profile ({profileFieldsCombined().length})
          </button>
          <button 
            class="btn {drawerTab === 'application' ? 'btn-primary' : 'btn-outline-secondary'}"
            onclick={() => drawerTab = 'application'}
          >
            Application ({appFieldsCombined().length})
          </button>
        </div>

        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick={selectAllFields}>Select All</button>
          <button class="btn btn-outline-secondary" onclick={resetDefaultFields}>Default Only</button>
          <button class="btn btn-outline-danger" onclick={deselectAllFields}>Clear All</button>
        </div>
      </div>
    </div>

    <!-- Drawer Body List -->
    <div class="drawer-body p-3 flex-grow-1 overflow-y-auto">
      {#if drawerTab === 'all' || drawerTab === 'profile'}
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
            <h6 class="fw-bold text-primary mb-0">
              <i class="bi bi-person-badge me-1"></i>Student Profile Fields
            </h6>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-xs btn-link text-decoration-none" onclick={selectAllProfileFields}>Select All Profile</button>
              <button class="btn btn-xs btn-link text-muted text-decoration-none" onclick={deselectAllProfileFields}>Deselect</button>
            </div>
          </div>
          <div class="row g-2">
            {#each filteredDrawerProfileFields as field (field.key)}
              <div class="col-md-6">
                <div class="p-2 rounded border bg-light d-flex align-items-center gap-2 cursor-pointer h-100">
                  <input
                    type="checkbox"
                    class="form-check-input ms-1 my-0"
                    id={`drawer-pf-${field.key}`}
                    checked={selectedFieldKeys.includes(field.key)}
                    onchange={() => toggleField(field.key)}
                  />
                  <label class="form-check-label text-dark small mb-0 cursor-pointer w-100" for={`drawer-pf-${field.key}`}>
                    {field.label}
                    <span class="badge bg-secondary-subtle text-dark border ms-1" style="font-size: 0.65rem;">{field.category}</span>
                  </label>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if drawerTab === 'all' || drawerTab === 'application'}
        <div>
          <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
            <h6 class="fw-bold text-info mb-0">
              <i class="bi bi-file-earmark-text me-1"></i>Application-Wise / Form Fields
            </h6>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-xs btn-link text-decoration-none" onclick={selectAllAppFields}>Select All Form</button>
              <button class="btn btn-xs btn-link text-muted text-decoration-none" onclick={deselectAllAppFields}>Deselect</button>
            </div>
          </div>
          <div class="row g-2">
            {#each filteredDrawerAppFields as field (field.key)}
              <div class="col-md-6">
                <div class="p-2 rounded border bg-light d-flex align-items-center gap-2 cursor-pointer h-100">
                  <input
                    type="checkbox"
                    class="form-check-input ms-1 my-0"
                    id={`drawer-af-${field.key}`}
                    checked={selectedFieldKeys.includes(field.key)}
                    onchange={() => toggleField(field.key)}
                  />
                  <label class="form-check-label text-dark small mb-0 cursor-pointer w-100" for={`drawer-af-${field.key}`}>
                    {field.label}
                    <span class="badge bg-info-subtle text-dark border ms-1" style="font-size: 0.65rem;">{field.category}</span>
                  </label>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Drawer Footer -->
    <div class="drawer-footer p-3 bg-light border-top d-flex justify-content-between align-items-center">
      <span class="text-muted small">
        <strong class="text-dark">{selectedFieldKeys.length}</strong> fields ready for Excel export
      </span>
      <button class="btn btn-primary fw-bold px-4" onclick={() => isDrawerOpen = false}>
        <i class="bi bi-check2-circle me-1"></i> Done & Apply Selection
      </button>
    </div>
  </div>
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }
  .btn-xs {
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
  }
  .drawer-container {
    position: fixed;
    top: 0;
    right: 0;
    width: 600px;
    max-width: 92vw;
    height: 100vh;
    z-index: 1060;
  }
  .offcanvas-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1050;
  }
</style>
