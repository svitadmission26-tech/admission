# Changelog: Payment UI & Granular Verification Enhancements
**Date:** 2026-05-20

## Summary of Changes
This session focused on enhancing the provisional fee collection experience, restoring granular document-level verification controls for staff, and improving the visibility of student identifiers across administrative modules.

### 1. Provisional Fee Collection UI
*   **Two-Column Modal Redesign:** Overhauled the "Collect Provisional Fee" dialog in the DEO applications route.
    *   **Left Pane:** Features the QR code, payment amount badge, and input controls (Payment Mode & Reference No).
    *   **Right Pane:** Added a clear, 5-step instructional guide for scanning and recording UPI payments.
*   **Visual Polish:** Increased modal size to `modal-lg` and added success-themed styling for a more professional payment recording experience.

### 2. Bulk Verification System Overhaul
*   **Granular Document Controls:** Restored the ability to approve or reject individual documents within the bulk verification UI for both **DEO** and **Admin Officer** roles.
    *   **Individual Approval:** Added a "Checkmark" button for single-click document approval.
    *   **Status Visualization:** Implemented success (`bi-check-circle-fill`) and error (`bi-x-circle-fill`) overlays on document thumbnails for instant feedback.
    *   **Rejection Workflow:** Maintained the detailed rejection reason modal for individual documents while ensuring application-level status syncing.
*   **College ID Visibility:** Synchronized the applications list to display the **College ID (Enrollment Number)** prominently next to student names in the verification routes, providing critical context for staff.
*   **Layout & UX Refinement:**
    *   **Non-Scrolling Panel:** Refactored the document thumbnail container to use `flex-wrap` instead of horizontal/vertical scrolling, ensuring all thumbnails fit naturally within the application card.
    *   **Alignment Fixes:** Standardized document card dimensions and button heights to prevent layout overlaps and ensure a clean, grid-like appearance.

### 3. Bug Fixes & Technical Debt
*   **Database Relationship Fix:** Resolved a `PGRST200` error in the Admin Officer's applications list by correcting the join relationship from `profiles` to the canonical `student_profiles`.
*   **Structural Integrity:** Fixed redundant HTML tags in the bulk verification templates that were causing application rows to overlap when expanded.

## Impact
Staff members now have a more robust and granular workflow for verifying documents and collecting provisional fees. The improved layout and visibility of College IDs reduce the cognitive load for DEOs and Officers, leading to faster and more accurate admission processing.
