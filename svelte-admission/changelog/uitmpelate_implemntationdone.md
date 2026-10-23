# Changelog: Visual Template Builder Implementation

## Status: ✅ COMPLETED

This document summarizes the full implementation of the **Visual Drag-and-Drop Template Builder** for the Admin Report module.

### 1. Visual Designer (The Canvas)
- **Figma-like Interface**: Implemented an absolute-positioned A4 canvas (210mm x 297mm) that allows precise placement of components.
- **Drag-to-Move & Resize**: Native high-performance interaction logic for moving and resizing elements with 8-point handles.
- **Smart Snapping**: Components automatically snap to:
  - Canvas Center (Vertical & Horizontal).
  - Canvas Edges (0,0 origin).
  - Edges and Centers of other components.
  - 5px Grid fallback.
- **Alignment Guidelines**: Magenta visual guides appear in real-time during manipulation to show perfect alignments.
- **Strict A4 Boundary**: Visual "End of Page" indicator at 297mm ensures designs fit on a single sheet.

### 2. Properties & Data Binding
- **Autocomplete Variable Picker**: Replaced the complex tree with a searchable autocomplete box in the properties sidebar.
- **Deep Relational Support**: Autocomplete recursively traverses the schema (up to 3 levels) to find fields like `course.college.logo_url` or `college.university.name`.
- **Intelligent Insertion**:
  - Clicking a variable in the search results automatically binds it to the selected component.
  - **Text**: Inserts Handlebars placeholders (`{{variable}}`) at the cursor position.
  - **Image**: Sets the image source to the selected database field.
- **Contextual Sidebar**: Converted the sidebar into a hover-expandable drawer to maximize design space.

### 3. Layout Engine
- **Hybrid System**:
  - **Top-Level**: Absolute positioning for design flexibility.
  - **Containers (Rows/Columns)**: Flow-based layout for nested components, allowing them to fill parent space automatically.
- **Styling Controls**: Direct control over padding, margins, font size, colors, borders, and Z-index (Front/Back layering).

### 4. Rendering & Printing (WYSIWYG)
- **Pixel-Perfect PDF**:
  - Implemented a standard **0.75x Scale Factor** (96dpi to 72pt) for all coordinates, dimensions, font sizes, and spacing.
  - Zero-margin origin alignment between the designer, browser preview, and PDF output.
- **Hardened Data API**:
  - Consolidated `/api/reports/profile-data` to fetch all relational data (Applications, Users, Profiles, Colleges, Universities, Courses, Branches) in a single optimized query.
  - Standardized paths (e.g., `student` instead of `student_user`) for consistent binding.
- **Robust Interpolation**: Improved Regex-based Handlebars engine with full support for `#if/else` logic and case-insensitive nested value retrieval.

### 5. Key Files Created/Modified
- `src/lib/components/reports/visual-builder/VisualBuilder.svelte`: Central coordinator and interaction engine.
- `src/lib/components/reports/visual-builder/CanvasNode.svelte`: Design-time rendering and resize logic.
- `src/lib/components/reports/visual-builder/Sidebar.svelte`: Property editor and flattened schema search.
- `src/lib/utils/htmlToPdf.ts`: Enhanced HTML-to-PDF converter with absolute positioning and scaling.
- `src/routes/api/reports/profile-data/+server.ts`: Optimized unified data fetcher.
- `src/routes/print-profile/[applicationId]/+page.svelte`: Robust print-ready preview page.
- `src/lib/server/dbInspector.ts`: Updated schema definitions for branding fields.

---
**Implementation Date**: June 4, 2026
**Author**: Gemini CLI Agent (YOLO Mode)
