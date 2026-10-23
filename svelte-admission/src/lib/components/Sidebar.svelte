<script lang="ts">
    import { page } from '$app/stores';
    import type { RoleNavigation } from '$lib/config/navigation';

    let { config } = $props<{ config: RoleNavigation }>();

    let currentPath = $derived($page.url.pathname);

    function isActive(href: string, exact = false) {
        if (exact) return currentPath === href;
        if (href === '/') return currentPath === '/';
        return currentPath.startsWith(href);
    }
</script>

<nav class="p-3">
    <div class="d-flex align-items-center justify-content-between mb-3">
        <h4 class="mb-0 nav-title">{config.title}</h4>
    </div>
    <ul class="nav flex-column">
        {#each config.items as item}
            <li class="nav-item">
                <a href={item.href} class="nav-link {isActive(item.href, item.exact) ? 'active' : 'text-dark'}">
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

<style>
    /* Ensure active state styling matches the original */
    .nav-link.active {
        /* Add specific active styles if not handled by Bootstrap's .active class on nav-pills/tabs */
        /* Assuming Bootstrap or custom global styles handle .active, but for clarity: */
        font-weight: bold;
        color: var(--bs-primary) !important; 
        background-color: rgba(var(--bs-primary-rgb), 0.1);
        border-radius: 0.25rem;
    }
    
    .nav-link:hover {
        background-color: #e9ecef;
    }
</style>