<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { supabase } from '$lib/supabase';
    
    let { data } = $props<{ data: { students: any[] } }>();
    let searchQuery = $state($page.url.searchParams.get('q') || '');
    let autocompleteResults = $state<any[]>([]);
    let showDropdown = $state(false);
    let autocompleteLoading = $state(false);
    let debounceTimer: any;

    const userProfile = $derived($page.data.userProfile);

    function handleSearch() {
        showDropdown = false;
        const url = new URL(window.location.href);
        if (searchQuery.trim()) {
            url.searchParams.set('q', searchQuery.trim());
        } else {
            url.searchParams.delete('q');
        }
        goto(url.toString());
    }

    async function fetchAutocomplete(queryStr: string) {
        if (queryStr.trim().length < 2) {
            autocompleteResults = [];
            showDropdown = false;
            return;
        }

        autocompleteLoading = true;
        try {
            const term = `%${queryStr}%`;
            
            let qName = supabase
                .from('student_profiles')
                .select(`
                    user_id,
                    enrollment_number,
                    users!inner (
                        full_name,
                        college_id
                    )
                `)
                .not('enrollment_number', 'is', null)
                .ilike('users.full_name', term)
                .limit(5);

            let qEnroll = supabase
                .from('student_profiles')
                .select(`
                    user_id,
                    enrollment_number,
                    users!inner (
                        full_name,
                        college_id
                    )
                `)
                .not('enrollment_number', 'is', null)
                .ilike('enrollment_number', term)
                .limit(5);

            if (userProfile?.college_id) {
                qName = qName.eq('users.college_id', userProfile.college_id);
                qEnroll = qEnroll.eq('users.college_id', userProfile.college_id);
            }

            const [resName, resEnroll] = await Promise.all([qName, qEnroll]);
            
            const results = [...(resName.data || []), ...(resEnroll.data || [])];
            
            // Deduplicate by user_id
            const unique = [];
            const seen = new Set();
            for (const student of results) {
                if (!seen.has(student.user_id)) {
                    seen.add(student.user_id);
                    unique.push(student);
                }
            }

            autocompleteResults = unique.slice(0, 5);
            showDropdown = autocompleteResults.length > 0;
        } catch (err) {
            console.error('Autocomplete fetch error:', err);
            autocompleteResults = [];
            showDropdown = false;
        } finally {
            autocompleteLoading = false;
        }
    }

    function handleInput() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAutocomplete(searchQuery);
        }, 250);
    }
</script>

<svelte:window onclick={(e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.search-container')) {
        showDropdown = false;
    }
}} />

<div class="container mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Bus Seva Fees Module</h2>
        <div>
            {#if userProfile?.role === 'fee_collector'}
                <a href="/busseva/reports" class="btn btn-outline-primary me-2">Reports & Exports</a>
            {/if}
            {#if userProfile?.role === 'admin'}
                <a href="/admin/busseva" class="btn btn-outline-danger">QR Configuration</a>
            {/if}
        </div>
    </div>

    <div class="card p-4 shadow-sm mb-4 search-container position-relative">
        <h5>Student Lookup</h5>
        <div class="input-group">
            <input 
                type="text" 
                bind:value={searchQuery} 
                class="form-control" 
                placeholder="Enter Enrollment ID or Student Name" 
                oninput={handleInput}
                onkeydown={(e) => e.key === 'Enter' && handleSearch()} 
                onfocus={() => autocompleteResults.length > 0 && (showDropdown = true)}
                autocomplete="off"
            />
            <button class="btn btn-primary" onclick={handleSearch}>Search</button>
        </div>

        {#if showDropdown}
            <div class="dropdown-menu show w-100 position-absolute mt-1 shadow" style="top: 100%; left: 0; right: 0; z-index: 1050; max-height: 280px; overflow-y: auto;">
                {#each autocompleteResults as student}
                    <a href="/busseva/collect/{student.user_id}" class="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fw-bold text-dark">{student.users?.full_name}</div>
                            <div class="small text-muted">Enrollment: {student.enrollment_number}</div>
                        </div>
                        <i class="bi bi-chevron-right text-secondary"></i>
                    </a>
                {/each}
            </div>
        {/if}
    </div>

    {#if data.students && data.students.length > 0}
        <div class="table-responsive bg-white rounded shadow-sm">
            <table class="table align-middle mb-0">
                <thead>
                    <tr>
                        <th>Enrollment No</th>
                        <th>Name</th>
                        <th>College</th>
                        <th>Branch</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.students as student}
                        <tr>
                            <td>{student.enrollment_number}</td>
                            <td>{student.users?.full_name}</td>
                            <td>{student.applications?.courses?.colleges?.name}</td>
                            <td>{student.applications?.branches?.name || 'General'}</td>
                            <td class="text-end">
                                <a href="/busseva/collect/{student.user_id}" class="btn btn-sm btn-success">Collect Fee</a>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else if searchQuery && !autocompleteLoading}
        <div class="alert alert-secondary">No matching student found.</div>
    {/if}
</div>
