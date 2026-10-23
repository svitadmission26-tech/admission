# Receipt Sequence Generation Analysis & Proposed Plan

This document analyzes the root causes of the tuition fee receipt sequence jumping (increasing by `x` instead of 1) in the **Bachelor of Engineering** (BE) and **Diploma Engineering** (DIP) courses under the `Regular` admission type. 

As requested, this is a **read-only verification and analysis**; no code changes will be implemented in this workspace.

---

## 🔍 Root Cause Analysis

We queried the database and analyzed the code to trace why sequence numbers jump during fee collection. We discovered three distinct factors:

### 1. The Auto-Healing Retry Loop (Manual Resets Overridden)
When an administrator updates a sequence in the Admin UI (e.g., setting the sequence back to `i`), the system updates the `current_sequence` tracker in the `receipt_sequences` table. However:
*   The database `fee_receipts` table still contains records with suffixes higher than `i` (e.g., `TUIT-26BE-0322` exists, but the sequence is set to `300`).
*   In `src/lib/server/receipt.ts` -> `createFeeReceipt()`, there is a retry loop of up to 50 attempts to handle unique constraint violations (`23505`) on the `receipt_no` column.
*   When a new fee is collected, the system tries to generate `TUIT-26BE-0301`.
*   The database blocks this insert because `TUIT-26BE-0301` already exists in `fee_receipts`.
*   The backend catches this error, prints a warning, increments the sequence tracker to `301`, and retries.
*   This loops `x` times until it reaches `359` (the first unused number). It successfully inserts `TUIT-26BE-0359` and leaves the database sequence tracker at `359`.
*   **Result:** To the admin, it appears the sequence jumped by `x` during a single fee collection, overriding their manual settings.

### 2. Double-Receipt Generation (Webhook vs. Client-side Verification)
During online payment processing, both the PayU gateway webhook (`/api/payment/callback`) and the student browser confirmation handler (`/api/payment/verify`) execute:
*   Neither check if a receipt or payment record has *already* been created for that `transaction_id`.
*   Because `fee_receipts.transaction_id` does not have a `UNIQUE` constraint, both endpoints successfully call `createFeeReceipt()` for the same transaction.
*   This generates two separate receipts with sequential numbers and updates the sequence tracker twice for a single payment.
*   *Verification:* We ran a database script and confirmed **8 transactions** in the database currently have duplicate receipt numbers generated within seconds of each other.

### 3. Double-Submit Vulnerability in manual Fee Collection Form
In `fee-collector/payments/collect/[admission_id]/+page.svelte`:
*   The submit button ("Confirm & Record Payment") does not disable itself when the form is submitted.
*   If a fee collector double-clicks the button, the browser sends two concurrent POST requests to the `recordPayment` action.
*   Because there is no idempotency check in the backend server action, both requests run concurrently, generating two transactions, two receipts, and two payments, incrementing the sequence twice.

---

## 🛠️ Proposed Changes

### Backend Component

#### [MODIFY] [receipt.ts](file:///workspaces/admissionapp_v1/src/lib/server/receipt.ts)
Remove the retry loop in `createFeeReceipt` so that the sequence number is strictly generated once, following the Admin UI sequence setting. If a conflict occurs, it will throw a database unique key error rather than silently fast-forwarding the sequence tracker.

```typescript
export async function createFeeReceipt(
    supabase: SupabaseClient,
    params: ReceiptCreationParams
) {
    // 1. Generate Receipt Number
    const receiptNo = await generateReceiptNumber(
        supabase,
        params.paymentType || 'tuition_fee',
        params.academicYearId!,
        params.collegeId!,
        params.courseId!,
        params.yearName,
        undefined, // shortCode
        params.formType,
        params.admissionType // Forward admissionType
    );

    // Prepare composite details object for the receipt record
    const compositeDetails = {
        ...(params.details || {}),
        payment_breakdown: params.paymentBreakdown || [],
        fee_components_breakdown: params.feeComponentsBreakdown || [],
        payment_type: params.paymentType || 'tuition_fee'
    };

    // 2. Create Receipt Record
    const { data: receipt, error } = await supabase
        .from('fee_receipts')
        .insert({
            receipt_no: receiptNo,
            transaction_id: params.transactionId,
            application_id: params.applicationId,
            student_id: params.studentId,
            amount: params.amount,
            details: compositeDetails,
            generated_by: params.generatedBy
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating fee receipt:', error);
        throw new Error('Failed to generate receipt record: ' + (error.message || 'Unknown database error'));
    }

    return receipt;
}
### Frontend Component

#### [MODIFY] [collect/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/fee-collector/payments/collect/[admission_id]/+page.svelte)
Import `isLoading` from `$lib/stores/loadingStore` and disable the submit button when `$isLoading` is true to prevent double-submit requests.

```diff
  <div class="d-grid">
-     <button type="submit" class="btn btn-primary btn-lg py-3 fw-bold" disabled={totalCollectingNow <= 0 || initialRemainingAmount <= 0}>
+     <button type="submit" class="btn btn-primary btn-lg py-3 fw-bold" disabled={totalCollectingNow <= 0 || initialRemainingAmount <= 0 || $isLoading}>
          <i class="bi bi-cash-stack me-2"></i> Confirm & Record Payment
      </button>
  </div>
```

---

## 📊 Verification Details

We ran a database verification script to query `fee_receipts` and `receipt_sequences` directly from Supabase, yielding the following results:

1.  **Bachelor of Engineering (BE - Regular):**
    *   **Max Suffix in Receipts:** `TUIT-26BE-0322`
    *   **Sequence Tracker Value:** `358` (Out of sync by `36` due to failed attempts/duplicate hits).
2.  **Diploma Engineering (DIP - Regular):**
    *   **Max Suffix in Receipts:** `TUIT-26DIP-0003`
    *   **Sequence Tracker Value:** `18` (Out of sync by `15` due to failed attempts/duplicate hits).
3.  **No Mismatches in Types:** Verified that all application admission types are stored exactly as `"Regular"` (matching the capitalized value configured in the Admin UI).
