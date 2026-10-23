# Session Context: Visual Template Builder Implementation

## Project Status
The **Visual Drag-and-Drop Template Builder** is fully implemented and verified. It allows admins to design A4 report templates with real-time database variable binding and pixel-perfect PDF output.

## Technical Architecture

### 1. Coordinate System & Scaling
- **Designer (Canvas)**: Uses Pixels (px) at 96dpi. A4 size is defined as 210mm x 297mm.
- **Output (PDF/Print)**: Uses Points (pt) at 72dpi. 
- **Scale Factor**: A universal multiplier of **0.75** is used to convert px to pt.
  - *Example*: 100px in the designer -> 75pt in the PDF.
- **Origin**: Both systems use a (0,0) origin at the literal top-left corner of the page. All internal padding has been removed to maintain synchronization.

### 2. Component Logic (`src/lib/components/reports/visual-builder/`)
- **`VisualBuilder.svelte`**: The coordinator. Manages global state (`layout`), drag/resize coordination, smart snapping, and the magenta alignment guidelines.
- **`CanvasNode.svelte`**: Handles design-time rendering. Distinguishes between `absolute` (top-level) and `relative` (nested inside rows/columns) positioning.
- **`Sidebar.svelte`**: A hover-expandable drawer. Features a recursive schema flattener that provides a searchable autocomplete list of all database fields.

### 3. Data Pipeline
- **API**: `/api/reports/profile-data`
- **Mapping**: The API returns a `flatData` object. Relational paths are mapped as follows:
  - `student.*`: Profile and User data.
  - `application.*`: Top-level application and form_data.
  - `course.college.university.*`: Nested relational branding data.
- **Interpolation**: Handled in `src/routes/print-profile/[applicationId]/+page.svelte` using a robust Regex engine that supports standard `{{variable}}` and `#if/else` blocks.

### 4. Critical Dependencies
- **pdfmake**: Used for PDF generation.
- **dbInspector.ts**: Provides the schema metadata used by the autocomplete search.
- **htmlToPdf.ts**: Custom utility that parses HTML/CSS and maps it to `pdfmake` objects, specifically handling `absolutePosition`.

## Current State & Next Steps
- **State**: The system is stable. WYSIWYG is achieved through zero-margin synchronization.
- **Known Constraints**: Snapping threshold is 5px. Recursion depth for variables is 3 levels.
- **Resume Point**: If continuing, focus on adding more complex components like dynamic tables or multi-page support.

## Relevant Files
- `changelog/uitmpelate_implemntationdone.md`: Detailed feature log.
- `src/lib/utils/htmlToPdf.ts`: The scaling logic.
- `src/routes/api/reports/profile-data/+server.ts`: The data mapping.
- `src/lib/components/reports/visual-builder/VisualBuilder.svelte`: The layout engine.
---
*Created on June 4, 2026, for session resumption.*


