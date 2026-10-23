<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false;

    let currentCourse = writable({
        id: '',
        college_id: '',
        name: '',
        code: '',
        collegeid_code: '',
        duration_years: 0,
        intake_capacity: 0,
        colleges: { name: '' } // For displaying college name
    });

    function openEditModal(course: { id: string; college_id: string; name: string; code: string; collegeid_code: string; duration_years: number; intake_capacity: number; colleges: { name: string } } | any) {
        currentCourse.set(course);
        showEditModal = true;
    }

    function openDeleteModal(course: { id: string; name: string } | any) {
        currentCourse.set(course);
        showDeleteModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Courses</h1>

    <button class="btn btn-primary mb-3" on:click={() => (showAddModal = true)}>Add New Course</button>

    {#if data.courses.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Code</th>
                                                <th>Enrollment Code</th>
                                                <th>College</th>
                                                <th>Duration (Years)</th>
                                                <th>Intake Capacity</th>
                                                <th>Actions</th>
                                            </tr>                </thead>
                <tbody>
                    {#each data.courses as course}
                        <tr>
                            <td>{course.name}</td>
                            <td>{course.code}</td>
                            <td><code>{course.collegeid_code || '-'}</code></td>
                            <td>{course.colleges?.name || 'N/A'}</td>
                            <td>{course.duration_years}</td>
                            <td>{course.intake_capacity || 0}</td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(course)}>Edit</button>
                                <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(course)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No courses found. Add one!</p>
    {/if}
</div>

<!-- Add Course Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Course</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { 
                showAddModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-college-id" class="form-label">College</label>
                        <select class="form-select" id="add-college-id" name="college_id" required>
                            <option value="">Select College</option>
                            {#each data.colleges as college}
                                <option value={college.id}>{college.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="add-name" class="form-label">Course Name</label>
                        <input type="text" class="form-control" id="add-name" name="name" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-code" class="form-label">Course Code</label>
                        <input type="text" class="form-control" id="add-code" name="code" />
                    </div>
                    <div class="mb-3">
                        <label for="add-collegeid-code" class="form-label">Enrollment Code (CollegeID)</label>
                        <input type="text" class="form-control" id="add-collegeid-code" name="collegeid_code" />
                        <div class="form-text">Used for CollegeID/Enrollment generation (e.g., BE). Falls back to Course Code if empty.</div>
                    </div>
                    <div class="mb-3">
                        <label for="add-duration-years" class="form-label">Duration (Years)</label>
                        <input type="number" class="form-control" id="add-duration-years" name="duration_years" required min="1" />
                    </div>
                    <div class="mb-3">
                        <label for="add-intake-capacity" class="form-label">Intake Capacity</label>
                        <input type="number" class="form-control" id="add-intake-capacity" name="intake_capacity" value="0" min="0" />
                        <div class="form-text">Leave 0 if capacity is defined at Branch level.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Course</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Course Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Course</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { 
                showEditModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentCourse.id} />
                    <div class="mb-3">
                        <label for="edit-college-id" class="form-label">College</label>
                        <select class="form-select" id="edit-college-id" name="college_id" bind:value={$currentCourse.college_id} required>
                            <option value="">Select College</option>
                            {#each data.colleges as college}
                                <option value={college.id}>{college.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="edit-name" class="form-label">Course Name</label>
                        <input type="text" class="form-control" id="edit-name" name="name" bind:value={$currentCourse.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-code" class="form-label">Course Code</label>
                        <input type="text" class="form-control" id="edit-code" name="code" bind:value={$currentCourse.code} />
                    </div>
                    <div class="mb-3">
                        <label for="edit-collegeid-code" class="form-label">Enrollment Code (CollegeID)</label>
                        <input type="text" class="form-control" id="edit-collegeid-code" name="collegeid_code" bind:value={$currentCourse.collegeid_code} />
                        <div class="form-text">Used for CollegeID/Enrollment generation (e.g., BE). Falls back to Course Code if empty.</div>
                    </div>
                    <div class="mb-3">
                        <label for="edit-duration-years" class="form-label">Duration (Years)</label>
                        <input type="number" class="form-control" id="edit-duration-years" name="duration_years" bind:value={$currentCourse.duration_years} required min="1" />
                    </div>
                    <div class="mb-3">
                        <label for="edit-intake-capacity" class="form-label">Intake Capacity</label>
                        <input type="number" class="form-control" id="edit-intake-capacity" name="intake_capacity" bind:value={$currentCourse.intake_capacity} min="0" />
                        <div class="form-text">Leave 0 if capacity is defined at Branch level.</div>
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

<!-- Delete Course Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Course</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentCourse.id} />
                    <p>Are you sure you want to delete course <strong>{$currentCourse.name}</strong>?</p>
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
        background-color: rgba(0, 0, 0, 0.5); /* Dim the background */
    }
</style>