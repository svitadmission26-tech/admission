# Changelog: Application Fee Flow & Callback Fixes 
**Date:** 2026-05-12 (v4)

## Summary of Changes
This update resolves critical gaps in the application fee collection flow, specifically for manual payments by Admission Officers and automated gateway callbacks.

### 1. Manual Application Fee Recording (Adm-Officer)
*   **Sequential Receipts:** Fixed the `markAppFeePaid` action in the Admission Officer's view. It now correctly calls the sequential receipt generator, ensuring all manual payments receive a proper `APP-` prefix number.
*   **Audit Trail:** Manual payments are now recorded in **three** places (matching the automated flow):
    1.  `transactions` table (with a `MANUAL-` prefix).
    2.  `fee_receipts` table (the sequential record).
    3.  `payments` table (the accounting record for the dashboard).
*   **Data Accuracy:** Improved the application lookup to include College and Academic Year details, ensuring the receipt generator doesn't hit a fallback "random number" bug.

### 2. Gateway Callback Robustness
*   **Status Sync:** Fixed a bug in the `/api/payment/callback` handler where successful payments (e.g., via PayU) were not updating the `application_fee_status` in the `applications` table.
*   **Automation:** The callback now correctly sets the status to `paid`, ensuring students can immediately proceed to the next step of the admission process after returning from the gateway.

## Impact
These fixes ensure that every application fee payment—whether automated or manual—is fully accounted for, correctly numbered, and instantly visible to both staff and students.
