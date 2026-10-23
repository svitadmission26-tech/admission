<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { DateTime } from 'luxon'; // Will need to install luxon
    import { toastStore } from '$lib/stores/toastStore';

    export let data: PageData;
    export let form: ActionData;

    $: if (form?.message) {
        if (form.success) {
            toastStore.success(form.message);
        } else {
            toastStore.error(form.message);
        }
    }

    let showAddYearModal = false;
    let showEditYearModal = false;
    let showDeleteYearModal = false;

    let showAddCycleModal = false;
    let showEditCycleModal = false;
    let showDeleteCycleModal = false;

    let currentAcademicYear = writable({ id: '', name: '', short_code: '', start_date: '', end_date: '', is_active: false });
    let currentAdmissionCycle = writable({
        id: '',
        academic_year_id: '',
        name: '',
        start_date: '',
        end_date: '',
        is_active: false
    });

    function openEditYearModal(year: { id: string; name: string; short_code?: string; start_date: string; end_date: string; is_active: boolean }) {
        currentAcademicYear.set({
            ...year,
            short_code: year.short_code || '',
            start_date: DateTime.fromISO(year.start_date).toISODate() || '',
            end_date: DateTime.fromISO(year.end_date).toISODate() || ''
        });
        showEditYearModal = true;
    }

    function openDeleteYearModal(year: { id: string; name: string }) {
        currentAcademicYear.set(year as any);
        showDeleteYearModal = true;
    }

    function openAddCycleModal(academicYearId: string) {
        currentAdmissionCycle.set({ ...$currentAdmissionCycle, academic_year_id: academicYearId });
        showAddCycleModal = true;
    }

    function openEditCycleModal(cycle: { id: string; academic_year_id: string; name: string; start_date: string; end_date: string; is_active: boolean }) {
        currentAdmissionCycle.set({
            ...cycle,
            start_date: DateTime.fromISO(cycle.start_date).toISODate() || '',
            end_date: DateTime.fromISO(cycle.end_date).toISODate() || ''
        });
        showEditCycleModal = true;
    }

    function openDeleteCycleModal(cycle: { id: string; name: string }) {
        currentAdmissionCycle.set(cycle);
        showDeleteCycleModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Academic Calendar Management</h1>

    <button class="btn btn-primary mb-3" on:click={() => (showAddYearModal = true)}>Add New Academic Year</button>

    {#if data.academicYears.length > 0}
        {#each data.academicYears as year}
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5>{year.name} [{year.short_code || 'No Code'}] ({year.start_date.split('T')[0]} to {year.end_date.split('T')[0]}) {#if year.is_active}<span class="badge bg-success">Active</span>{/if}</h5>
                    <div>
                        <button class="btn btn-sm btn-info me-2" on:click={() => openEditYearModal(year)}>Edit Year</button>
                        <button class="btn btn-sm btn-danger me-2" on:click={() => openDeleteYearModal(year)}>Delete Year</button>
                        <button class="btn btn-sm btn-success" on:click={() => openAddCycleModal(year.id)}>Add Cycle</button>
                    </div>
                </div>
                <div class="card-body">
                    <h6>Admission Cycles:</h6>
                    {#if year.admission_cycles && year.admission_cycles.length > 0}
                        <ul class="list-group">
                            {#each year.admission_cycles as cycle}
                                <li class="list-group-item d-flex justify-content-between align-items-center">
                                    {cycle.name} ({cycle.start_date.split('T')[0]} to {cycle.end_date.split('T')[0]}) {#if cycle.is_active}<span class="badge bg-primary">Active</span>{/if}
                                    <div>
                                        <button class="btn btn-sm btn-info me-2" on:click={() => openEditCycleModal(cycle)}>Edit</button>
                                        <button class="btn btn-sm btn-danger" on:click={() => openDeleteCycleModal(cycle)}>Delete</button>
                                    </div>
                                </li>
                            {/each}
                        </ul>
                    {:else}
                        <p>No admission cycles for this year.</p>
                    {/if}
                </div>
            </div>
        {/each}
    {:else}
        <p>No academic years found. Add one!</p>
    {/if}
</div>

<!-- Add Academic Year Modal -->
<div class="modal" tabindex="-1" style="display: {showAddYearModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Academic Year</h5>
                <button type="button" class="btn-close" on:click={() => (showAddYearModal = false)}></button>
            </div>
            <form method="POST" action="?/createAcademicYear" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showAddYearModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="add-year-name" class="form-label">Year Name</label>
                        <input type="text" class="form-control" id="add-year-name" name="name" placeholder="e.g. 2025-2026" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-year-code" class="form-label">Short Code (for ID generation)</label>
                        <input type="text" class="form-control" id="add-year-code" name="short_code" placeholder="e.g. 25" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-year-start-date" class="form-label">Start Date</label>
                        <input type="date" class="form-control" id="add-year-start-date" name="start_date" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-year-end-date" class="form-label">End Date</label>
                        <input type="date" class="form-control" id="add-year-end-date" name="end_date" required />
                    </div>
                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="add-year-is-active" name="is_active" />
                        <label class="form-check-label" for="add-year-is-active">Is Active</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddYearModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Year</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Academic Year Modal -->
<div class="modal" tabindex="-1" style="display: {showEditYearModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Academic Year</h5>
                <button type="button" class="btn-close" on:click={() => (showEditYearModal = false)}></button>
            </div>
            <form method="POST" action="?/updateAcademicYear" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showEditYearModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentAcademicYear.id} />
                    <div class="mb-3">
                        <label for="edit-year-name" class="form-label">Year Name</label>
                        <input type="text" class="form-control" id="edit-year-name" name="name" bind:value={$currentAcademicYear.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-year-code" class="form-label">Short Code</label>
                        <input type="text" class="form-control" id="edit-year-code" name="short_code" bind:value={$currentAcademicYear.short_code} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-year-start-date" class="form-label">Start Date</label>
                        <input type="date" class="form-control" id="edit-year-start-date" name="start_date" bind:value={$currentAcademicYear.start_date} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-year-end-date" class="form-label">End Date</label>
                        <input type="date" class="form-control" id="edit-year-end-date" name="end_date" bind:value={$currentAcademicYear.end_date} required />
                    </div>
                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="edit-year-is-active" name="is_active" bind:checked={$currentAcademicYear.is_active} />
                        <label class="form-check-label" for="edit-year-is-active">Is Active</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditYearModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete Academic Year Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteYearModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Academic Year</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteYearModal = false)}></button>
            </div>
            <form method="POST" action="?/deleteAcademicYear" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showDeleteYearModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentAcademicYear.id} />
                    <p>Are you sure you want to delete academic year <strong>{$currentAcademicYear.name}</strong>? This will also delete all associated admission cycles.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteYearModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Add Admission Cycle Modal -->
<div class="modal" tabindex="-1" style="display: {showAddCycleModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Admission Cycle</h5>
                <button type="button" class="btn-close" on:click={() => (showAddCycleModal = false)}></button>
            </div>
            <form method="POST" action="?/createAdmissionCycle" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showAddCycleModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="academic_year_id" value={$currentAdmissionCycle.academic_year_id} />
                    <div class="mb-3">
                        <label for="add-cycle-name" class="form-label">Cycle Name</label>
                        <input type="text" class="form-control" id="add-cycle-name" name="name" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-cycle-start-date" class="form-label">Start Date</label>
                        <input type="date" class="form-control" id="add-cycle-start-date" name="start_date" required />
                    </div>
                    <div class="mb-3">
                        <label for="add-cycle-end-date" class="form-label">End Date</label>
                        <input type="date" class="form-control" id="add-cycle-end-date" name="end_date" required />
                    </div>
                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="add-cycle-is-active" name="is_active" />
                        <label class="form-check-label" for="add-cycle-is-active">Is Active</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddCycleModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Cycle</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Admission Cycle Modal -->
<div class="modal" tabindex="-1" style="display: {showEditCycleModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Admission Cycle</h5>
                <button type="button" class="btn-close" on:click={() => (showEditCycleModal = false)}></button>
            </div>
            <form method="POST" action="?/updateAdmissionCycle" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showEditCycleModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentAdmissionCycle.id} />
                    <input type="hidden" name="academic_year_id" value={$currentAdmissionCycle.academic_year_id} />
                    <div class="mb-3">
                        <label for="edit-cycle-name" class="form-label">Cycle Name</label>
                        <input type="text" class="form-control" id="edit-cycle-name" name="name" bind:value={$currentAdmissionCycle.name} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-cycle-start-date" class="form-label">Start Date</label>
                        <input type="date" class="form-control" id="edit-cycle-start-date" name="start_date" bind:value={$currentAdmissionCycle.start_date} required />
                    </div>
                    <div class="mb-3">
                        <label for="edit-cycle-end-date" class="form-label">End Date</label>
                        <input type="date" class="form-control" id="edit-cycle-end-date" name="end_date" bind:value={$currentAdmissionCycle.end_date} required />
                    </div>
                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="edit-cycle-is-active" name="is_active" bind:checked={$currentAdmissionCycle.is_active} />
                        <label class="form-check-label" for="edit-cycle-is-active">Is Active</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditCycleModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete Admission Cycle Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteCycleModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Admission Cycle</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteCycleModal = false)}></button>
            </div>
            <form method="POST" action="?/deleteAdmissionCycle" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showDeleteCycleModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentAdmissionCycle.id} />
                    <p>Are you sure you want to delete admission cycle <strong>{$currentAdmissionCycle.name}</strong>?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteCycleModal = false)}>Cancel</button>
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