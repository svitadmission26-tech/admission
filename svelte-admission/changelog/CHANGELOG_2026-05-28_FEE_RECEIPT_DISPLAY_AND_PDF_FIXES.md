# Changelog: Fee Receipt Display and PDF Generator Fixes

**Date:** 2026-05-28

## Overview
This update addresses issues with the display of "ACADEMIC YEAR" vs. "SEMESTER" on fee receipts and resolves visual inconsistencies in the generated PDF receipts, specifically for provisional fees.

## Changes Implemented

### 1. Dynamic Fee Period Display Logic (Fee Collector)
*   **Files Modified:** 
    *   `src/routes/fee-collector/payments/collect/[admission_id]/+page.server.ts`
    *   `src/routes/fee-collector/payments/collect/[admission_id]/+page.svelte`
    *   `src/routes/fee-collector/payments/+page.server.ts`
    *   `src/routes/fee-collector/payments/+page.svelte`
*   **Details:**
    *   Updated server-side `load` functions to pass the `userProfile` to the frontend components.
    *   Enhanced the `mapPaymentToReceipt` function to dynamically determine the fee period text.
    *   The logic now strictly displays "SEMESTER" or "ACADEMIC YEAR" based on the `payment.fee_period` database value, but **only** if the user is a `fee_collector` and the payment is a `tuition_fee`. For all other scenarios, it correctly defaults to "ACADEMIC YEAR".
    *   Added the calculated text as a new `semester` property to the `ReceiptData` object passed to the PDF generator.

### 2. Standardized Receipt Header and HTML Display
*   **File Modified:** `src/routes/receipts/print/+page.svelte`
*   **Details:**
    *   Standardized the HTML header block across all receipt layout types (Detailed Tuition, Provisional, Simple Original) to ensure the college/university logo and title are displayed consistently.
    *   Updated the HTML for the Tuition Layout to dynamically use the `feePeriod` variable, replacing hardcoded text.
    *   Updated the `triggerPrint` and `triggerDownload` functions to correctly pass the dynamic "ACADEMIC YEAR" or "SEMESTER" value to the PDF generation utility.

### 3. PDF Generator Alignment Fix
*   **File Modified:** `src/lib/utils/pdfGenerator.ts`
*   **Details:**
    *   Fixed a visual alignment bug in the `createProvisionalReceiptContent` function.
    *   Added the missing `alignment: "center"` property to the university name text object in the header stack, ensuring it is properly centered alongside the address and email, rather than being incorrectly left-aligned next to the logo.
