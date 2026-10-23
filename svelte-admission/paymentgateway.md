# Payment Gateway Integration Plan: PayU (Redirect Flow)

This document outlines the strategy for integrating PayU as the primary payment gateway for application fees and tuition fees.

## 1. Architectural Overview

The integration follows a **Server-to-Server Hash + Client Redirection** flow (Standard PayU Redirect).

### Sequence of Events:
1.  **Initiate**: User clicks "Pay". Frontend calls `/api/payment/create-order`.
2.  **Generate**: Backend fetches active PayU credentials, creates a `transactions` record, and generates a SHA-512 `hash`.
3.  **Handoff**: Backend returns the hash and parameters to the frontend.
4.  **Redirect**: Frontend auto-submits a hidden HTML form to PayU's endpoint.
5.  **Verify**: User pays. PayU POSTs back to `/api/payment/callback`.
6.  **Update**: Backend verifies reverse hash, updates transaction status, and marks application fee as `paid`.

## 2. Technical Requirements

### PayU Hash Sequence
PayU requires a hash calculated as:
`sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)`

### Reverse Hash (For Verification)
`sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)`

## 3. Implementation Steps

### Phase 1: Backend Security (`src/lib/server/payment.ts`)
- [ ] Implement `generatePayUHash` helper using `crypto` module.
- [ ] Update `createPaymentOrder` to:
    - Fetch `merchant_key` and `merchant_salt` from `payment_gateways.config`.
    - Generate the hash.
    - Return a structured object for PayU (including `surl` and `furl`).
- [ ] Update `verifyPayment` to:
    - Calculate the reverse hash.
    - Compare with the `hash` parameter received in the callback.

### Phase 2: Callback Handler (`src/routes/api/payment/callback/+server.ts`)
- [ ] Ensure the handler correctly parses PayU's POST body.
- [ ] Map PayU status (`success`) to system status (`completed`).
- [ ] Update `applications.application_fee_status` to `paid` if `paymentType === 'application_fee'`.
- [ ] Trigger `ensureStudentEnrolled` if `paymentType === 'tuition_fee'`.

### Phase 3: Frontend Handoff (`src/lib/components/PaymentButton.svelte`)
- [ ] Modify `handlePayment` to detect if the response contains PayU parameters.
- [ ] Dynamically create a hidden `<form>` element, append the parameters as inputs, and call `form.submit()`.

## 4. Database Schema (Verification)

The following structure is required in `payment_gateways.config`:
```json
{
  "merchant_key": "string",
  "merchant_salt": "string"
}
```

## 5. Future Extensions: Multi-Gateway Mapping
To support different gateways for different form types (as discussed):
1.  **Add Column**: `ALTER TABLE payment_gateways ADD COLUMN allowed_form_types TEXT[]`.
2.  **Logic Update**: Modify `createPaymentOrder` to select the gateway where the application's `form_type` exists in `allowed_form_types`.
3.  **Fallback**: Use a gateway with `allowed_form_types = '{}'` as the default.

---
*Created on: 2026-05-01*
