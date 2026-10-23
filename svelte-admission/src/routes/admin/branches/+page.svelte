<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { getBranchDisplayCode } from '$lib/utils/display_helpers';

    export let data: PageData;
    export let form: ActionData;

    let selectedCourseId = '';

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false;

    let currentBranch = writable({
        id: '',
        name: '',
        code: '',
        collegeid_code: '',
        course_id: '',
        intake_capacity: 0
    });

    $: filteredBranches = selectedCourseId
        ? data.branches.filter(b => b.course_id === selectedCourseId)
        : data.branches;

    function openEditModal(branch: any) {
        currentBranch.set({
            id: branch.id,
            name: branch.name,
            code: branch.code,
            collegeid_code: branch.collegeid_code || '',
            course_id: branch.course_id,
            intake_capacity: branch.intake_capacity || 0
        });
        showEditModal = true;
    }

    function openDeleteModal(branch: any) {
        currentBranch.set(branch);
        showDeleteModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Branches</h1>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="d-flex justify-content-between align-items-center mb-3">
        <button class="btn btn-primary" on:click={() => (showAddModal = true)}>Add New Branch</button>
        <div style="width: 300px;">
            <select class="form-select" bind:value={selectedCourseId}>
                <option value="">All Courses</option>
                {#each data.courses as course}
                    <option value={course.id}>{course.name}</option>
                {/each}
            </select>
        </div>
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Branch Name</th>
                            <th>Code</th>
                            <th>Enrollment Code</th>
                            <th>Course</th>
                            <th>College</th>
                            <th>Intake Capacity</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredBranches as branch}
                            <tr>
                                <td>{branch.name}</td>
                                <td>{getBranchDisplayCode(branch.name, branch.code)}</td>
                                <td><code>{branch.collegeid_code || '-'}</code></td>
                                <td>{branch.courses?.name}</td>
                                <td>{branch.courses?.colleges?.name}</td>
                                <td>{branch.intake_capacity || 0}</td>
                                <td>
                                    <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(branch)}>Edit</button>
                                    <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(branch)}>Delete</button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Add Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Branch</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)} aria-label="Close"></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { showAddModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-course-id" class="form-label">Course</label>
                        <select class="form-select" id="add-course-id" name="course_id" required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name} ({course.colleges?.name})</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="add-name" class="form-label">Branch Name</label>
                        <input type="text" class="form-control" id="add-name" name="name" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-code" class="form-label">Branch Code</label>
                        <input type="text" class="form-control" id="add-code" name="code" />
                    </div>
                    <div class="mb-3">
                        <label for="add-collegeid-code" class="form-label">Enrollment Code (CollegeID)</label>
                        <input type="text" class="form-control" id="add-collegeid-code" name="collegeid_code" />
                        <div class="form-text">Used for CollegeID/Enrollment generation (e.g., CE). If left empty, this part will be empty in the Enrollment Number.</div>
                    </div>
                    <div class="mb-3">
                        <label for="add-intake-capacity" class="form-label">Intake Capacity</label>
                        <input type="number" class="form-control" id="add-intake-capacity" name="intake_capacity" value="0" min="0" />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Branch</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Branch</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)} aria-label="Close"></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { showEditModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentBranch.id} />
                    <div class="mb-3">
                        <label for="edit-course-id" class="form-label">Course</label>
                        <select class="form-select" id="edit-course-id" name="course_id" bind:value={$currentBranch.course_id} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name} ({course.colleges?.name})</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="edit-name" class="form-label">Branch Name</label>
                        <input type="text" class="form-control" id="edit-name" name="name" bind:value={$currentBranch.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-code" class="form-label">Branch Code</label>
                        <input type="text" class="form-control" id="edit-code" name="code" bind:value={$currentBranch.code} />
                    </div>
                    <div class="mb-3">
                        <label for="edit-collegeid-code" class="form-label">Enrollment Code (CollegeID)</label>
                        <input type="text" class="form-control" id="edit-collegeid-code" name="collegeid_code" bind:value={$currentBranch.collegeid_code} />
                        <div class="form-text">Used for CollegeID/Enrollment generation (e.g., CE). If left empty, this part will be empty in the Enrollment Number.</div>
                    </div>
                    <div class="mb-3">
                        <label for="edit-intake-capacity" class="form-label">Intake Capacity</label>
                        <input type="number" class="form-control" id="edit-intake-capacity" name="intake_capacity" bind:value={$currentBranch.intake_capacity} min="0" />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Branch</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)} aria-label="Close"></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { showDeleteModal = false; return async ({update}) => {await update();} }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentBranch.id} />
                    <p>Are you sure you want to delete the branch <strong>{$currentBranch.name}</strong>?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
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