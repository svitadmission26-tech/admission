# Changelog: Dynamic Report Builder & PDF Profile Generation
**Date:** 2026-05-20

## Summary of Changes
This session transformed the Report Builder from a static configuration tool into a professional-grade dynamic design environment. We implemented high-fidelity PDF generation for student profiles and unlocked full database access for custom report templates.

### 1. HTML Profile Templates & PDF Engine
*   **pdfmake Integration:** Replaced browser-native printing with a high-quality PDF generation engine. This ensures single-page consistency across all browsers and devices.
*   **HTML-to-PDF Utility:** Developed `src/lib/utils/htmlToPdf.ts` to recursively map standard HTML tags and inline CSS styles to the `pdfmake` JSON format.
*   **Enhanced Templating:** 
    *   Upgraded the interpolation engine to support Handlebars-style conditional logic (`{{#if ...}}`).
    *   Added support for square-bracket notation in variable paths (e.g., `{{marks.[sub].obtained}}`) to handle complex subject mapping.
    *   Implemented "Fuzzy Subject Mapping" in the backend to resolve simple keys like `math` to technical DB entries like `Mathematics (Theory)`.

### 2. Report Builder UX (3/9 Sidebar Layout)
*   **Layout Refactor:** Redesigned the Report Builder into a high-density 3/9 grid layout.
    *   **Sidebar (3 cols):** Houses the Base Table selection and the new live Variable Picker.
    *   **Editor (9 cols):** Provides a maximized, professional-grade HTML/CSS editor area.
*   **Designer Handbook:** Replaced the static variable list with a centralized handbook modal explaining syntax, data prefixes, and advanced templating tips.
*   **Contextual UI:** The sidebar automatically switches between the "Schema Tree" (for tabular CSV reports) and the "Variable Picker" (for HTML profiles) based on the selected report type.

### 3. Dynamic Variable Picker (Live Schema Explorer)
*   **Zero-Maintenance Fields:** Replaced hardcoded lists with a live explorer that scans the database schema in real-time.
*   **Dynamic Form Integration:** The picker now automatically extracts custom fields (keys and labels) from your JSON Admission Forms.
*   **Granular JSON Folders:** Grouped dynamic fields into expandable folders (e.g., "Form Data", "Profile Data"). Direct selection of entire JSON blobs is disabled in favor of granular sub-field picking.
*   **Smart Path Mapping:** Implemented an intelligent mapper that translates technical join paths (e.g., `users!student_id.full_name`) into user-friendly template paths (`student.full_name`) with a single click.
*   **Data Filtering:** Automatically hides technical columns (IDs, FKs) and non-text fields (File uploads, Images, Document data) to keep the picker focused on reportable data.
*   **Merit Data:** Explicitly included Merit Rank, Merit Score, and individual subject marks extracted from form table sections.

### 4. Staff Print Workflow
*   **Omni-Role Triggers:** Integrated "Print Profile" buttons across all staff dashboards (Admission Officer, DEO, College Authority, and University Authority).
*   **Intelligent Filtering:** Staff are presented with a template selection modal that only shows profiles linked to the specific application's form type (e.g., ACPC, MQ/NRI).

### 5. Stability & Fixes
*   **Svelte 5 Compatibility:** Resolved a compilation conflict between legacy `<slot>` syntax and new `{@render}` snippets in the help components.
*   **Security:** Transitioned metadata fetching to the Service Role client on the server to ensure Admins can always see the full schema regardless of RLS restrictions.
*   **Configuration Safety:** Restored Base Table locking for Tabular reports while keeping it unlocked for the more flexible HTML profile designer.

## Impact
Admins now have a powerful, "low-code" environment to design any document—from identity cards to complex merit forms—using real database data. Staff can generate professional PDFs with one click, ensuring institutional branding and data accuracy are maintained.
