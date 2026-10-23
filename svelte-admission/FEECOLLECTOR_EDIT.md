# Fee Collector Enhancements Plan

## Objective
Allow fee collectors to:
1. Edit a student's full name inline directly from the Fee Collection page, ensuring the updated name reflects on generated receipts.
2. Edit payment history records (date, receipt number, amount, payment breakdown, etc.) via a dedicated edit page to correct any human errors during fee collection.

## Key Files & Context
- `src/routes/fee-collector/payments/collect/[admission_id]/+page.svelte`
- `src/routes/fee-collector/payments/collect/[admission_id]/+page.server.ts`
- `src/routes/fee-collector/payments/+page.svelte`
- **New Files:**
  - `src/routes/fee-collector/payments/edit/[payment_id]/+page.svelte`
  - `src/routes/fee-collector/payments/edit/[payment_id]/+page.server.ts`

## Implementation Steps

### 1. Inline Student Name Editing
**`+page.svelte` (Collect Fees UI):**
- Add state variables: `isEditingName` (boolean), `editNameValue` (string).
- Update the student name display section (around line 161) to show an input field with "Save" and "Cancel" buttons when `isEditingName` is true.
- When false, display the `student.full_name` alongside a small pencil/edit icon.
- Implement a function to submit the updated name to a new server action `?/updateStudentName`.

**`+page.server.ts` (Collect Fees Server):**
- Add an `updateStudentName` action.
- Action will use `supabaseAdmin` to bypass RLS and update the `users` table's `full_name` column based on the provided `student_id`.

### 2. Payment Editing (Separate Page)
**`+page.svelte` (Payment History UI - both main and collect pages):**
- Add an "Edit" button (pencil icon) in the Action column of the Payment History tables.
- The button will navigate to `/fee-collector/payments/edit/[payment_id]`.

**New Route: `edit/[payment_id]/+page.server.ts`:**
- `load` function: Fetch the payment record from the `payments` table by `payment_id`, ensuring the user is a `fee_collector`.
- `actions.updatePayment`: A server action to update the `payments` record using `supabaseAdmin`. Updates will include `payment_date`, `receipt_number`, `amount`, and `payment_breakdown`. 
- Optionally update the linked `transactions` record if applicable (syncing amount and date).

**New Route: `edit/[payment_id]/+page.svelte`:**
- Create a form UI pre-filled with the loaded payment data.
- Fields to edit: Payment Date, Receipt Number, Total Amount, and a dynamic breakdown of payment modes (Cash, Online, Cheque, etc., with amounts and references).
- Use Svelte's `use:enhance` to submit the form, show a loading state, and toast notifications upon success/failure.
- On successful update, redirect the user back to the main payments page (`/fee-collector/payments`).

## Verification & Testing
1. Navigate to `/fee-collector/payments/collect/[admission_id]`.
2. Click the edit icon next to the student's name, change the name, save it, and verify the name updates on the UI and in the database.
3. Download/Print a receipt and confirm the updated name appears.
4. Locate a payment in the Payment History table, click "Edit".
5. Modify the payment date, receipt number, and payment mode breakdown in the new edit page.
6. Save the payment and verify it updates in the database and reflects correctly on the Payment History table and generated receipts.
