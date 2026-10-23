# Code Duplication Reduction Plan 

## Objective
The primary goal of this plan is to eliminate code duplication in the sidebar navigation components across different user roles. Currently, separate Svelte components (`AdminNav.svelte`, `AdmOfficerNav.svelte`, `DeoNav.svelte`, `StudentNav.svelte`, etc.) are maintained for each role, despite sharing nearly identical HTML structures and logic.

## Current State Analysis
- **Multiple Components:** There are at least 7-8 separate `*Nav.svelte` files in `src/lib/components/`.
- **Duplicate Logic:**
    - Each component manually implements the active link highlighting logic (`class:active`).
    - Each component repeats the `nav > ul > li > a` HTML structure.
    - Each component includes an identical Logout button form.
- **Maintenance Overhead:** Adding a new global feature to the sidebar (e.g., a "Profile" link for everyone, or changing the icon set) requires updating every single file.
- **Inconsistent Implementation:** Minor inconsistencies might creep in over time (e.g., class names, spacing).

## Proposed Solution: Config-Driven Sidebar

### 1. Create a Navigation Configuration
Define a TypeScript file (e.g., `src/lib/config/navigation.ts`) that exports the menu structure for each role.

```typescript
// src/lib/config/navigation.ts

export interface MenuItem {
    title: string;
    href: string;
    icon: string;
    exact?: boolean; // If true, only matches exact path. Default false (matches prefix).
}

export interface RoleNavigation {
    title: string; // The header title (e.g., "Admin Dashboard")
    items: MenuItem[];
}

export const NAVIGATION_CONFIG: Record<string, RoleNavigation> = {
    admin: {
        title: "Admin Dashboard",
        items: [
            { title: "Dashboard", href: "/admin/dashboard", icon: "bi-speedometer2", exact: true },
            { title: "Universities", href: "/admin/universities", icon: "bi-building" },
            // ... other items
        ]
    },
    student: {
        title: "Student Dashboard",
        items: [
            { title: "Dashboard", href: "/student", icon: "bi-speedometer2", exact: true },
            { title: "My Profile", href: "/student/profile", icon: "bi-person-badge" },
            // ...
        ]
    },
    // ... define for other roles (deo, fee_collector, adm_officer, etc.)
};
```

### 2. Create a Generic `Sidebar` Component
Create a reusable `src/lib/components/Sidebar.svelte` component that accepts the configuration and renders the menu.

**Props:**
- `config`: The `RoleNavigation` object for the current user.

**Logic:**
- It will iterate over `config.items`.
- It will handle the "active" state logic centrally using `$page.url.pathname`.
- It will include the standard Logout button at the bottom.

**Example Structure (Conceptual):**
```svelte
<script lang="ts">
    import { page } from '$app/stores';
    import type { RoleNavigation } from '$lib/config/navigation';

    export let config: RoleNavigation;

    function isActive(href: string, exact = false) {
        if (exact) return $page.url.pathname === href;
        return $page.url.pathname.startsWith(href);
    }
</script>

<nav class="p-3">
    <div class="d-flex align-items-center justify-content-between mb-3">
        <h4 class="mb-0 nav-title">{config.title}</h4>
    </div>
    <ul class="nav flex-column">
        {#each config.items as item}
            <li class="nav-item">
                <a href={item.href} class="nav-link" class:active={isActive(item.href, item.exact)}>
                    <i class="bi {item.icon} me-2"></i> 
                    <span class="nav-text">{item.title}</span>
                </a>
            </li>
        {/each}
        
        <!-- Standard Logout Button -->
        <li class="nav-item mt-3">
            <form action="/logout" method="POST">
                <button type="submit" class="btn btn-outline-danger w-100">
                    <i class="bi bi-box-arrow-right me-2"></i> 
                    <span class="nav-text">Logout</span>
                </button>
            </form>
        </li>
    </ul>
</nav>
```

### 3. Update Root Layout
Modify `src/routes/+layout.svelte` to use the new `Sidebar` component instead of the individual `*Nav` components.

**Changes:**
- Import `NAVIGATION_CONFIG` and `Sidebar`.
- Determine the current role's configuration.
- Replace the big `if/else if` block with a single `<Sidebar config={...} />`.

```svelte
<script>
    // ... imports
    import { NAVIGATION_CONFIG } from '$lib/config/navigation';
    import Sidebar from '$lib/components/Sidebar.svelte';

    // ... existing logic
    
    // Derived config based on role
    let navConfig = $derived(
        $userProfile && NAVIGATION_CONFIG[$userProfile.role] 
        ? NAVIGATION_CONFIG[$userProfile.role] 
        : null
    );
</script>

<!-- ... inside the sidebar container ... -->
<div class="sidebar-content" ...>
    {#if navConfig}
        <Sidebar config={navConfig} />
    {:else}
        <MainNav /> 
    {/if}
</div>
```

## Benefits
1.  **Single Source of Truth:** All navigation structures are defined in one place (`navigation.ts`).
2.  **Reduced Code:** Deletes ~7 component files, removing hundreds of lines of duplicate HTML.
3.  **Consistent UI:** Any change to the sidebar styling or behavior is applied instantly to all roles.
4.  **Easier Maintenance:** Adding a new role or menu item is just a configuration change.

## Implementation Steps
1.  Create `src/lib/config/navigation.ts` and populate it with existing menu items from all `*Nav.svelte` files.
2.  Create `src/lib/components/Sidebar.svelte`.
3.  Update `src/routes/+layout.svelte` to use the new system.
4.  Verify all dashboards load correctly with the correct items.
5.  Delete the obsolete `*Nav.svelte` files (`AdminNav`, `AdmOfficerNav`, `DeoNav`, `FeeCollectorNav`, `StudentNav`, `CollegeNav`, `UniversityNav`, `AuthenticatedNav`).
