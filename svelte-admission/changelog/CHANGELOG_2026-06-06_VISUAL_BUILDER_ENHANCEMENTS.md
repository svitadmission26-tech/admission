# Changelog - June 6, 2026

## Visual Builder Enhancements and PDF Optimization

### 1. High-Fidelity PDF Generation
- **Native Print Optimization**: Switched Visual Builder templates to use native browser printing (`window.print()`). This ensures 100% visual fidelity (WYSIWYG) by using the same rendering engine for both the designer and the PDF.
- **A4 Print CSS**: Added specialized `@media print` rules and `@page` settings to optimize layouts for A4 paper with zero margins/padding, matching the designer's coordinate system.
- **Metadata Detection**: Updated `print-profile` server logic to fetch report types and configurations, enabling automatic detection of visual templates.

### 2. Interaction & Ergonomics
- **Dedicated Move Handles**: Added blue "Grip" handles to `layoutTable` components for instant selection and movement, even when cells are full.
- **Component Selection Handles**: Implemented interactive top-left labels for all components. Clicking a label reliably selects the component regardless of nesting depth.
- **Interaction Isolation**: Strictly isolated child interactions from parent containers. Selecting or resizing a nested component no longer triggers parent "move" or "select" actions.
- **Drop Zone Overlays**: Added semi-transparent blue overlays to table cells during drag operations to provide clear targets for re-parenting.
- **Native Drag Conflict Fix**: Resolved a critical bug where native browser dragging would cancel custom resize/move operations.

### 3. Layout & Sizing System
- **12-Column Grid for Cells**: Implemented a Bootstrap-style 12-column sizing system for `layoutTable` cells. Users can now set widths from 1-12 via a sidebar slider, which translates to percentage-based layouts.
- **Free-Form Positioning**: Removed the restrictive "Snap to Grid" logic to allow for pixel-perfect component placement.
- **Alignment Snapping**: Re-introduced smart component-to-component snapping with magenta guidelines to help align edges and centers.
- **Default Baseline**: Set the default font size to 12px for all new components and the design canvas to ensure consistent document standards.

### 4. Data & Logic Fixes
- **Student Photo Fallback**: Fixed photo loading by implementing a fallback mechanism. The API now checks both the `documents` table and the student's `profile_data.photo` path.
- **Conditional Rendering**: Added a "Render Condition" property to all components. Entering a variable path (e.g., `student.photo_url`) automatically wraps the component in a Handlebars `{{#if}}` block.
- **API Robustness**: Improved the `/api/reports/profile-data` endpoint to generate signed URLs and provide root-level aliases (`photo_url`, `student_photo_url`) for easier template interpolation.

### Files Modified:
- `src/lib/components/reports/visual-builder/VisualBuilder.svelte`
- `src/lib/components/reports/visual-builder/CanvasNode.svelte`
- `src/lib/components/reports/visual-builder/Sidebar.svelte`
- `src/routes/print-profile/[applicationId]/+page.svelte`
- `src/routes/print-profile/[applicationId]/+page.server.ts`
- `src/routes/api/reports/profile-data/+server.ts`
