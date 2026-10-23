# Plan: Provisional Admission & Implicit Conversion Tracking

## Core Concept
1.  **Provisional Phase**: Student gets a "Provisional Admission" (via `is_prov` form). They get a Provisional ID and pay a fee.
2.  **Conversion Phase**: The **same student** later applies for a "Regular/Final" admission (different Form Type). When *that* application is approved, the system considers the student "Converted".
3.  **Reporting**: The report links these two events by matching the `student_id` (User ID).

---

## 1. Database Schema Changes

*   **`form_types` Table**:
    *   **Add**: `is_prov` (Boolean, Default `false`).
    *   **Add**: `code` (Text, Unique). *Example: 'PROV', 'MQ', 'ACPC'.*
        *   *Usage*: This code will be the first part of the Admission Sequence ID.

*   **`admission_forms` Table**:
    *   **Add**: `prov_fee` (Numeric, Default `0`).
        *   *Usage*: The fee amount required for provisional seat confirmation.

*   **`payments` Table**:
    *   **Add**: `payment_mode` (Text) - e.g., 'cash', 'qr', 'cheque'.
    *   **Add**: `reference_no` (Text).
    *   **Constraint Update**: Allow `payment_type` to include `'provisional_fee'`.

---

## 2. Workflow Logic

### **Step 1: Provisional Application**
*   **DEO/Student Action**: Submits an application using a form type where `form_types.is_prov = true`.
*   **Adm Officer Approval**: Approves the provisional application.
*   **ID Generation**:
    *   An Admission ID is generated in the format: `{FormTypeCode}-{Year}-{CourseCode}-{Sequence}` (e.g., `PROV-25-BE-0001`).
    *   `Enrollment ID` (`student_profiles.enrollment_number`) is **NOT** generated or updated at this stage.
*   **Payment**: DEO collects the `prov_fee` (if `> 0`) after the application is approved. Records `payment_mode` and `reference_no`.

### **Step 2: Regular Application (The Conversion Event)**
*   **DEO/Student Action**: The *same student* (identified by `student_id`) creates and submits a **NEW Application** using a Form Type where `form_types.is_prov = false` (a "Regular" or "Final" admission form type).
*   **Adm Officer Approval**: Approves this new "Regular" application.
*   **ID Generation**:
    *   A new Admission ID is generated for this regular application (e.g., `ACPC-25-BE-0005`).
    *   `Enrollment ID` (`student_profiles.enrollment_number`) is generated and populated for this regular application, marking the student's final admission.

---

## 3. Reporting Mechanism: "Provisional to Final Conversion Report"

This report tracks the implicit conversion by looking for a "Regular" approved application from students who previously had an "Approved Provisional" application.

### **Report Logic**

1.  **Identify Provisional Applications**:
    *   Fetch all `applications` (let's call them `A_prov`) where:
        *   `A_prov.status = 'approved'`
        *   `A_prov.form_types.is_prov = true`
    *   These represent the pool of students who got provisional admission.

2.  **Identify Converted Applications**:
    *   For each `A_prov` identified above, check if the same `student_id` has *another* `application` (let's call it `A_final`) where:
        *   `A_final.status = 'approved'`
        *   `A_final.form_types.is_prov = false` (This is the "final" admission)
        *   `A_final.created_at >= A_prov.created_at` (Ensures the final application happened after or concurrently with the provisional one, not before).

### **Report Output Columns**

*   **Student Name/Email**
*   **Provisional Admission ID** (from `A_prov`)
*   **Provisional Application Date**
*   **Final Admission ID** (from `A_final`, empty if not converted)
*   **Final Application Date** (empty if not converted)
*   **Conversion Status**: "Converted" vs "Pending"

### **Key Metrics**

*   **Total Provisional Applications**: Count of `A_prov`.
*   **Converted Students**: Count of `A_prov` for which an `A_final` exists.
*   **Pending Conversion**: Total Provisional - Converted Students.
*   **Conversion Rate**: (Converted / Total Provisional) * 100%.

---

## 4. Implementation Checklist

1.  **DB Migrations**:
    *   Add `is_prov` (Boolean) and `code` (Text) to `form_types` table.
    *   Add `prov_fee` (Numeric) to `admission_forms` table.
    *   Add `payment_mode` (Text) and `reference_no` (Text) to `payments` table.
    *   Update `payments.payment_type` check constraint to include `'provisional_fee'`.
2.  **Backend (`approveApplicationLogic`)**:
    *   Modify admission sequence generation to dynamically use `{FormTypeCode}-{Year}-{Course}-SEQ` format.
    *   Add conditional logic: If `form_types.is_prov` is true, **SKIP** generation of `student_profiles.enrollment_number`.
3.  **Frontend (`deo/applications`)**:
    *   Implement "Collect Provisional Fee" button/modal (QR code, payment details).
    *   Implement "Print Provisional Receipt" button.
4.  **Frontend (`adm-officer/reports`)**:
    *   Implement the "Provisional to Final Conversion Report" based on the described query logic.
