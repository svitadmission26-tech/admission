<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;
    export let form: ActionData;

    let showAdd = false;
</script>

<div class="container-fluid">
    <h1 class="mb-4">New Student Admission Management</h1>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="d-flex justify-content-between align-items-center mb-3">
        <button class="btn btn-primary" on:click={() => (showAdd = !showAdd)}>
            {showAdd ? 'Hide Form' : 'Add New Student Admission'}
        </button>
        <span class="text-muted">Total: {data.admissions.length}</span>
    </div>

    {#if showAdd}
        <div class="card mb-4">
            <div class="card-body">
                <form method="POST" action="?/create" use:enhance>
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label">Admission Number *</label>
                            <input class="form-control" name="admission_number" required />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Student Name *</label>
                            <input class="form-control" name="student_name" required />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Email</label>
                            <input class="form-control" type="email" name="email" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Phone</label>
                            <input class="form-control" name="phone" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Course</label>
                            <select class="form-select" name="course_id">
                                <option value="">-- Select --</option>
                                {#each data.courses as c}
                                    <option value={c.id}>{c.name} ({c.code})</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Branch</label>
                            <select class="form-select" name="branch_id">
                                <option value="">-- Select --</option>
                                {#each data.branches as b}
                                    <option value={b.id}>{b.name} ({b.code})</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Academic Year</label>
                            <select class="form-select" name="academic_year_id">
                                <option value="">-- Select --</option>
                                {#each data.years as y}
                                    <option value={y.id}>{y.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Admission Type</label>
                            <select class="form-select" name="admission_type">
                                <option>Regular</option>
                                <option>Provisional</option>
                                <option>Direct Second Year</option>
                                <option>MQ/NRI</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Admission Date</label>
                            <input class="form-control" type="date" name="admission_date" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Status</label>
                            <select class="form-select" name="status">
                                <option>Draft</option>
                                <option>Submitted</option>
                                <option>Verified</option>
                                <option>Approved</option>
                                <option>Cancelled</option>
                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label">Remarks</label>
                            <textarea class="form-control" name="remarks" rows="2"></textarea>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button type="submit" class="btn btn-success">Save</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <div class="table-responsive">
        <table class="table table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th>Admission No.</th>
                    <th>Student Name</th>
                    <th>Course</th>
                    <th>Branch</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {#each data.admissions as a}
                    <tr>
                        <td>{a.admission_number}</td>
                        <td>{a.student_name}</td>
                        <td>{a.courses?.name ?? '-'}</td>
                        <td>{a.branches?.name ?? '-'}</td>
                        <td>{a.admission_type}</td>
                        <td>
                            <span class="badge bg-secondary">{a.status}</span>
                        </td>
                        <td>{a.admission_date ?? '-'}</td>
                        <td>
                            <form method="POST" action="?/delete" use:enhance on:submit={() => confirm('Delete this record?')}>
                                <input type="hidden" name="id" value={a.id} />
                                <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                            </form>
                        </td>
                    </tr>
                {/each}
                {#if data.admissions.length === 0}
                    <tr>
                        <td colspan="8" class="text-center text-muted">No records found.</td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
