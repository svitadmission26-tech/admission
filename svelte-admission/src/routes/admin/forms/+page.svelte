<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { toastStore } from '$lib/stores/toastStore';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;
    export let form: ActionData;

    $: if (form?.message) {
        if (form.success) {
            toastStore.success(form.message);
        } else {
            toastStore.error(form.message);
        }
    }

    let showDeleteModal = false;
    let showCopyModal = false;

    let targetCopyValues = {
        source_id: '',
        target_course_id: '',
        target_cycle_id: '',
        target_form_type: 'Provisional'
    };

    let currentAdmissionForm = writable({
        id: '',
        course_id: '',
        cycle_id: '',
        form_type: 'Provisional',
        form_fee: 0,
        schema_json: '',
        is_enabled: true,
        courses: { name: '' },
        admission_cycles: { name: '' }
    });

    function openDeleteModal(form: any) {
        currentAdmissionForm.set({ ...form }); 
        showDeleteModal = true;
    }

    function openCopyModal(form: any) {
         currentAdmissionForm.set({ ...form });
        
        targetCopyValues = {
            source_id: form.id,
            target_course_id: form.course_id,
            target_cycle_id: form.cycle_id,
            target_form_type: form.form_type
        };
        showCopyModal = true;
    }

    function handleFilterChange() {
        const url = new URL($page.url);
        url.searchParams.set('academic_year_id', data.selectedYearId || '');
        url.searchParams.set('form_type', data.selectedFormType || 'all');
        url.searchParams.set('course_id', data.selectedCourseId || 'all');
        goto(url.toString());
    }
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="mb-0">Manage Admission Forms</h1>
        <a href="/admin/forms/new" class="btn btn-primary">Add New Admission Form</a>
    </div>

    <!-- Filters -->
    <div class="card mb-4 bg-light border">
        <div class="card-body py-2">
            <div class="row g-3 align-items-center">
                <div class="col-auto">
                    <label class="small fw-bold text-muted mb-0">Academic Year</label>
                    <select class="form-select form-select-sm" bind:value={data.selectedYearId} on:change={handleFilterChange}>
                        {#each data.academicYears as year}
                            <option value={year.id}>{year.name} {year.is_active ? '(Active)' : ''}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-auto">
                    <label class="small fw-bold text-muted mb-0">Course</label>
                    <select class="form-select form-select-sm" bind:value={data.selectedCourseId} on:change={handleFilterChange}>
                        <option value="all">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-auto">
                    <label class="small fw-bold text-muted mb-0">Form Type</label>
                    <select class="form-select form-select-sm" bind:value={data.selectedFormType} on:change={handleFilterChange}>
                        <option value="all">All Types</option>
                        {#each data.formTypes as ft}
                            <option value={ft.name}>{ft.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col text-end">
                    <span class="badge bg-secondary">{data.admissionForms.length} Forms Found</span>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Course</th>
                            <th>Admission Cycle</th>
                            <th>Type</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.admissionForms as form}
                            <tr>
                                <td>
                                    <span class="fw-bold">{form.courses?.name}</span><br>
                                    <small class="text-muted">{form.courses?.code}</small>
                                </td>
                                <td>{form.admission_cycles?.name} ({form.admission_cycles?.academic_years?.name})</td>
                                <td>
                                    <span class="badge bg-secondary">{form.form_type}</span>
                                    {#if form.is_enabled === false}
                                        <span class="badge bg-warning text-dark ms-1">Disabled</span>
                                    {/if}
                                </td>
                                <td>
                                    <a href="/admin/forms/{form.id}/edit" class="btn btn-sm btn-info me-2">Edit</a>
                                    <button class="btn btn-sm btn-secondary me-2" on:click={() => openCopyModal(form)}>Copy</button>
                                    <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(form)}>Delete</button>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="4" class="text-center py-5 text-muted">
                                    <i class="bi bi-info-circle mb-2 d-block fs-4"></i>
                                    No admission forms found for the selected filters.
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Delete Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Admission Form</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showDeleteModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentAdmissionForm.id} />
                    <p>Are you sure you want to delete the form for <strong>{$currentAdmissionForm.courses?.name}</strong>?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Copy Modal -->
<div class="modal" tabindex="-1" style="display: {showCopyModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Copy Admission Form</h5>
                <button type="button" class="btn-close" on:click={() => (showCopyModal = false)}></button>
            </div>
            <form method="POST" action="?/copy" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showCopyModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="source_id" value={targetCopyValues.source_id} />

                    <div class="alert alert-info">
                        <strong>Source Configuration:</strong><br>
                        Course: {$currentAdmissionForm.courses?.name}<br>
                        Cycle: {$currentAdmissionForm.admission_cycles?.name}<br>
                        Type: <span class="badge bg-secondary">{$currentAdmissionForm.form_type}</span><br>
                        Fee: ₹{$currentAdmissionForm.form_fee}
                    </div>
                    
                    <h6 class="mb-3">Target Configuration</h6>

                    <div class="mb-3">
                        <label for="copy-course-id" class="form-label">Target Course</label>
                        <select class="form-select" id="copy-course-id" name="target_course_id" bind:value={targetCopyValues.target_course_id} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="copy-cycle-id" class="form-label">Target Admission Cycle</label>
                        <select class="form-select" id="copy-cycle-id" name="target_cycle_id" bind:value={targetCopyValues.target_cycle_id} required>
                            <option value="">Select Cycle</option>
                            {#each data.admissionCycles as cycle}
                                {@const c = cycle as any}
                                <option value={cycle.id}>{cycle.name} ({c.academic_years?.name || 'N/A'})</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="copy-form-type" class="form-label">Target Form Type</label>
                        <select class="form-select" id="copy-form-type" name="target_form_type" bind:value={targetCopyValues.target_form_type} required>
                            {#if data.formTypes}
                                {#each data.formTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            {:else}
                                <option value="Provisional">Provisional</option>
                            {/if}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showCopyModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Copy & Create</button>
                </div>
            </form>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>