# Admission Cancellation & Transfer Process Plan

This document outlines the implementation plan for enabling Admission Officers (`adm_officer`) to handle admission cancellations and student transfers (course/branch changes).

## 1. Admission Cancellation

### **Objective**
Allow an Admission Officer to officially cancel an admitted student's admission, releasing their seat and documenting the reason.

### **Workflow**
1.  **UI Interface**:
    *   Add a **"Cancel Admission"** button on the `adm-officer/applications/[id]` details page (visible only if status is 'approved').
    *   Clicking the button opens a modal requesting:
        *   **Cancellation Reason** (Required, e.g., "Student Request", "Documents Fake").
        *   **Refund Status** (Optional checkbox: "Initiate Refund").
        *   **Remarks**.

2.  **Backend Logic (`actions: cancelAdmission`)**:
    *   **Status Update**: Change `applications.status` from `'approved'` to `'cancelled'`.
    *   **Seat Release**: Since seat counts are calculated dynamically based on 'approved' status, this automatically releases the seat in the Seat Matrix.
    *   **Audit Log**: Store the cancellation details (Reason, By Whom, Timestamp) in a new `cancellation_logs` table or existing `application_logs`.
    *   **Notification**: Optionally trigger an email to the student confirming cancellation.

3.  **Database Changes**:
    *   No major schema changes for simple status update.
    *   Optional: Create `cancellation_requests` table if a formal approval workflow for cancellation is needed (e.g., Refund approval by Fee Collector). For now, direct action by Officer.

---

## 2. Student Transfer (Branch/Course Change)

### **Objective**
Allow an Admission Officer to move an admitted student from one Course/Branch to another within the same college.

### **Workflow**
1.  **UI Interface**:
    *   Add a **"Transfer / Change Branch"** button on the application details page.
    *   Modal Interface:
        *   **Current Selection**: Display current Course & Branch.
        *   **Target Selection**: Dropdowns to select New Course and New Branch (filtered by availability).
        *   **Vacancy Check**: System should display "Available Seats: X" for the selected target.

2.  **Backend Logic (`actions: transferStudent`)**:
    *   **Validation**:
        *   Check if target seat has vacancy (Target Capacity > Target Admitted).
        *   Ensure target course belongs to the same college.
    *   **Data Update**:
        *   Update `course_id` and `branch_id` in `applications` table.
        *   Update `form_data` if branch-specific fields exist (optional).
    *   **Identity Regeneration (Critical)**:
        *   Since Enrollment Numbers (`COLLEGE_ID`) often encode the Branch/Course Code (e.g., `25-CE-001`), a transfer requires **generating a new Enrollment Number**.
        *   The old Enrollment Number should be archived (maybe in `student_history`).
        *   Generate new `admission_number` and `enrollment_number` for the new branch sequence.
    *   **Fee Handling**:
        *   Flag the application as "Transfer - Fee Review Pending" if fee structures differ.

3.  **Database Changes**:
    *   **`student_transfer_history`** table (Recommended):
        *   `id`, `application_id`, `from_course`, `from_branch`, `to_course`, `to_branch`, `transfer_date`, `transferred_by`.
    *   Update `applications` table to potentially track `previous_enrollment_number`.

---

## 3. Implementation Steps

### **Step 1: Database Setup**
*   Create `student_transfer_history` table to track movements.
*   Add `cancellation_reason` and `cancellation_date` columns to `applications` (if not using a separate log table).

### **Step 2: Backend Actions**
*   Implement `cancelAdmission` action in `adm-officer/applications/[id]/+page.server.ts`.
*   Implement `transferStudent` action:
    *   Logic to fetch vacancy.
    *   Logic to call `generateCollegeId` for the new branch.
    *   Transaction to update application and insert history record.

### **Step 3: Frontend UI**
*   Update `adm-officer/applications/[id]/+page.svelte`.
*   Add "Cancel" and "Transfer" modals.
*   Integrate vacancy lookup (maybe via a `use:enhance` form or API endpoint).

### **Step 4: Testing**
*   Verify seat count updates on Dashboard after cancellation.
*   Verify new Enrollment Number generation after transfer.
