# Implementation Plan: Fee Collector Reports

## Objective
Enable Fee Collectors to generate and export reports concerning:
1.  **Daily/Date-wise Fee Collections:** Details of payments received within a specific timeframe.
2.  **Admissions Report:** Details of students admitted (account cleared/paid).

This feature will mirror the functionality of the Admission Officer's report system, including the ability to save custom report templates.

## 1. Database & Security

- **Table:** Reuse existing `public.report_templates`.
- **RLS:** The existing policies allow any authenticated user to manage their own templates. No changes required.
- **Permissions:** Ensure `fee_collector` has `SELECT` access to:
    - `payments`
    - `account_admissions`
    - `applications`
    - `users`
    - `courses`
    - `branches`
    (Previous investigations confirm `users` and `applications` access. Will verify `payments` and `account_admissions` access implicitly or add if missing).

## 2. UI/UX Implementation

### A. Report Dashboard (`/fee-collector/reports`)
- **Filters:**
    - Date Range (Start/End) - defaults to Today.
    - Course / Branch.
    - Payment Status (Pending, Completed, Failed).
- **Column Selection:**
    - Transaction ID
    - Payment Date
    - Amount
    - Student Name
    - Admission Number
    - Course
    - Branch
    - Application ID
    - Payment Status
- **Template Management:**
    - "Load Template" dropdown.
    - "Save Template" button.
- **Preview:**
    - Top 10 rows matching criteria.
- **Actions:**
    - "Download CSV".

### B. Navigation
- Add "Reports" link to `FeeCollectorNav.svelte`.

## 3. Backend Logic

### A. Page Load (`/fee-collector/reports/+page.server.ts`)
- Fetch filter options (Courses, Branches).
- Fetch saved templates (`created_by = auth.uid()`).
- Fetch preview data from `payments` table joined with `applications` -> `users`, `courses`.

### B. Export Endpoint (`/fee-collector/export/+server.ts`)
- Accepts filters and selected fields via Query Params.
- Generates CSV file.
- **Query Strategy:**
    - Base table: `payments`
    - Join `applications` (for student details, course).
    - Join `users` (for name, email).
    - Join `account_admissions` (for admission number).
    - Join `courses` & `branches`.

## 4. Development Steps

1.  **Backend Route:** Create `src/routes/fee-collector/reports/+page.server.ts` (Load & Actions).
2.  **Export Handler:** Create `src/routes/fee-collector/export/+server.ts`.
3.  **Frontend:** Create `src/routes/fee-collector/reports/+page.svelte`.
4.  **Navigation:** Update `src/lib/components/FeeCollectorNav.svelte`.
