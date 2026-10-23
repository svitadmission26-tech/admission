<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { goto } from '$app/navigation';
    import { page as pageStore } from '$app/stores';

    export let data: PageData;
    export let form: ActionData;

    let showCreateModal = false;
    let showEditModal = false;
    let showDeleteModal = false;
    let showResetPasswordModal = false; // New state

    let newUser = writable({
        email: '',
        password: '',
        role: 'student',
        full_name: '',
        university_id: '',
        college_id: '',
        branch_id: '',
        hod_scope: 'branch'
    });

    let currentUser = writable({
        id: '',
        email: '',
        role: 'student',
        university_id: '',
        college_id: '',
        full_name: '',
        branch_id: '',
        hod_scope: 'branch'
    });
    
    // New store for password reset
    let resetPasswordData = writable({
        id: '',
        email: '',
        newPassword: ''
    });

    // Roles list
    const roles = [
        'student',
        'admin',
        'deo',
        'college_auth',
        'university_auth',
        'adm_officer',
        'fee_collector',
        'hod'
    ];

    // Filter state
    let searchEmail = data.filters?.searchEmail || '';
    let filterRole = data.filters?.filterRole || '';
    let filterUniversity = data.filters?.filterUniversity || '';
    let filterCollege = data.filters?.filterCollege || '';
    let pageSize = data.filters?.pageSize || 25;

    // React to data changes to update filters (e.g. back/forward navigation or reset)
    $: if (data.filters) {
        searchEmail = data.filters.searchEmail || '';
        filterRole = data.filters.filterRole || '';
        filterUniversity = data.filters.filterUniversity || '';
        filterCollege = data.filters.filterCollege || '';
        pageSize = data.filters.pageSize || 25;
    }

    // Filtered Users Logic (Now from server pagination)
    $: filteredUsers = data.users;

    // Reactive college options for filter based on selected university
    $: filterCollegeOptions = filterUniversity
        ? data.colleges.filter(c => c.university_id === filterUniversity)
        : data.colleges;

    // Filter colleges based on selected university in Edit/Create Modal
    $: filteredColleges = $currentUser.university_id 
        ? data.colleges.filter(c => c.university_id === $currentUser.university_id)
        : [];
    
    $: filteredNewColleges = $newUser.university_id
        ? data.colleges.filter(c => c.university_id === $newUser.university_id)
        : [];

    function getBranchCollegeId(b: any) {
        const c = Array.isArray(b.courses) ? b.courses[0] : b.courses;
        return c?.college_id;
    }
    
    function getBranchCourseName(b: any) {
        const c = Array.isArray(b.courses) ? b.courses[0] : b.courses;
        return c?.name || '';
    }

    // Filter branches based on selected college in Edit/Create Modal
    $: filteredBranches = $currentUser.college_id 
        ? data.branches.filter(b => getBranchCollegeId(b) === $currentUser.college_id)
        : data.branches;
    
    $: filteredNewBranches = $newUser.college_id
        ? data.branches.filter(b => getBranchCollegeId(b) === $newUser.college_id)
        : data.branches;

    $: totalPages = Math.ceil(data.totalCount / (data.filters?.pageSize || 25));
    $: currentPage = data.filters?.page || 1;

    function applyFilters() {
        const params = new URLSearchParams($pageStore.url.searchParams);
        params.set('page', '1');
        if (searchEmail) params.set('searchEmail', searchEmail); else params.delete('searchEmail');
        if (filterRole) params.set('filterRole', filterRole); else params.delete('filterRole');
        if (filterUniversity) params.set('filterUniversity', filterUniversity); else params.delete('filterUniversity');
        if (filterCollege) params.set('filterCollege', filterCollege); else params.delete('filterCollege');
        params.set('pageSize', pageSize.toString());
        goto(`?${params.toString()}`, { keepFocus: true });
    }

    function changePage(newPage: number) {
        const params = new URLSearchParams($pageStore.url.searchParams);
        params.set('page', newPage.toString());
        params.set('pageSize', pageSize.toString());
        goto(`?${params.toString()}`);
    }

    function resetFilters() {
        searchEmail = '';
        filterRole = '';
        filterUniversity = '';
        filterCollege = '';
        pageSize = 25;
        goto(`?page=1&pageSize=25`);
    }

    // Helper for pagination numbers
    function getPageNumbers(current: number, total: number) {
        const pages: (number | string)[] = [];
        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (current > 3) {
                pages.push('...');
            }
            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            if (current < total - 2) {
                pages.push('...');
            }
            pages.push(total);
        }
        return pages;
    }

    $: pageNumbers = getPageNumbers(currentPage, totalPages);

    function openCreateModal() {
        newUser.set({
            email: '',
            password: '',
            role: 'student',
            full_name: '',
            university_id: '',
            college_id: '',
            branch_id: '',
            hod_scope: 'branch'
        });
        showCreateModal = true;
    }

    function openEditModal(user: any) {
        currentUser.set({
            id: user.id,
            email: user.email,
            role: user.role,
            university_id: user.university_id || '',
            college_id: user.college_id || '',
            full_name: user.full_name || '',
            branch_id: user.branch_id || '',
            hod_scope: user.hod_scope || 'branch'
        });
        showEditModal = true;
    }

    function openDeleteModal(user: any) {
        currentUser.set(user);
        showDeleteModal = true;
    }

    function openResetPasswordModal(user: any) {
        resetPasswordData.set({
            id: user.id,
            email: user.email,
            newPassword: ''
        });
        showResetPasswordModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Users & Roles</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="d-flex justify-content-between align-items-center mb-3">
        <button class="btn btn-primary" on:click={openCreateModal}>Create New User</button>
    </div>

    <!-- Filters -->
    <div class="card mb-3">
        <div class="card-body">
            <div class="row g-3 align-items-end">
                <div class="col-md-3">
                    <label for="filter-email" class="form-label">Search Email/Name</label>
                    <input type="text" class="form-control" id="filter-email" placeholder="Search email or name..." bind:value={searchEmail} on:keydown={(e) => e.key === 'Enter' && applyFilters()}>
                </div>
                <div class="col-md-2">
                    <label for="filter-role" class="form-label">Filter by Role</label>
                    <select class="form-select" id="filter-role" bind:value={filterRole} on:change={applyFilters}>
                        <option value="">All Roles</option>
                        {#each roles as role}
                            <option value={role}>{role}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label for="filter-university" class="form-label">Filter by University</label>
                    <select class="form-select" id="filter-university" bind:value={filterUniversity} on:change={() => { filterCollege = ''; applyFilters(); }}>
                        <option value="">All Universities</option>
                        {#each data.universities as uni}
                            <option value={uni.id}>{uni.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label for="filter-college" class="form-label">Filter by College</label>
                    <select class="form-select" id="filter-college" bind:value={filterCollege} on:change={applyFilters}>
                        <option value="">All Colleges</option>
                        {#each filterCollegeOptions as college}
                            <option value={college.id}>{college.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3 d-flex gap-2">
                    <button type="button" class="btn btn-primary flex-grow-1" on:click={applyFilters}>
                        <i class="bi bi-search me-1"></i> Filter
                    </button>
                    <button type="button" class="btn btn-outline-secondary" on:click={resetFilters}>
                        Reset
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0 align-middle">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Affiliation</th>
                            <th>Created At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredUsers as user}
                            <tr>
                                <td>
                                    {user.email}
                                    {#if user.full_name}<br><small class="text-muted">{user.full_name}</small>{/if}
                                </td>
                                <td><span class="badge bg-secondary">{user.role}</span></td>
                                <td>
                                    {#if user.colleges}
                                        {user.colleges.name}
                                        {#if user.branches}
                                            <br><small class="text-primary fw-semibold">Dept: {user.branches.name}</small>
                                        {/if}
                                    {:else if user.universities}
                                        {user.universities.name}
                                    {:else if user.branches}
                                        <small class="text-primary fw-semibold">Dept: {user.branches.name} (Global)</small>
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(user)}>Edit</button>
                                    <button class="btn btn-sm btn-warning me-2" on:click={() => openResetPasswordModal(user)}>Reset Pwd</button>
                                    <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(user)}>Delete</button>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="5" class="text-center py-4 text-muted">
                                    No users found matching the search criteria.
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
        <!-- Card Footer for Pagination -->
        <div class="card-footer bg-white d-flex justify-content-between align-items-center py-3">
            <div class="d-flex align-items-center gap-3">
                <div class="small text-muted">
                    Showing {data.totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, data.totalCount)} of {data.totalCount} entries
                </div>
                <div class="d-flex align-items-center gap-1">
                    <span class="small text-muted">Show:</span>
                    <select class="form-select form-select-sm" style="width: auto;" bind:value={pageSize} on:change={applyFilters}>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>
            </div>
            {#if totalPages > 1}
                <nav>
                    <ul class="pagination pagination-sm mb-0">
                        <li class="page-item {currentPage === 1 ? 'disabled' : ''}">
                            <button class="page-link" on:click={() => changePage(currentPage - 1)}>Previous</button>
                        </li>
                        {#each pageNumbers as pageNum}
                            {#if pageNum === '...'}
                                <li class="page-item disabled"><span class="page-link">...</span></li>
                            {:else}
                                <li class="page-item {currentPage === pageNum ? 'active' : ''}">
                                    <button class="page-link" on:click={() => changePage(Number(pageNum))}>{pageNum}</button>
                                </li>
                            {/if}
                        {/each}
                        <li class="page-item {currentPage === totalPages ? 'disabled' : ''}">
                            <button class="page-link" on:click={() => changePage(currentPage + 1)}>Next</button>
                        </li>
                    </ul>
                </nav>
            {/if}
        </div>
    </div>
</div>

<!-- Create User Modal -->
<div class="modal" tabindex="-1" style="display: {showCreateModal ? 'block' : 'none'};">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create New User</h5>
                <button type="button" class="btn-close" on:click={() => (showCreateModal = false)}></button>
            </div>
            <div class="modal-body">
                <form method="POST" action="?/createUser" use:enhance={() => { 
                    showCreateModal = false; 
                    startLoading(); 
                    return async ({update}) => {
                        await update();
                        stopLoading();
                    } 
                }}>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label for="create-email" class="form-label">Email</label>
                            <input type="email" class="form-control" id="create-email" name="email" bind:value={$newUser.email} required />
                        </div>
                        <div class="col-md-6">
                            <label for="create-password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="create-password" name="password" bind:value={$newUser.password} required />
                        </div>
                        <div class="col-md-12">
                            <label for="create-fullname" class="form-label">Full Name</label>
                            <input type="text" class="form-control" id="create-fullname" name="full_name" bind:value={$newUser.full_name} required />
                        </div>
                        <div class="col-md-6">
                            <label for="create-role" class="form-label">Role</label>
                            <select class="form-select" id="create-role" name="role" bind:value={$newUser.role} required>
                                {#each roles as role}
                                    <option value={role}>{role}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <!-- Affiliation Fields -->
                    {#if ['university_auth', 'college_auth', 'deo', 'adm_officer', 'fee_collector', 'hod'].includes($newUser.role)}
                        <div class="row g-3 mt-2">
                            <div class="col-md-6">
                                <label for="create-university" class="form-label">University</label>
                                <select class="form-select" id="create-university" name="university_id" bind:value={$newUser.university_id}>
                                    <option value="">Select University (Global if empty)</option>
                                    {#each data.universities as uni}
                                        <option value={uni.id}>{uni.name}</option>
                                    {/each}
                                </select>
                            </div>
                            
                            {#if ['college_auth', 'deo', 'adm_officer', 'fee_collector', 'hod'].includes($newUser.role)}
                                <div class="col-md-6">
                                    <label for="create-college" class="form-label">College</label>
                                    <select class="form-select" id="create-college" name="college_id" bind:value={$newUser.college_id} disabled={!$newUser.university_id}>
                                        <option value="">Select College (Global if empty)</option>
                                        {#each filteredNewColleges as college}
                                            <option value={college.id}>{college.name}</option>
                                        {/each}
                                    </select>
                                </div>
                            {/if}
                        </div>
                        {#if $newUser.role === 'hod'}
                            <div class="row g-3 mt-2">
                                <div class="col-12">
                                    <label for="create-branch" class="form-label">Department/Branch (Required for HOD)</label>
                                    <select class="form-select" id="create-branch" name="branch_id" bind:value={$newUser.branch_id} required>
                                        <option value="">Select Department (Branch)</option>
                                        {#each filteredNewBranches as branch}
                                            <option value={branch.id}>{branch.name} ({getBranchCourseName(branch)})</option>
                                        {/each}
                                    </select>
                                </div>
                                <div class="col-12">
                                    <label for="create-hod-scope" class="form-label fw-semibold">HOD Access Scope</label>
                                    <select class="form-select" id="create-hod-scope" name="hod_scope" bind:value={$newUser.hod_scope}>
                                        <option value="branch">🏫 Branch Only — sees students from assigned department only</option>
                                        <option value="college">🏛️ College-Wide — sees all departments across the entire college</option>
                                        <option value="university">🎓 University-Wide — sees all colleges in the university</option>
                                    </select>
                                    <div class="form-text text-muted">
                                        <i class="bi bi-info-circle me-1"></i>
                                        College-Wide HODs need a College ID assigned above to scope correctly.
                                    </div>
                                </div>
                            </div>
                        {/if}
                    {/if}

                    <div class="modal-footer mt-3">
                        <button type="button" class="btn btn-secondary" on:click={() => (showCreateModal = false)}>Close</button>
                        <button type="submit" class="btn btn-primary">Create User</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- Edit Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit User: {$currentUser.email}</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <div class="modal-body">
                <form method="POST" action="?/updateRole" use:enhance={() => { 
                    showEditModal = false; 
                    startLoading(); 
                    return async ({update}) => {
                        await update();
                        stopLoading();
                    } 
                }}>
                    <input type="hidden" name="id" value={$currentUser.id} />
                    
                    <div class="mb-3">
                        <label for="edit-fullname" class="form-label">Full Name</label>
                        <input type="text" class="form-control" id="edit-fullname" name="full_name" bind:value={$currentUser.full_name} required />
                    </div>

                    <div class="mb-3">
                        <label for="edit-role" class="form-label">Role</label>
                        <select class="form-select" id="edit-role" name="role" bind:value={$currentUser.role} required>
                            {#each roles as role}
                                <option value={role}>{role}</option>
                            {/each}
                        </select>
                    </div>

                    <!-- Show University/College selection based on role -->
                    {#if ['university_auth', 'college_auth', 'deo', 'adm_officer', 'fee_collector', 'hod'].includes($currentUser.role)}
                        <div class="mb-3">
                            <label for="edit-university" class="form-label">University</label>
                            <select class="form-select" id="edit-university" name="university_id" bind:value={$currentUser.university_id}>
                                <option value="">Select University (Global if empty)</option>
                                {#each data.universities as uni}
                                    <option value={uni.id}>{uni.name}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}

                    {#if ['college_auth', 'deo', 'adm_officer', 'fee_collector', 'hod'].includes($currentUser.role)}
                        <div class="mb-3">
                            <label for="edit-college" class="form-label">College</label>
                            <select class="form-select" id="edit-college" name="college_id" bind:value={$currentUser.college_id} disabled={!$currentUser.university_id}>
                                <option value="">Select College (Global if empty)</option>
                                {#each filteredColleges as college}
                                    <option value={college.id}>{college.name}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}

                    {#if $currentUser.role === 'hod'}
                        <div class="mb-3">
                            <label for="edit-branch" class="form-label">Department/Branch (Required for HOD)</label>
                            <select class="form-select" id="edit-branch" name="branch_id" bind:value={$currentUser.branch_id} required>
                                <option value="">Select Department (Branch)</option>
                                {#each filteredBranches as branch}
                                    <option value={branch.id}>{branch.name} ({getBranchCourseName(branch)})</option>
                                {/each}
                            </select>
                        </div>
                        <div class="mb-3">
                            <label for="edit-hod-scope" class="form-label fw-semibold">HOD Access Scope</label>
                            <select class="form-select" id="edit-hod-scope" name="hod_scope" bind:value={$currentUser.hod_scope}>
                                <option value="branch">🏫 Branch Only — sees students from assigned department only</option>
                                <option value="college">🏛️ College-Wide — sees all departments across the entire college</option>
                                <option value="university">🎓 University-Wide — sees all colleges in the university</option>
                            </select>
                            <div class="form-text text-muted">
                                <i class="bi bi-info-circle me-1"></i>
                                College-Wide HODs need a College ID assigned above to scope correctly.
                            </div>
                        </div>
                    {/if}

                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Close</button>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- Delete Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete User</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/deleteUser" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentUser.id} />
                    <p>Are you sure you want to delete user <strong>{$currentUser.email}</strong>?</p>
                    <p class="text-danger">This will remove their access and might affect related data.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Reset Password Modal -->
<div class="modal" tabindex="-1" style="display: {showResetPasswordModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Reset Password: {$resetPasswordData.email}</h5>
                <button type="button" class="btn-close" on:click={() => (showResetPasswordModal = false)}></button>
            </div>
            <div class="modal-body">
                <form method="POST" action="?/resetPassword" use:enhance={() => { 
                    showResetPasswordModal = false; 
                    startLoading(); 
                    return async ({update}) => {
                        await update();
                        stopLoading();
                    } 
                }}>
                    <input type="hidden" name="id" value={$resetPasswordData.id} />
                    <div class="mb-3">
                        <label for="new-password" class="form-label">New Password</label>
                        <input type="password" class="form-control" id="new-password" name="newPassword" bind:value={$resetPasswordData.newPassword} required minlength="6" />
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={() => (showResetPasswordModal = false)}>Cancel</button>
                        <button type="submit" class="btn btn-warning">Reset Password</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>