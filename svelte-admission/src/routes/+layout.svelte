<script lang="ts">
  import "../app.scss";
  import { onMount } from "svelte";
  import { invalidate } from "$app/navigation";
  import { writable } from "svelte/store";
  import type { LayoutData } from "./$types";
  import { browser } from "$app/environment";
  import { userProfile, sessionStore } from "$lib/stores/userStore";
  import { supabase } from "$lib/supabase"; // Import client-side supabase instance

  // Initialize Bootstrap JS for interactive components (Accordions, Modals, Dropdowns)
  if (browser) {
    import("bootstrap");
  }

  import MainNav from "$lib/components/MainNav.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { NAVIGATION_CONFIG } from "$lib/config/navigation";

  import LoadingOverlay from "$lib/components/LoadingOverlay.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import Header from "$lib/components/Header.svelte";
  import Footer from "$lib/components/Footer.svelte";

  import { page } from "$app/stores"; // Import page store

  let { data, children } = $props<{ data: LayoutData; children: any }>(); // Use $props() for runes mode

  // Update session and userProfile stores
  if (data.session) sessionStore.set(data.session);
  if (data.userProfile) userProfile.set(data.userProfile);

  let lastSeenRole = $state(data.userProfile?.role);
  let showHeader = $state(true); // New state for header visibility
  let lastScrollY = $state(0); // New state for tracking scroll position

  onMount(() => {
    // Only run client-side. The session is already available server-side.
    if (browser) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.expires_at !== data.session?.expires_at) {
          invalidate("supabase:auth");
        }
        sessionStore.set(session);
        if (session && session.user) {
          // Ideally we should re-fetch user profile here too if needed
        } else {
          userProfile.set(null);
        }
      });

      const handleScroll = () => {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY && currentScrollY > 60) {
          // Scrolling down, and not at the very top (60px is header height)
          showHeader = false;
        } else {
          // Scrolling up or at the very top
          showHeader = true;
        }
        lastScrollY = currentScrollY;
      };

      window.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        subscription.unsubscribe();
        window.removeEventListener("scroll", handleScroll);
      };
    }
  });

  // Debugging: Log the user's role to see which nav should be active
  $effect(() => {
    if ($userProfile) {
      console.log("User Profile Role:", $userProfile.role);
    } else {
      console.log("User is not logged in. MainNav should be active.");
    }
  });

  // Determine if we are on a public landing page (no sidebar)
  let isHomePage = $derived(
    $page.url.pathname === "/" ||
      $page.url.pathname === "/login" ||
      $page.url.pathname === "/register" ||
      $page.url.pathname.startsWith("/inquiry"),
  );

  // Determine if we are on a print route (no header, footer, or sidebar)
  let isPrintRoute = $derived(
    $page.url.pathname.includes("/print-profile") ||
      $page.url.pathname.includes("/receipts/print") ||
      $page.url.pathname.includes("/receipts/admission"),
  );

  let isSidebarCollapsed = $state(data.userProfile?.role === "student");
  let isSidebarHidden = $state(data.userProfile?.role === "hod");
  // let lastSeenRole = $state(data.userProfile?.role); // Removed duplicate declaration

  $effect(() => {
    // Track role changes to apply defaults (e.g. collapse for students on login)
    const currentRole = data.userProfile?.role;
    if (currentRole !== lastSeenRole) {
      lastSeenRole = currentRole;
      // Default: Collapsed for students, Expanded for others
      isSidebarCollapsed = currentRole === "student";
      isSidebarHidden = currentRole === "hod"; // Hide for HOD on role change
    }
  });

  let tooltipData = $state({ visible: false, text: "", top: 0, left: 0 });

  function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed;
    tooltipData.visible = false; // Hide tooltip immediately on toggle
  }

  function handleHeaderToggle() {
    isSidebarHidden = !isSidebarHidden;
  }

  function handleSidebarMouseOver(event: MouseEvent) {
    if (!isSidebarCollapsed) {
      if (tooltipData.visible) tooltipData.visible = false;
      return;
    }

    const target = (event.target as HTMLElement).closest(".nav-link");
    if (target) {
      const textSpan = target.querySelector(".nav-text");
      if (textSpan && textSpan.textContent) {
        const rect = target.getBoundingClientRect();
        tooltipData = {
          visible: true,
          text: textSpan.textContent.trim(),
          top: rect.top + rect.height / 2,
          left: rect.right + 10, // 10px spacing
        };
      } else {
        tooltipData.visible = false;
      }
    } else {
      tooltipData.visible = false;
    }
  }

  function handleSidebarMouseLeave() {
    tooltipData.visible = false;
  }

  // Determine current navigation config
  let navConfig = $derived.by(() => {
    if (!$userProfile) return null;
    const role = $userProfile.role;
    let config = null;

    // Check exact match first
    if (NAVIGATION_CONFIG[role]) {
      config = { ...NAVIGATION_CONFIG[role] };
    } else if (role === "university_auth" || role === "univ_auth") {
      config = { ...NAVIGATION_CONFIG["university_auth"] };
    } else {
      config = { ...NAVIGATION_CONFIG["authenticated"] };
    }

    // Filter for students who haven't submitted a form
    if (role === "student" && !data.hasSubmittedForm) {
      config.items = config.items.filter(
        (item) => item.href !== "/student/profile",
      );
    }

    return config;
  });
