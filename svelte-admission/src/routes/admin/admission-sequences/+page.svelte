<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';

    export let data: PageData;
    export let form: ActionData;

    let selectedCollegeId = '';
    let selectedCourseId = '';
    let selectedYearId = '';
    let selectedAdmissionType = 'Regular';
    const admissionTypes = ['Regular', 'D2D', 'C2D'];

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false; // Optional, maybe not needed for this workflow but good to keep

    let currentSequence = writable({
        id: '',
        college_id: '',
        course_id: '',
        academic_year_id: '',
        admission_type: 'Regular',
        prefix: '',
        current_sequence: 0,
        colleges: { name: '' },
        courses: { name: '' },
        academic_years: { name: '' }
    });

    // Reactive finder
    $: foundSequence = data.sequences.find(s => 
        s.college_id === selectedCollegeId && 
        s.course_id === selectedCourseId && 
        s.academic_year_id === selectedYearId &&
        (s.admission_type || 'Regular') === selectedAdmissionType
    );

    function openCreateModal() {
        // Pre-fill with selection
        /* Note: Add modal binds to form inputs directly usually, or we can use store */
        showAddModal = true;
    }

    function openEditModal(sequence: any) {
        currentSequence.set(sequence);
        showEditModal = true;
    }

    function handleReset(id: string) {
        if(!confirm('Are you sure you want to reset the sequence number to 0?')) return;
        // The form action handles the rest
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Admission Sequence Management</h1>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-header">Manage Sequence Context</div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label">College</label>
                    <select class="form-select" bind:value={selectedCollegeId}>
                        <option value="">Select College...</option>
                        {#each data.colleges as college}
                            <option value={college.id}>{college.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label">Course</label>
                    <select class="form-select" bind:value={selectedCourseId}>
                        <option value="">Select Course...</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Academic Year</label>
                    <select class="form-select" bind:value={selectedYearId}>
                        <option value="">Select Year...</option>
                        {#each data.academicYears as year}
                            <option value={year.id}>{year.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Admission Type</label>
                    <select class="form-select" bind:value={selectedAdmissionType}>
                        {#each admissionTypes as admissionType}
                            <option value={admissionType}>{admissionType}</option>
                        {/each}
                    </select>
                </div>
            </div>
        </div>
    </div>

    {#if selectedCollegeId && selectedCourseId && selectedYearId}
        <div class="card">
            <div class="card-header bg-light">
                Sequence Status
            </div>
            <div class="card-body text-center">
                {#if foundSequence}
                    <h3 class="display-6 text-primary mb-3">
                        {foundSequence.prefix}<span class="text-dark">{foundSequence.current_sequence}</span>
                    </h3>
                    <p class="text-muted">Current Sequence ID: {foundSequence.id}</p>
                    <p class="text-muted">Admission Type: {foundSequence.admission_type || 'Regular'}</p>
                    
                    <div class="d-flex justify-content-center gap-3">
                        <button class="btn btn-info" on:click={() => openEditModal(foundSequence)}>
                            <i class="bi bi-pencil-square"></i> Edit / Update
                        </button>
                        
                        <form method="POST" action="?/reset" use:enhance>
                            <input type="hidden" name="id" value={foundSequence.id} />
                            <button type="submit" class="btn btn-warning" on:click|preventDefault={(e) => { if(confirm('Reset sequence to 0?')) e.target.form.requestSubmit(); }}>
                                <i class="bi bi-arrow-counterclockwise"></i> Reset to 0
                            </button>
                        </form>

                        <form method="POST" action="?/delete" use:enhance>
                            <input type="hidden" name="id" value={foundSequence.id} />
                            <button type="submit" class="btn btn-danger" on:click|preventDefault={(e) => { if(confirm('Delete this sequence configuration?')) e.target.form.requestSubmit(); }}>
                                <i class="bi bi-trash"></i> Delete
                            </button>
                        </form>
                    </div>
                {:else}
                    <div class="py-4">
                        <p class="lead text-muted">No sequence configuration found for this selection.</p>
                        <button class="btn btn-success btn-lg" on:click={openCreateModal}>
                            <i class="bi bi-plus-circle"></i> Create Sequence
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="alert alert-info text-center">
            Please select College, Course, and Academic Year to manage sequences.
        </div>
    {/if}
</div>

<!-- Add Sequence Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create New Sequence</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { showAddModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <!-- Hidden inputs for context -->
                    <input type="hidden" name="college_id" value={selectedCollegeId} />
                    <input type="hidden" name="course_id" value={selectedCourseId} />
                    <input type="hidden" name="academic_year_id" value={selectedYearId} />
                    <input type="hidden" name="admission_type" value={selectedAdmissionType} />

                    <div class="alert alert-secondary">
                        Creating for:<br>
                        <strong>College:</strong> {data.colleges.find(c => c.id === selectedCollegeId)?.name}<br>
                        <strong>Course:</strong> {data.courses.find(c => c.id === selectedCourseId)?.name}<br>
                        <strong>Year:</strong> {data.academicYears.find(y => y.id === selectedYearId)?.name}<br>
                        <strong>Admission Type:</strong> {selectedAdmissionType}
                    </div>

                    <div class="mb-3">
                        <label for="add-prefix" class="form-label">Prefix</label>
                        <input type="text" class="form-control" id="add-prefix" name="prefix" placeholder="e.g., ADM-2026-CS-" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-current-sequence" class="form-label">Starting Sequence Number</label>
                        <input type="number" class="form-control" id="add-current-sequence" name="current_sequence" value="0" min="0" required />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-success">Create</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Sequence Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Update Sequence</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { showEditModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentSequence.id} />
                    <div class="mb-3">
                        <label for="edit-admission-type" class="form-label">Admission Type</label>
                        <select class="form-select" id="edit-admission-type" name="admission_type" bind:value={$currentSequence.admission_type} required>
                            {#each admissionTypes as admissionType}
                                <option value={admissionType}>{admissionType}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="edit-prefix" class="form-label">Prefix</label>
                        <input type="text" class="form-control" id="edit-prefix" name="prefix" bind:value={$currentSequence.prefix} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-current-sequence" class="form-label">Current Sequence Number</label>
                        <input type="number" class="form-control" id="edit-current-sequence" name="current_sequence" bind:value={$currentSequence.current_sequence} min="0" required />
                        <div class="form-text text-danger">Warning: Changing this manually can cause collisions if not careful.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Update</button>
                </div>
            </form>
        </div>
    </div>
</div>