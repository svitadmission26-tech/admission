what# Implementation Plan: Application Form Fee Integration

This document outlines the phased approach to integrate application form fees into the system, covering database changes, UI updates, and backend logic for student and administrator workflows.

## Requirements Recap:

1.  **Application Form Fee:** Add `form_fee` to `admission_forms`.
2.  **Submission Flow:** Allow application submission *first*. Its status becomes `submitted`.
3.  **Payment Flow:**
    *   After submission, if `form_fee > 0`, prompt for payment.
    *   **Student:** Pay online only (Mock payment gateway integration).
    *   **DEO:** Pay online OR record offline payment (Cash/Cheque/Reference Number).
    *   **Later Payment:** Student can navigate to a dedicated payment page (`/student/payments`) to complete payment later.
    *   **One-time Payment:** Once the application fee is paid, the payment option should be disabled/hidden.
4.  **Verification Visibility:** Display "Form Fee Status" (Paid/Pending) in Admission Officer (`/adm-officer/applications`) and College Authority (`/college-auth/applications`) application lists/details.
5.  **Manual Override:** Allow Adm Officer/College Auth to manually mark an application fee as "Paid" in cases of payment failures, manual processing, or network issues. This should ideally create an auditable payment record.

---

## Detailed Implementation Plan:

### Phase 1: Database Schema Updates

*   **File:** `supabase/add_application_fee_columns.sql`
*   **Table:** `public.admission_forms`
    *   **Add Column:** `form_fee NUMERIC(10, 2) NOT NULL DEFAULT 0`
    *   **Reason:** To define the fee amount for each specific admission form.
*   **Table:** `public.payments`
    *   **Add Column:** `payment_type TEXT NOT NULL DEFAULT 'tuition_fee'`
    *   **Constraint:** Add `CHECK (payment_type IN ('application_fee', 'tuition_fee', 'other'))`
    *   **Reason:** To distinguish between different types of payments for an application (e.g., application fee vs. tuition fee).
*   **Table:** `public.applications`
    *   **Add Column:** `application_fee_status TEXT NOT NULL DEFAULT 'not_applicable'`
    *   **Constraint:** Add `CHECK (application_fee_status IN ('not_applicable', 'pending', 'paid', 'waived'))`
    *   **Reason:** To quickly query and display the payment status of the application form fee without complex joins.

### Phase 2: Admin Interface - Form Management

*   **File:** `src/routes/admin/forms/+page.svelte` (UI) and `src/routes/admin/forms/+page.server.ts` (Backend)
*   **UI (`+page.svelte`):**
    *   Add an input field for `Form Fee` (NUMERIC) to the "Add New Form" and "Edit Form" modals.
*   **Backend (`+page.server.ts`):**
    *   Modify `createForm` and `updateForm` actions to accept `form_fee` from the form data and save it to `admission_forms`.

### Phase 3: Application Submission Flow (Student/DEO)

*   **File:** `src/routes/student/apply/+page.svelte` (UI) and `src/routes/student/apply/+page.server.ts` (Backend)
*   **Backend (`+page.server.ts`):** (In `saveApplication` and `submitApplication` actions)
    *   When an application is created/updated, fetch the `admission_form` details, including `form_fee`.
    *   If `form_fee > 0`, set `applications.application_fee_status = 'pending'`.
    *   If `form_fee = 0`, set `applications.application_fee_status = 'not_applicable'` (or 'paid' if logic dictates immediate payment confirmation).
*   **Student UI (`+page.svelte`):**
    *   Fetch `form_fee` along with the application data.
    *   If `application.application_fee_status === 'pending'`, display a prominent section for "Application Fee Payment".
    *   Show "Amount Due: [form_fee]".
    *   Add a "Pay Now (Online)" button (Mock payment gateway integration).
    *   After successful payment (mock), update `applications.application_fee_status` to 'paid' and insert a `payments` record.
    *   If `application.application_fee_status === 'paid'`, disable/hide payment options.

### Phase 4: Payment Processing Integration

*   **File:** `src/lib/server/payments.ts` (New helper) or integrate into existing actions.
*   **Function:** `recordApplicationFeePayment(supabase, applicationId, amount, paymentMethod, reference)`
    *   Inserts into `payments` table with `payment_type = 'application_fee'`.
    *   Updates `applications.application_fee_status = 'paid'`.
*   **Student UI:**
    *   On "Pay Now" click, call this backend function.
*   **DEO UI:**
    *   Modify DEO form submission to allow `application_fee` payment recording, calling the same function.

### Phase 5: Verification & Manual Override (College Auth / Adm Officer)

*   **File:** `src/routes/adm-officer/applications/+page.svelte`, `src/routes/adm-officer/applications/+page.server.ts` (Similar for College Auth)
*   **Backend (`+page.server.ts` load function):**
    *   Fetch `applications.application_fee_status`.
*   **UI (`+page.svelte`):**
    *   Display "Form Fee Status: [Pending/Paid/Waived]" prominently in the application list and detail views.
    *   Add a "Mark as Paid / Waive Fee" button/action.
*   **Backend Action:** `markApplicationFeeStatus` (takes `application_id`, `new_status`, `reason?`).
    *   Updates `applications.application_fee_status`.
    *   If marking as 'paid', optionally insert a manual `payments` record (`payment_type='application_fee'`, `payment_method='manual'`, `amount=form_fee`, `status='completed'`).
### Phase 6: Student Payments Page
*   **File:** `src/routes/student/payments/+page.svelte` (UI) and `src/routes/student/payments/+page.server.ts` (Backend)
*   **Backend (`+page.server.ts` load function):**
    *   Fetch student's applications with `form_fee` and `application_fee_status`.
    *   Fetch existing `payments` of `payment_type='application_fee'`.
*   **UI (`+page.svelte`):**
    *   List applications with pending application fees.
    *   Provide "Pay Now" button (Online payment flow).
    *   Display successful application fee payments.
---
This plan integrates the requirements across different roles and flows, ensuring a robust and auditable system for application form fees.











