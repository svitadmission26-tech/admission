# Changelog - June 10, 2026

## [1.3.0] - Student Application Form Stability and UI Fixes

### Fixed
- **Infinite Loading Loop**: Resolved a critical issue in the Student Application page (`/student/apply`) where a self-triggering reactivity loop caused the form to constantly reload and display the "Loading form..." state.
- **UI Flickering**: Replaced legacy Svelte reactivity with Svelte 5 `$state`, `$derived`, and `$effect` runes to provide a more stable and predictable user interface.
- **Duplicate Key Prevention**: Implemented a safeguard in `DynamicForm.svelte` to prevent rendering duplicate field keys, ensuring data integrity and preventing UI "fighting" between components.
- **Label & ID Mismatch**: Fixed "Incorrect use of label" browser console errors by ensuring every `<label for="...">` correctly matches a unique element `id`. This includes regular fields, merit-based fields, and data grid rows.
- **SSR Compatibility**: Fixed several Server-Side Rendering (SSR) issues in `DynamicForm.svelte`, including invalid HTML placement of tracking logic and duplicate variable declarations.
- **Student Profile Labels**: Fixed label mismatches in the Student Profile page for better accessibility and a clean console.
- **MQ/NRI Form Performance**: Specifically optimized the loading and rendering logic for complex form types like MQ/NRI for Diploma and Engineering courses.

### Changed
- **Form Remounting**: Added `{#key}` guards to force clean remounts of the `DynamicForm` when switching between different application types.
- **Global Loading State**: Enhanced the use of `startLoading()` and `stopLoading()` to provide clear visual feedback during form initialization and selection changes.
- **Component ID Isolation**: Introduced unique component IDs and layout-specific ID prefixes to prevent DOM collisions when multiple forms are present on the same page.

### Technical Details
- Refactored `src/routes/student/apply/+page.svelte` to utilize Svelte 5 Runes for core state management.
- Implemented `lastLoadedKey` and `lastCheckedKey` guards to synchronize async data fetching with user selections.
- Optimized `DynamicForm.svelte` internal snippets to handle conditional rendering and visibility rules more efficiently.
