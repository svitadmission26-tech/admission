# Test Plan: Summary of Recently Implemented Functionalities

This document provides a structured test plan to verify the changes implemented during this session, including PayU integration, College ID formatting, and staff manual overrides.

---

## 1. Inquiry System Validation
**Goal**: Ensure that public users cannot submit inquiries without specifying at least one course.

*   **Test Case 1.1**: Open a public inquiry form. Try to click "Submit" without adding any courses.
    *   **Expected**: The form is blocked; a red warning appears: *"At least one Course Preference is required."*
*   **Test Case 1.2**: Add a course, then remove it so the list is empty.
    *   **Expected**: A dashed red box appears informing the user that selection is mandatory.
*   **Test Case 1.3**: Add one or more courses and submit.
    *   **Expected**: Submission succeeds.

---

## 2. DEO & Student Management
**Goal**: Verify bug fixes in the Data Entry Operator (DEO) workflow.

*   **Test Case 2.1**: Log in as **DEO**. Navigate to `/deo/apply` and try to "Create New Student".
    *   **Expected**: Student is created successfully without the previous "ReferenceError: createStudentSchema" error.
*   **Test Case 2.2**: Fill an application for **Form Type: MQ/NRI**. (Ensure branch selection is disabled in the form's schema).
    *   **Expected**: No branch selection UI should appear. Click "Save Draft".
    *   **Expected**: The draft saves successfully without asking for a branch.

---

## 3. Payment Gateway (PayU Redirect)
**Goal**: Confirm that the hashing and redirection logic for PayU is correct.

*   **Test Case 3.1**: Log in as **Student**. Navigate to your application and click "Pay Application Fee".
    *   **Expected**: The system should NOT show a mock popup. It should redirect your browser to `test.payu.in` (if in test mode) or `secure.payu.in` (if in live mode).
*   **Test Case 3.2**: Inspect the PayU page.
    *   **Expected**: The page should show the correct amount (e.g., ₹360.00) and your name/email. There should be no "Mandatory Parameter Missing" errors.
*   **Test Case 3.3**: Complete a test payment and return to the site.
    *   **Expected**: Application Fee Status updates to **"Paid"** on the dashboard.

---

## 4. Manual Fee Override (Admission Officer)
**Goal**: Allow staff to handle cases where online payment failed but money was received offline.

*   **Test Case 4.1**: Log in as **Admission Officer**. Open an application with "Pending" fee status.
    *   **Expected**: A yellow button **"Mark App Fee Paid (Manual)"** is visible.
*   **Test Case 4.2**: Click the button and confirm.
    *   **Expected**: The status instantly changes to **"Paid"**.
    *   **Audit Check**: Verify in the "Payment History" section that a new record exists with Transaction ID starting with `MANUAL-`.

---

## 5. College ID Generation & Affiliation
**Goal**: Verify the new identity format and automated college linking.

*   **Test Case 5.1**: Log in as **Fee Collector**. Record a "Tuition Fee" payment for an **Approved** student.
    *   **Expected**: Upon success, a **College ID** is generated.
*   **Test Case 5.2**: Check the ID Format.
    *   **Expected**: The ID must follow `[YY][Course][Branch][Category][SEQ]`.
    *   *Example*: For 2026, Course "BE", Branch "CE", and Quota "ACPC", the ID should look like **`26BECEA001`**.
*   **Test Case 5.3**: Verify College Affiliation.
    *   **Expected**: Check the student's record in the database. The `users.college_id` should now be populated with the UUID of the college they were admitted to.

---

## 6. UI & Labeling Consistency
**Goal**: Ensure a professional and consistent user experience.

*   **Test Case 6.1**: Check the following pages for the label **"College ID"**:
    *   Student Profile Page.
    *   Admission Officer's Application Detail view.
    *   Fee Collector's Payment History table.
    *   University Authority's Payment Reports.
    *   **Expected**: Nowhere should the term "Enrollment Number" or "Enrollment No" be visible to the user.

---
**End of Test Plan**
