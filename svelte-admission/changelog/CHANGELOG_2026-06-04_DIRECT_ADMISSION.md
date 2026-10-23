# Changelog: Direct Admission on Submit

**Date:** 2026-06-04

## Overview
Implemented the "Direct Admission on Submit" feature, allowing specific form types to bypass the manual verification and approval queue. Applications with this flag enabled are automatically admitted (status set to `approved` and admission sequence generated) immediately upon submission (if free) or upon successful application fee payment.

## Changes Implemented

### 1. Database & Schema
*   **Migration**: Added `direct_admission_on_submit` boolean column to `public.form_types`.
*   **Configuration**: Administrators can now toggle this flag for any form type.

### 2. Administrative Control
*   **Form Type Management**: Updated the "Manage Form Types" UI to include a "Direct Admission (Bypass Entire Queue)" checkbox.
*   **Audit Trail**: Auto-admissions are tagged with specific comments identifying the trigger (e.g., "Direct Admission on Submit (Zero Fee)").

### 3. Application Lifecycle Hooks
*   **Zero-Fee Submissions**: Student and DEO routes now trigger auto-approval instantly if the form fee is 0.
*   **Online Payments**: The `/api/payment/verify` route triggers auto-approval immediately after the PayU gateway confirms a successful application fee payment.
*   **Manual Overrides**: DEO, Admission Officer, and College Authority manual fee payment actions now trigger auto-approval if the flag is enabled.

### 4. Technical Reliability
*   **RLS Bypass**: Auto-approval logic uses the `supabaseAdmin` service role to ensure backend operations (inserting into `account_admissions`, incrementing sequences) succeed even when triggered by student-initiated actions.
*   **Provisional Sync**: Correctly respects the `is_prov` status of the form type during auto-admission.

## Files Modified
*   `src/routes/admin/form-types/+page.server.ts`
*   `src/routes/admin/form-types/+page.svelte`
*   `src/routes/student/apply/+page.server.ts`
*   `src/routes/deo/apply/+page.server.ts`
*   `src/routes/api/payment/verify/+server.ts`
*   `src/routes/adm-officer/applications/[id]/+page.server.ts`
*   `src/routes/college-auth/applications/+page.server.ts`
*   `supabase/migrations/20260604000000_add_direct_admission_flag.sql`
