<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let selectedCollegeId = $state('');
    let selectedCourseId = $state('');
    let selectedYearId = $state('');
    let selectedPaymentType = $state('');
    let selectedAdmissionType = $state('');
    let searchTerm = $state('');
    let addPaymentType = $state('');

    // Reset course when college changes
    $effect(() => {
        if (selectedCollegeId) {
            selectedCourseId = '';
        }
    });

    // Reset admission type when payment type is not tuition_fee
    $effect(() => {
        if (selectedPaymentType !== 'tuition_fee') {
            selectedAdmissionType = '';
        }
    });

    let showAddModal = $state(false);
    let showEditModal = $state(false);

    let filteredCourses = $derived(
        selectedCollegeId 
            ? data.courses.filter((c: any) => c.college_id === selectedCollegeId)
            : data.courses
    );

    let filteredSequences = $derived(data.sequences.filter((s: any) => {
        const matchesCollege = !selectedCollegeId || s.college_id === selectedCollegeId;
        const matchesCourse = !selectedCourseId || s.course_id === selectedCourseId;
        const matchesYear = !selectedYearId || s.academic_year_id === selectedYearId;
        const matchesType = !selectedPaymentType || s.payment_type === selectedPaymentType;
        const matchesAdmissionType = !selectedAdmissionType || s.admission_type === selectedAdmissionType;
        
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term || 
            s.prefix.toLowerCase().includes(term) || 
            s.colleges?.name?.toLowerCase().includes(term) ||
            s.courses?.name?.toLowerCase().includes(term);

        return matchesCollege && matchesCourse && matchesYear && matchesType && matchesAdmissionType && matchesSearch;
    }));

    let currentSequence = writable({
        id: '',
        college_id: '',
        course_id: '',
        academic_year_id: '',
        payment_type: '',
        admission_type: 'Regular',
        prefix: '',
        current_sequence: 0,
        colleges: { name: '' },
        courses: { name: '' },
        academic_years: { name: '' }
    });

    let foundSequence = $derived(data.sequences.find((s: any) => 
        s.college_id === selectedCollegeId && 
        s.course_id === selectedCourseId &&
        s.academic_year_id === selectedYearId &&
        s.payment_type === selectedPaymentType &&
        (!selectedPaymentType || selectedPaymentType !== 'tuition_fee' || s.admission_type === selectedAdmissionType)
    ));

    function openCreateModal() {
        addPaymentType = '';
        showAddModal = true;
    }

    function openEditModal(sequence: any) {
        currentSequence.set(sequence);
        showEditModal = true;
    }

    function getPaymentTypeLabel(value: string): string {
        const found = data.paymentTypes?.find(p => p.value === value);
        return found ? found.label : value;
    }

    function getPreviewNumber(prefix: string, seq: number): string {
        return `${prefix}${String(seq + 1).padStart(4, '0')}`;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Receipt Sequence Management</h1>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-header">Filter by Configuration</div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md">
                    <label class="form-label">College</label>
                    <select class="form-select" bind:value={selectedCollegeId}>
                        <option value="">All Colleges</option>
                        {#each data.colleges as college}
                            <option value={college.id}>{college.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md">
                    <label class="form-label">Academic Year</label>
                    <select class="form-select" bind:value={selectedYearId}>
                        <option value="">All Years</option>
                        {#each data.academicYears as year}
                            <option value={year.id}>{year.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md">
                    <label class="form-label">Payment Type</label>
                    <select class="form-select" bind:value={selectedPaymentType}>
                        <option value="">All Types</option>
                        {#each data.paymentTypes as pt}
                            <option value={pt.value}>{pt.label}</option>
                        {/each}
                    </select>
                </div>
                {#if selectedPaymentType === 'tuition_fee'}
                <div class="col-md">
                    <label class="form-label">Admission Type</label>
                    <select class="form-select" bind:value={selectedAdmissionType}>
                        <option value="">All Admission Types</option>
                        {#each data.admissionTypes as at}
                            <option value={at.value}>{at.label}</option>
                        {/each}
                    </select>
                </div>
                {/if}
                <div class="col-md">
                    <label class="form-label">Course</label>
                    <select class="form-select" bind:value={selectedCourseId}>
                        <option value="">All Courses</option>
                        {#each filteredCourses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-md-12">
                    <div class="input-group">
                        <span class="input-group-text"><i class="bi bi-search"></i></span>
                        <input type="text" class="form-control" placeholder="Search by prefix, college or course name..." bind:value={searchTerm}>
                    </div>
                </div>
            </div>
        </div>
    </div>

    {#if filteredSequences.length > 0}
        <div class="card">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <span>Receipt Sequences ({filteredSequences.length} of {data.sequences.length})</span>
                <button class="btn btn-sm btn-primary" onclick={openCreateModal}>
                    <i class="bi bi-plus-circle"></i> Add New
                </button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>College</th>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Payment Type</th>
                                <th>Admission Type</th>
                                <th>Prefix</th>
                                <th>Current Seq</th>
                                <th>Preview</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredSequences as seq}
                                <tr class={foundSequence?.id === seq.id ? 'table-primary border-3 border-primary' : ''}>
                                    <td>{seq.colleges?.name || 'N/A'}</td>
                                    <td>{seq.courses?.name || 'N/A'}</td>
                                    <td>{seq.academic_years?.name || 'N/A'}</td>
                                    <td>
                                        <span class="badge bg-info">{getPaymentTypeLabel(seq.payment_type)}</span>
                                    </td>
                                    <td>
                                        <span class="badge bg-secondary">{seq.admission_type || 'Regular'}</span>
                                    </td>
                                    <td><code>{seq.prefix}</code></td>
                                    <td>{seq.current_sequence}</td>
                                    <td><small class="text-muted">{getPreviewNumber(seq.prefix, seq.current_sequence)}</small></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-primary me-1" onclick={() => openEditModal(seq)}>
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <form method="POST" action="?/reset" use:enhance class="d-inline">
                                            <input type="hidden" name="id" value={seq.id} />
                                            <button type="submit" class="btn btn-sm btn-outline-warning" 
                                                    onclick={(e) => { if(!confirm('Reset sequence to 0?')) e.preventDefault(); }}>
                                                <i class="bi bi-arrow-counterclockwise"></i>
                                            </button>
                                        </form>
                                        <form method="POST" action="?/delete" use:enhance class="d-inline">
                                            <input type="hidden" name="id" value={seq.id} />
                                            <button type="submit" class="btn btn-sm btn-outline-danger"
                                                    onclick={(e) => { if(!confirm('Delete this sequence?')) e.preventDefault(); }}>
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    {:else}
        <div class="card">
            <div class="card-body text-center py-5">
                <i class="bi bi-receipt fs-1 text-muted"></i>
                <p class="lead text-muted mt-2">No receipt sequences configured yet.</p>
                <button class="btn btn-primary" onclick={openCreateModal}>
                    <i class="bi bi-plus-circle"></i> Create First Sequence
                </button>
            </div>
        </div>
    {/if}
</div>

<!-- Add Modal -->
{#if showAddModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create Receipt Sequence</h5>
                <button type="button" class="btn-close" onclick={() => showAddModal = false}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { showAddModal = false; return async ({update}) => {await update();}; }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-college" class="form-label">College</label>
                        <select class="form-select" id="add-college" name="college_id" bind:value={selectedCollegeId} required>
                            <option value="">Select College</option>
                            {#each data.colleges as college}
                                <option value={college.id}>{college.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="add-course" class="form-label">Course (Optional)</label>
                        <select class="form-select" id="add-course" name="course_id">
                            <option value="">No Specific Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                        <div class="form-text">Leave empty for generic course receipt numbering</div>
                    </div>

                    <div class="mb-3">
                        <label for="add-year" class="form-label">Academic Year</label>
                        <select class="form-select" id="add-year" name="academic_year_id" required>
                            <option value="">Select Year</option>
                            {#each data.academicYears as year}
                                <option value={year.id}>{year.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="add-type" class="form-label">Payment Type</label>
                        <select class="form-select" id="add-type" name="payment_type" bind:value={addPaymentType} required>
                            <option value="">Select Type</option>
                            {#each data.paymentTypes as pt}
                                <option value={pt.value}>{pt.label}</option>
                            {/each}
                        </select>
                    </div>

                    {#if addPaymentType === 'tuition_fee'}
                    <div class="mb-3">
                        <label for="add-admission-type" class="form-label">Admission Type</label>
                        <select class="form-select" id="add-admission-type" name="admission_type" required>
                            {#each data.admissionTypes as at}
                                <option value={at.value}>{at.label}</option>
                            {/each}
                        </select>
                    </div>
                    {/if}

                    <div class="mb-3">
                        <label for="add-prefix" class="form-label">Receipt Prefix</label>
                        <input type="text" class="form-control" id="add-prefix" name="prefix" 
                               value="REC-" placeholder="e.g., REC-, APP-, PROV-" required />
                        <div class="form-text">The prefix will be used for all receipt numbers</div>
                    </div>

                    <div class="mb-3">
                        <label for="add-seq" class="form-label">Starting Sequence</label>
                        <input type="number" class="form-control" id="add-seq" name="current_sequence" 
                               value="0" min="0" required />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => showAddModal = false}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Create</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}

<!-- Edit Modal -->
{#if showEditModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Receipt Sequence</h5>
                <button type="button" class="btn-close" onclick={() => showEditModal = false}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { showEditModal = false; return async ({update}) => {await update();}; }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentSequence.id} />

                    <div class="alert alert-secondary">
                        <strong>Configuration:</strong><br>
                        College: {$currentSequence.colleges?.name || 'N/A'}<br>
                        Year: {$currentSequence.academic_years?.name || 'N/A'}<br>
                        Type: {getPaymentTypeLabel($currentSequence.payment_type)}<br>
                        {#if $currentSequence.payment_type === 'tuition_fee'}
                        Admission Type: {$currentSequence.admission_type || 'Regular'}
                        {/if}
                    </div>

                    <div class="mb-3">
                        <label for="edit-prefix" class="form-label">Receipt Prefix</label>
                        <input type="text" class="form-control" id="edit-prefix" name="prefix" 
                               bind:value={$currentSequence.prefix} required />
                    </div>

                    <div class="mb-3">
                        <label for="edit-seq" class="form-label">Current Sequence Number</label>
                        <input type="number" class="form-control" id="edit-seq" name="current_sequence" 
                               bind:value={$currentSequence.current_sequence} min="0" required />
                        <div class="form-text text-warning">
                            <i class="bi bi-exclamation-triangle"></i>
                            Warning: Changing this manually can cause duplicate receipt numbers!
                        </div>
                    </div>

                    <div class="alert alert-info">
                        <strong>Preview:</strong> {getPreviewNumber($currentSequence.prefix, $currentSequence.current_sequence)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick={() => showEditModal = false}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Update</button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}
