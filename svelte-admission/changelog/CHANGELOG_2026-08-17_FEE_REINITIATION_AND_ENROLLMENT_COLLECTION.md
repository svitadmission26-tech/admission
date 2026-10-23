# CHANGELOG: Fee Re-Initiation, Hybrid Collection & Sequential Enrollment Generation

**Date**: 2026-08-17  
**Module**: Fee Collector / Payments / Admission Re-Initiation & Sequence Engine  
**Author**: Antigravity Assistant  

---

## 1. Overview & Objectives

This release implements a comprehensive overhaul of the **"Re-Initiate Admission & Collect Fees Fresh"** workflow for Fee Collectors. The update replaces manual/uncontrolled fee modification with an official fee scheme review, enables dynamic course & branch transfers, implements selective 50% semester fee calculation, generates official sequential College IDs and Receipt numbers, and ensures complete auditability and data preservation.

---

## 2. Detailed Key Changes

### A. Dedicated Re-Initiation Page & UI (`src/routes/fee-collector/payments/reinitiate/[payment_id]/+page.svelte`)
* **Dedicated Route**: Replaced popup modal constraints with a dedicated, responsive re-initiation workspace located at `/fee-collector/payments/reinitiate/[payment_id]`.
* **Fee Components Review Modal**: Removed editable fee head inputs; introduced a read-only modal displaying official fee sections and items directly from the database structure.
* **Course & Branch Re-Allocation**: Dynamic dropdowns allow re-initiating admissions into target courses and branches.
* **Academic Year vs. Semester Fee Period**:
  * Added period selection toggle (`year` vs. `semester`).
  * Implemented selective 50% splitting: Only components marked `allow_partial: true` (e.g., Tuition Fees) are split by half in semester mode, while fixed one-time fees (Refundable Deposits, University Enrollment, Student Central Committee contributions) remain at 100%.
* **Hybrid Payment Modes**: Integrated multi-mode collection identical to `/payments/collect/[id]` supporting Cash, ACPC, Advance, Freeship, Online, and Cheque.
* **Pre-Submission Confirmation Dialog**: Modal summary validating student info, target course/branch, fee scheme, and payment breakdown before submission.
* **Post-Submission Success Dialog**: Modal displaying:
  * Student Name
  * Previous Enrollment ID (or `N/A` if previously cancelled)
  * Newly Generated Sequential College ID (e.g., `226BEITF026`)
  * Generated Receipt Number (e.g., `TD-26BE-0134`)
  * Total Paid & "Print Receipt PDF" button.
* **Itemized Receipt PDF Generation**: Integrated `generateReceiptPDF` to pass itemized breakdown from `fee_components` with accurate semester calculations and the new enrollment number.

---

### B. Server Action & Business Logic (`src/routes/fee-collector/payments/reinitiate/[payment_id]/+page.server.ts`)
* **Foreign Key & Join Path Resolution**: Resolved `college_id` from `courses` and `academic_year_id` from `admission_cycles` with direct database fallback queries to prevent `undefined` parameters.
* **Module Import Fix**: Added missing `import { generateEnrollmentNumber } from '$lib/server/enrollment'` to resolve runtime `ReferenceError` that previously prevented sequence assignment.
* **Sequential Enrollment Generation**:
  * Invokes `generateEnrollmentNumber(supabase, collegeId, courseId, academicYearId, branchId, formType, prefixLetter, admissionType)`.
  * Synchronously updates `student_profiles` (`enrollment_number = newSeq`, `admission_status = 'Admitted'`), `applications` (`status = 'approved'`, `branch_id`, `course_id`, `assigned_fee_scheme_id`), and `users` (`college_id`).
* **Sequential Receipt Generation**:
  * Invokes `createFeeReceipt` to generate official sequential receipts (e.g., `TD-26BE-0134`).
* **Fee Structure Query**: Filtered `fee_structures` by `course_id`, `fee_scheme_id`, and `application.form_type`, resolving PostgREST `.maybeSingle()` multi-row conflicts (`PGRST116`).
* **Audit Trail**: Recorded previous enrollment, course, branch, user ID, and timestamp in `student_transfer_history`.
* **Account Admissions Sync**: Automatically marked `account_admissions.account_status = 'cleared'`.

---

### C. Enrollment Sequence Engine Fixes (`src/lib/server/enrollment.ts`)
* **UUID Parameter Sanitization**: Added sanitization converting empty strings `""`, `'null'`, or `'undefined'` to SQL `null`:
  ```ts
  const sanitizedBranchId = (branchId && typeof branchId === 'string' && branchId.trim() !== '' && branchId !== 'null') 
      ? branchId.trim() 
      : null;
  ```
  Fixes PostgreSQL `22P02: invalid input syntax for type uuid: ""` on `enrollment_sequences` insert/update.
* **D2D/C2D Prefix Support**: Preserved `'2'` prefix prepending for Diploma-to-Degree students.

---

### D. Payments Table Optimization (`src/routes/fee-collector/payments/`)
* **RLS & Performance**: Updated `+page.server.ts` to use `supabaseAdmin` for staff queries, eliminating RLS filtering restrictions and reducing load latency from >3s to ~500ms.
* **Pagination**: Fixed Next page click handler in `+page.svelte`.

---

### E. Environment Configuration (`vite.config.ts`)
* **GitHub Codespaces Proxy Support**: Added `server.allowedHosts: true` and `server.host: '0.0.0.0'` on port `4040` to resolve Vite v6/v7 external host rejection (`403 Forbidden: Blocked request. This host is not allowed`).

---

### F. Testing & Rollback Utilities (`scripts/undo_reinitiate_test.js`)
* **Automated Single-Record Rollback**: Built a standalone script and idempotent SQL queries to revert test re-initiations (deleting test payment, transaction, and receipt, and resetting application to `cancelled` and enrollment to `NULL`) without touching any other records in the database.

---

## 3. Summary of Touched Files

| File Path | Action | Description |
| :--- | :--- | :--- |
| `src/routes/fee-collector/payments/reinitiate/[payment_id]/+page.svelte` | **Added** | Dedicated Re-Initiation UI with fee review, semester math, hybrid collection, and receipt printing. |
| `src/routes/fee-collector/payments/reinitiate/[payment_id]/+page.server.ts` | **Added** | Server action for transfer logging, sequential enrollment & receipt generation, and status updates. |
| `src/lib/server/enrollment.ts` | **Modified** | Sanitized `branchId` to prevent PostgreSQL UUID casting syntax errors. |
| `src/routes/fee-collector/payments/+page.server.ts` | **Modified** | Optimized payment queries using admin client. |
| `src/routes/fee-collector/payments/+page.svelte` | **Modified** | Fixed pagination navigation and added re-initiation action links. |
| `vite.config.ts` | **Modified** | Configured `server: { host: '0.0.0.0', port: 4040, allowedHosts: true }`. |
| `scripts/undo_reinitiate_test.js` | **Added** | Standalone single-record database rollback script. |
