# Changelog: Payment System & Report UI Refinement
**Date:** 2026-05-12

## Summary of Changes
This session focused on improving the fee collection workflow for fee collectors, refining receipt presentation, and optimizing administrative reports for better visibility.

### 1. Fee Collection (Record Payment Modal)
*   **Two-Column Layout Refactor:** Completely redesigned the "Record Payment" modal into a high-density two-column layout.
    *   **Left Pane:** Added a dynamic "Student & Fee Summary" including student profile info, detailed component-wise fee breakdown, and a visual payment progress bar.
    *   **Right Pane:** Grouped all input fields into a numbered sequential workflow for faster entry.
*   **Strict Fee Splitting:** Refactored splitting logic to strictly use the "Splittable?" (`allow_partial`) configuration from the Fee Structure builder, replacing name-based heuristics.
*   **Gated Logic:** Ensured that splitting and "YEAR/SEMESTER" labels strictly apply only to Tuition/Admission fees.
*   **Modal Refinement:** The "Record Payment" modal now dynamically displays split amounts for each component based on the admin's configuration.
*   **Persistence:** Updated server actions to save the `fee_period` selection into the `payments` table.

### 2. PDF Receipt Generation
*   **Horizontal Header Alignment:** Refactored the PDF header for Tuition and Admission receipts to place the College/University logo and header text side-by-side in a single row.
*   **Gated Logic:** Ensured that "YEAR/SEMESTER" labels and splitting logic only apply to Tuition/Admission fees, leaving Provisional and Application receipts in their standard formats.
*   **Logo Priority:** Hardened logo loading logic with async pre-fetching to prevent connection timeout issues.

### 3. Administrative Reports (Capacity Report)
*   **UI Redesign:** Refactored the `adm-officer` Capacity Report.
    *   Replaced the horizontal course tabs with vertically stacked cards.
    *   Course titles and summary stats are now prominently displayed in card headers.
    *   Tables are directly visible, removing the need for extra navigation clicks.

### 4. Bug Fixes & Improvements
*   **Receipt Sequence System:** Resolved the "random timestamp" bug by implementing independent sequential counters for each fee type (Application, Provisional, Tuition).
*   **Admin Receipt Management:** Fixed non-functional filters in `/admin/receipt-sequences`. Added real-time list filtering, dependent dropdowns (College -> Course), and text-based search.
*   **Payment History Table:** Fixed an issue where payment mode labels (CASH, ONLINE) were missing; labels are now correctly rendered alongside amounts.
*   **Number-to-Words:** Improved currency formatting logic to handle decimals and zero-value fallbacks accurately.
*   **Database:** Created a manual SQL migration script (`new_database/halffullfeepayment.sql`) for the new `fee_period` column.
