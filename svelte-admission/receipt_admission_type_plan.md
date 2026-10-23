# Plan: Admission-Type Specific Receipt Sequences

This document outlines the step-by-step plan to enhance the tuition and admission fee receipt number generation to support different sequences based on **Admission Type** (e.g., `Regular`, `D2D`, `C2D`), allowing separate sequence tracking for each course.

---

## 📂 Affected Files
*   **Database Migration:** New migration script under [supabase/migrations/](file:///workspaces/admissionapp_v1/supabase/migrations/).
*   **Receipt Utility:** [src/lib/server/receipt.ts](file:///workspaces/admissionapp_v1/src/lib/server/receipt.ts) (sequence retrieval, insertion, and incrementing logic).
*   **API & Server Hooks:**
    *   [src/routes/api/payment/callback/+server.ts](file:///workspaces/admissionapp_v1/src/routes/api/payment/callback/+server.ts) (online payment callback).
    *   [src/routes/api/payment/verify/+server.ts](file:///workspaces/admissionapp_v1/src/routes/api/payment/verify/+server.ts) (payment verification).
    *   [src/routes/adm-officer/applications/[id]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/applications/[id]/+page.server.ts) (manual admission payments).
    *   [src/routes/fee-collector/payments/collect/[admission_id]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/payments/collect/[admission_id]/+page.server.ts) (fee collector payments).
*   **Admin UI & Server Actions:**
    *   [src/routes/admin/receipt-sequences/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/admin/receipt-sequences/+page.server.ts).
    *   [src/routes/admin/receipt-sequences/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/admin/receipt-sequences/+page.svelte).

---

## 🔍 Impact & Backward Compatibility Analysis

### 1. Will this break existing fee structures or payments?
**No.** By designing the database schema and queries with safe fallbacks, existing mechanisms will remain fully functional:
*   **Existing Sequences:** The `admission_type` column will be added with a `DEFAULT 'Regular'`. All existing sequences in the database will automatically be labeled as `'Regular'`.
*   **Sequence Resolution:** During lookup, if no `admissionType` is resolved from the application, or for payments where it is not applicable, the system will fall back to `'Regular'`. This matches the pre-existing records exactly.
*   **No Duplicate Violation:** The new unique constraint `UNIQUE (college_id, course_id, academic_year_id, payment_type, admission_type)` is a refinement of the existing constraints, meaning all old records will remain unique under the new rule.

### 2. Scoping Only to Tuition & Admission Fees
As requested, the partition of sequences by `admission_type` is **only** desired for tuition/admission fees (e.g., `tuition_fee`).
*   **Application Fees (`application_fee`):** These are paid *before* a student is formally admitted or sorted into a specific category/mode like D2D. Therefore, they must **not** be split by admission type.
*   **Implementation Strategy:** In `generateReceiptNumber()`, we will explicitly force `admissionType` to `'Regular'` if the payment type is not a tuition or admission fee type:
    ```typescript
    // Enforce that only tuition fees use split sequences by admission type
    const resolvedAdmissionType = (paymentType === 'tuition_fee' || paymentType === 'admission_fee')
        ? (admissionType || 'Regular')
        : 'Regular';
    ```

---

## 🛠️ Step-by-Step Implementation Details

### Step 1: Database Migration
We need to add the `admission_type` field to the `receipt_sequences` table, set a default value, and update constraints.

#### Proposed SQL Changes:
1.  **Add `admission_type` Column:**
    ```sql
    ALTER TABLE public.receipt_sequences 
    ADD COLUMN IF NOT EXISTS admission_type TEXT NOT NULL DEFAULT 'Regular';
    ```
2.  **Update Constraints:**
    Drop the existing unique constraint and create a new unique index or constraint:
    ```sql
    ALTER TABLE public.receipt_sequences 
    DROP CONSTRAINT IF EXISTS receipt_sequences_unique_scope;

    ALTER TABLE public.receipt_sequences 
    DROP CONSTRAINT IF EXISTS receipt_sequences_payment_type_academic_year_id_college_id_key;

    ALTER TABLE public.receipt_sequences 
    DROP CONSTRAINT IF EXISTS receipt_sequences_unique_course_year;

    ALTER TABLE public.receipt_sequences 
    DROP CONSTRAINT IF EXISTS receipt_sequences_full_unique_key;

    -- Add a composite UNIQUE constraint that includes admission_type
    ALTER TABLE public.receipt_sequences 
    ADD CONSTRAINT receipt_sequences_unique_scope_with_type 
    UNIQUE (college_id, course_id, academic_year_id, payment_type, admission_type);
    ```

### Step 2: Receipt Logic & Sequence Retrieval (`receipt.ts`)
Update the `generateReceiptNumber()` helper in [src/lib/server/receipt.ts](file:///workspaces/admissionapp_v1/src/lib/server/receipt.ts).

1.  **Update `generateReceiptNumber` Parameters:**
    Add `admissionType?: string` (defaulting to `'Regular'`).
2.  **Apply Scoping Condition:**
    ```typescript
    // Force non-tuition/non-admission fees to use the generic 'Regular' sequence
    const targetAdmissionType = (paymentType === 'tuition_fee') 
        ? (admissionType || 'Regular') 
        : 'Regular';
    ```
3.  **Update Database Query:**
    Filter by the resolved `targetAdmissionType` when checking for existing sequences:
    ```typescript
    let { data: sequence, error: fetchError } = await supabase
        .from('receipt_sequences')
        .select('id, current_sequence, prefix')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId)
        .eq('payment_type', paymentType)
        .eq('admission_type', targetAdmissionType) // Filter by admission type
        .maybeSingle();
    ```
4.  **Insert with `admission_type` on Missing Sequence:**
    ```typescript
    const { data: newSeq, error: createError } = await supabase
        .from('receipt_sequences')
        .insert({
            college_id: collegeId,
            course_id: courseId,
            academic_year_id: academicYearId,
            payment_type: paymentType,
            admission_type: targetAdmissionType, // Save resolved admission type
            prefix: defaultPrefix,
            current_sequence: 0
        })
        ...
    ```
5.  **Update `createFeeReceipt`:**
    Add `admissionType` to `ReceiptCreationParams` interface and forward it:
    ```typescript
    export interface ReceiptCreationParams {
        // ... existing params
        admissionType?: string;
    }
    ```

### Step 3: Integrate with Payment Handlers & Collectors
Retrieve the student's/application's `admission_type` and supply it to the receipt generator.

1.  **Online Payment Callback (`callback/+server.ts` & `verify/+server.ts`):**
    Fetch `admission_type` from the `applications` relation during transaction query, then pass it to `createFeeReceipt`:
    ```typescript
    // In database select query:
    // ... select('*, applications(course_id, cycle_id, form_type, admission_type, ...)')
    
    // In createFeeReceipt call:
    admissionType: (transaction.applications as any)?.admission_type || 'Regular'
    ```
2.  **Manual Officer Payments (`applications/[id]/+page.server.ts`):**
    Forward the loaded application's `admission_type` to `createFeeReceipt`:
    ```typescript
    admissionType: app.admission_type || 'Regular'
    ```
3.  **Fee Collector Hybrid Payments (`collect/[admission_id]/+page.server.ts`):**
    Forward the loaded application details' `admission_type` (or `admission_mode`) to `createFeeReceipt`:
    ```typescript
    admissionType: appData.admission_type || 'Regular'
    ```

### Step 4: Admin UI & Sequence Management
Enhance the management panel in [src/routes/admin/receipt-sequences/](file:///workspaces/admissionapp_v1/src/routes/admin/receipt-sequences/) to view and configure separate prefixes/sequences for `Regular`, `D2D`, and `C2D`.

1.  **Update Server Actions (`+page.server.ts`):**
    *   In the `create` action, retrieve `admission_type` from `formData` and pass it to `receipt_sequences` insert.
    *   For non-tuition fees, the server action can default the `admission_type` value to `'Regular'`.
2.  **Update Svelte View (`+page.svelte`):**
    *   Add an **Admission Type** filter select input.
    *   Add an **Admission Type** select dropdown in the "Create Receipt Sequence" modal.
    *   Only show/enable the **Admission Type** select input in the modal if the chosen payment type is tuition/admission fees (to keep configuration clean).
    *   Add **Admission Type** column to the list table.
