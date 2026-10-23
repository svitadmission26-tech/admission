<script lang="ts">
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';
    import { goto } from '$app/navigation';
    
    export let university: { name: string, logo_url?: string } | null;
    export let hidden: boolean = false;
    export let userProfile: any = null;
    export let avatarUrl: string | null = null;
    export let onToggleSidebar: () => void = () => {};

    function handleLogout() {
        goto('/logout', { method: 'POST' });
    }
</script>

<header class="app-header border-bottom bg-white {hidden ? 'header-hidden' : ''}">
    <div class="container-fluid h-100">
        <div class="row h-100 align-items-center">
            <!-- Column 1 & 2: Logo and University Name combined for alignment -->
            <div class="col-md-5 d-flex align-items-center">
                {#if userProfile}
                    <button 
                        class="btn btn-link text-dark me-3 p-0 border-0" 
                        on:click={onToggleSidebar}
                        aria-label="Toggle Sidebar"
                    >
                        <i class="bi bi-list fs-4"></i>
                    </button>
                {/if}

                {#if university && university.logo_url}
                    <img src={university.logo_url} alt="University Logo" class="university-logo me-2">
                {:else}
                    <i class="bi bi-mortarboard-fill text-primary fs-3 me-2"></i>
                {/if}
                
                {#if university}
                    <h1 class="h6 m-0 text-primary fw-bold text-truncate">{university.name}</h1>
                {:else}
                    <h1 class="h6 m-0 text-primary fw-bold">Admission Portal</h1>
                {/if}
            </div>

            <!-- Column 3: Spacer -->
            <div class="col-md-3">
            </div>

            <!-- Column 4: Spacer -->
            <div class="col-md-2">
            </div>

            <!-- Column 5: User Profile -->
            <div class="col-md-2 d-flex justify-content-end">
                {#if userProfile}
                    <div class="dropdown">
                        <button 
                            class="btn d-flex align-items-center p-0 dropdown-toggle" 
                            type="button" 
                            id="dropdownUser" 
                            data-bs-toggle="dropdown" 
                            aria-expanded="false"
                        >
                            <span class="me-2 text-muted small d-none d-xl-block text-truncate" style="max-width: 100px;">{userProfile.full_name || userProfile.email}</span>
                            {#if avatarUrl}
                                <img src="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{avatarUrl}" alt="Profile" class="rounded-circle border" style="width: 32px; height: 32px; object-fit: cover;">
                            {:else}
                                <div class="rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                                    <i class="bi bi-person-fill"></i>
                                </div>
                            {/if}
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownUser">
                            <li><h6 class="dropdown-header">{userProfile.full_name || userProfile.email}</h6></li>
                            <li><button class="dropdown-item text-danger" on:click={handleLogout}>Logout</button></li>
                        </ul>
                    </div>
                {:else}
                    <div class="d-flex gap-2">
                        <a href="/login" class="btn btn-sm btn-outline-primary fw-bold">Login</a>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</header>

<style>
    .app-header {
        height: 60px; /* Fixed height for header */
        flex-shrink: 0;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1040;
        transform: translateY(0);
        transition: transform 0.3s ease-out;
    }
    .app-header.header-hidden {
        transform: translateY(-100%);
    }
    .university-logo {
        height: 40px;
        width: auto;
        object-fit: contain;
    }
    .dropdown-menu {
        /* Ensure dropdown is positioned correctly */
        position: absolute;
        inset: 0 auto auto 0;
        transform: translate3d(-100px, 40px, 0px); /* Adjust as needed */
    }
    .dropdown-toggle::after {
        display: none; /* Hide default dropdown arrow */
    }
</style>
