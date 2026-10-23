# Changelog - May 21, 2026

## Summary of Fixes: Application Uniqueness, Fee Collection, and Enrollment Logic

### 1. Application Uniqueness & Duplicate Prevention
- **Database Enforcement**: Created a migration (`20260521120000_fix_application_uniqueness.sql`) to add a `UNIQUE` constraint on `(student_id, course_id, cycle_id, form_type)`. This strictly prevents identical duplicate applications for the same course and category.
- **Draft Logic Refactoring**: 
    - Updated server-side `saveApplication` (both Student and DEO routes) to search for existing drafts *without* being restricted by `branch_id`. This allows a student to start a draft without a branch and later update it with a selection without creating a second record.
    - The server now automatically updates existing records if found, instead of returning an "already exists" error.
- **Frontend State Sync**: Improved the "Silent Save" logic in `src/routes/student/apply/+page.svelte` to capture the server-assigned application ID and update the local state immediately before submission, preventing "Missing Application ID" errors.

### 2. Fee Collection & Payment Robustness
- **Administrative Bypass**: Refactored `recordPayment` in `src/routes/fee-collector/payments` to use an administrative Supabase client. This bypasses RLS restrictions that were blocking Fee Collectors from inserting records into `transactions` and `payments`.
- **Auto-Scheme Resolution**: Implemented logic to automatically identify and assign the "General" fee scheme (or the best available fallback) during payment collection if one hasn't been manually assigned yet. This prevents payments from being blocked by a missing scheme.
- **UUID Syntax Fix**: Resolved the `invalid input syntax for type uuid: "null"` error by properly handling Javascript `null` values and `"null"` string literals in database query filters.
- **Transaction Data Fix**: Corrected a bug where the collector's user ID was incorrectly being saved in the `student_id` field of the transaction record.

### 3. DEO Role Improvements
- **Flexible Form Types**: Updated the DEO application Zod schema to remove the restrictive enum for `form_type`. DEOs can now process applications for all active categories (including `GCAS`).
- **Submission Guard**: Enhanced `src/routes/deo/apply/+page.svelte` to ensure that if the preliminary draft save fails, the submission process is halted with a clear error message.

### 4. Enrollment Number & Metadata-Driven IDs
- **Legacy Prefix Removal**: Cleared stale records from `enrollment_sequences` that were using the old `ENR-` legacy format.
- **Format Verification**: Confirmed that future enrollment numbers will follow the new metadata-driven format (e.g., `26BCABCAG001`) based on Course, Branch, and Category codes.
- **Student Reset**: Manually reset the enrollment status for a specific BCA student who had incorrectly received a BE-prefixed ID, allowing them to be re-enrolled with the correct BCA identifier.

### 5. New Migrations Prepared
- `supabase/migrations/20260521120000_fix_application_uniqueness.sql`: Data cleanup and uniqueness enforcement.
- `supabase/migrations/20260521130000_fix_fee_collector_rls.sql`: Permanent RLS permissions for the fee collector role.