</script>

<LoadingOverlay />
<ToastContainer />

{#if tooltipData.visible}
  <div
    class="sidebar-tooltip"
    style="top: {tooltipData.top}px; left: {tooltipData.left}px;"
  >
    {tooltipData.text}
  </div>
{/if}

<!-- Header -->
{#if !isPrintRoute}
  <Header
    university={data.universityBranding}
    hidden={!showHeader}
    userProfile={data.userProfile}
    avatarUrl={data.avatarUrl}
    onToggleSidebar={handleHeaderToggle}
  />
{/if}

<div
  class="main-layout-content-wrapper d-flex {isPrintRoute ? 'pt-0' : ''}"
  style="min-height: 100vh;"
>
  {#if !isHomePage && !isPrintRoute}
    <div class="sidebar-container {isSidebarCollapsed ? 'collapsed' : ''} {isSidebarHidden ? 'hidden' : ''}">
      <div
        class="sidebar-content"
        role="navigation"
        onmouseover={handleSidebarMouseOver}
        onfocus={handleSidebarMouseOver}
        onmouseleave={handleSidebarMouseLeave}
        onblur={handleSidebarMouseLeave}
      >
        <Sidebar config={navConfig || { title: "Menu", items: [] }} />
      </div>

      <!-- Toggle Button attached to sidebar -->
      <button
        class="sidebar-toggle"
        onclick={toggleSidebar}
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <i
          class="bi {isSidebarCollapsed
            ? 'bi-chevron-right'
            : 'bi-chevron-left'}"
        ></i>
      </button>
    </div>
  {/if}

  <main
    class="flex-grow-1 overflow-auto bg-light {isPrintRoute ? 'p-0' : 'p-3'}"
  >
    {@render children()}
  </main>
</div>

{#if !isPrintRoute}
  <Footer university={data.universityBranding} />
{/if}

<style lang="scss">
  .main-layout-content-wrapper {
    // New wrapper for sidebar + content
    padding-top: 60px; // Space for the fixed header
    min-height: 100vh; // Ensure it's at least viewport height for cases with short content
  }

  .sidebar-container {
    width: 250px;
    flex-shrink: 0;
    height: calc(
      100vh - 60px
    ); // Full viewport height minus fixed header height
    position: sticky; // Make sidebar sticky within its parent
    top: 60px; // Stick it below the header
    transition: width 0.3s ease, transform 0.3s ease;
    z-index: 100; // Ensure sidebar is above content if needed

    &.collapsed {
      width: 70px;

      // Target elements inside sidebar-content
      :global(.nav-text),
      :global(.nav-title),
      :global(h4) {
        display: none !important;
      }

      :global(nav) {
        padding: 0 !important;
      }

      :global(.nav-link) {
        text-align: center;
        padding: 0.5rem 0;
        display: flex;
        justify-content: center;
        width: 100%;

        :global(i) {
          margin-right: 0 !important;
          font-size: 1.5rem;
        }
      }
    }

    &.hidden {
      width: 0 !important;
      overflow: hidden;
      transform: translateX(-100%);
      
      .sidebar-toggle {
        display: none;
      }
    }
  }

  .content-area {
    // Renamed from .content for clarity in new structure
    padding: 1rem;
    // height: 100%; // No fixed height here, let content dictate
    box-sizing: border-box;
  }

  .sidebar-content {
    background-color: #f8f9fa;
    height: 100%; // Fill the sidebar-container's calculated height
    padding: 1rem;
    border-right: 1px solid #dee2e6;
    transition: padding 0.3s ease;
    overflow-x: hidden;
    overflow-y: auto;

    scrollbar-width: thin;
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
  }

  .sidebar-container.collapsed .sidebar-content {
    padding: 1rem 0; // Remove horizontal padding in content when collapsed
  }

  .sidebar-toggle {
    position: absolute;
    top: 50%;
    right: -12px;
    transform: translateY(-50%);
    width: 24px;
    height: 60px;
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-left: none;
    border-radius: 0 8px 8px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #6c757d;
    box-shadow: 4px 0 5px -2px rgba(0, 0, 0, 0.1);
    padding: 0;
    z-index: 101;

    &:hover {
      background-color: #e9ecef;
      color: #000;
    }

    i {
      font-size: 0.8rem;
    }
  }

  .sidebar-tooltip {
    position: fixed;
    background-color: #333;
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    white-space: nowrap;
    z-index: 1060;
    pointer-events: none;
    transform: translateY(-50%);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);

    &::before {
      content: "";
      position: absolute;
      left: -4px;
      top: 50%;
      transform: translateY(-50%);
      border-width: 4px 4px 4px 0;
      border-style: solid;
      border-color: transparent #333 transparent transparent;
    }
  }
</style>
