# Implementation Plan: Direct Admission on Submit

## Objective
Introduce a `direct_admission_on_submit` flag for form types. When enabled, applications of this form type bypass the manual verification and approval queue entirely. Instead, they are automatically granted admission (status changes to `approved` and an `account_admissions` record is created) immediately upon successful submission and application fee payment.

## Conflict Verification & Safety Checks
I have thoroughly analyzed the codebase for potential conflicts. Here is what was verified:
1. **RLS (Row Level Security) Constraints (RESOLVED)**: Students do not have database-level permissions to update their application status to `approved` or insert records into the `account_admissions` and `admission_sequences` tables. If we trigger the approval logic during the `submitApplication` action using the student's normal token, it will crash. **Fix**: The auto-approval hook will be strictly executed using the `supabaseAdmin` (Service Role) client to bypass RLS safely during these background triggers.
2. **Provisional Admission Logic (SAFE)**: The `approveApplicationLogic` already dynamically checks if a form type is "provisional" (`is_prov`). Direct admission will safely inherit this and generate the correct `provisional` or `confirmed` enrollment status.
3. **Existing `auto_approve_on_verification` Flag (SAFE)**: This new flag happens a step earlier (on submit/payment instead of on verification). They do not conflict. If `direct_admission_on_submit` is true, the application never enters the `submitted` queue, effectively overriding/bypassing the verification step entirely.
4. **Merit Calculation (CAVEAT)**: If an administrator accidentally enables this flag on a form type that requires Merit Calculations (e.g., ACPC Merit), it will skip the merit generation phase. This is an administrative configuration responsibility, but the system logic will safely process it without crashing.

## Implementation Steps

### 1. Database Schema
- **Action**: Add a new boolean column to the `form_types` table.
- **SQL**: `ALTER TABLE public.form_types ADD COLUMN direct_admission_on_submit BOOLEAN DEFAULT false;`

### 2. Admin UI Configuration
- **File**: `src/routes/admin/form-types/+page.server.ts`
  - Update zod schema to include `direct_admission_on_submit: z.coerce.boolean()`.
  - Extract the checkbox value from `formData` during insert/update operations.
- **File**: `src/routes/admin/form-types/+page.svelte`
  - Add a checkbox for "Direct Admission on Submit" in both the "Create New Form Type" modal and the Edit modal.

### 3. Application Submission Logic (Zero Fee Scenario)
- **File**: `src/routes/student/apply/+page.server.ts` (action: `submitApplication`)
- **File**: `src/routes/deo/apply/+page.server.ts` (action: `submitApplication`)
  - **Logic**: Fetch the `direct_admission_on_submit` flag. If `true` AND the application fee is `0` (i.e., `application_fee_status === 'not_applicable'`):
    - Initialize the `supabaseAdmin` client.
    - Automatically call `approveApplicationLogic(supabaseAdmin, ...)` to instantly approve the application and generate the admission sequence.

### 4. Payment Verification Logic (Fee Paid Scenario)
Because applications with fees require payment *before* they are considered fully submitted, the auto-approval must trigger after the payment is verified.
- **File**: `src/routes/api/payment/verify/+server.ts`
  - **Logic**: In the block handling `paymentType === 'application_fee'`, fetch the `direct_admission_on_submit` flag.
  - If `true`, call `approveApplicationLogic(supabaseAdmin, ...)` automatically after updating the fee status to `paid`.
- **File**: `src/routes/deo/apply/+page.server.ts` (action: `recordPayment`)
  - **Logic**: After inserting the manual payment record, check the flag. If `true`, call `approveApplicationLogic(supabaseAdmin, ...)`.
- **File**: `src/routes/adm-officer/applications/[id]/+page.server.ts` (action: `markFeePaid`)
  - **Logic**: Similar check. If `direct_admission_on_submit` is true, call `approveApplicationLogic(supabaseAdmin, ...)`.
- **File**: `src/routes/college-auth/applications/+page.server.ts` (action: `markFeePaid`)
  - **Logic**: Implement the same check and auto-approval trigger.

## Verification
- Test zero-fee direct admission (Student and DEO).
- Test paid direct admission (PayU Gateway and DEO Manual Record).