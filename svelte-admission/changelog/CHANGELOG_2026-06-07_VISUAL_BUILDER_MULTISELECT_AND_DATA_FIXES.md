# Changelog - June 7, 2026

## Visual Builder Multi-Selection, Grouped Movement, and Data Integrity Fixes

### 1. Multi-Selection & Advanced Ergonomics
- **Grouped Selection**: Added support for selecting multiple elements using `Shift + Click`, `Ctrl + Click`, or `Cmd + Click`. 
- **Grouped Movement**: Implemented a synchronized movement engine. Dragging any member of a selection set moves the entire group while strictly preserving their relative positions and alignment.
- **Bulk Actions**: Added "Delete All" and "Duplicate All" functionality for multi-selected groups.
- **Auto-Properties Switch**: The Sidebar now automatically switches from the "Palette" tab to the "Properties" tab whenever a component is selected on the canvas.
- **Selection Visibility**: Replaced border-based selection with a high-fidelity 2px blue `outline` that is visible across all component types, including nested rows, columns, and table cells.

### 2. Template Management & Export
- **Layout Export**: Added an "Export" button to the toolbar that copies the entire visual layout JSON to the clipboard for easy duplication or backup.
- **Live Mode Recovery**: Fixed a bug where pasting raw HTML would "lock" the builder in code-only mode. The visual sidebar and palette now remain accessible in Design mode at all times.
- **High-Fidelity Grid**: Changed the underlying grid system from `col-md-` to `col-` to ensure multi-column layouts (like headers and side-by-side tables) do not stack vertically in print outputs or narrow previews.

### 3. API & Branch Data Integration
- **Branch Data Inclusion**: Updated the `/api/reports/profile-data` endpoint to perform a JOIN with the `branches` table, ensuring `{{branch.name}}` and `{{branch.code}}` are available for all report types.
- **Global Aliases**: Added `branch_name` and `branch_code` as root-level variables to ensure compatibility with simpler templates.
- **ACPC Template Correction**: Updated the ACPC auto-generation logic to correctly map specialized branch names instead of generic course names.

### 4. Intelligent Schema Discovery & Dynamic Tables
- **Schema Key Correction**: Verified via autonomous database scanning that the marks table uses `score` and `max_score`. Updated the Dynamic Table "Quick Setup" suggestions to use these correct keys, resolving the issue of empty rendered tables.
- **Discovery Tool**: Created `scripts/discover_json_arrays.cjs` to programmatically identify JSON array structures across `form_data` and `profile_data` to ensure future "Quick Setup" templates are accurate.

### 5. Stability & Framework Fixes
- **Svelte 5 Runes Fix**: Resolved a critical compilation error by transitioning `{#each}` block bindings to index-based access (`bind:node={layout[i]}`), ensuring full compatibility with Svelte 5's mutation rules.
- **Syntax Repair**: Performed a full unification rewrite of `VisualBuilder.svelte` to resolve unclosed tag errors and redundant variable declarations.

### Files Modified:
- `src/lib/components/reports/visual-builder/VisualBuilder.svelte`
- `src/lib/components/reports/visual-builder/CanvasNode.svelte`
- `src/lib/components/reports/visual-builder/Sidebar.svelte`
- `src/routes/api/reports/profile-data/+server.ts`
- `scripts/generate_acpc_layout.cjs`
- `scripts/discover_json_arrays.cjs` (New)
