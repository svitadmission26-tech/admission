# Test Plan: College ID Generation & Logic

This test plan focuses specifically on the verification of the new **College ID** format and its integration into the student lifecycle.

## 1. ID Format Verification
**Requirement**: Format must be `[YY][CourseAlias][BranchAlias][CategoryChar][SEQ]`.

*   **Test Case 1.1: Standard MQ Admission**
    *   **Input**: Year 2026, Course "BE", Branch "CE", Form Type "MQ/NRI".
    *   **Action**: Record a tuition payment.
    *   **Expected ID**: `26BECE M 001` (Note: Spaces shown for clarity here, actual should be concatenated).
*   **Test Case 1.2: ACPC Admission**
    *   **Input**: Year 2026, Course "BE", Branch "ME", Form Type "ACPC".
    *   **Expected ID**: `26BEME A 001`.
*   **Test Case 1.3: No-Branch Course**
    *   **Input**: A course without branches (e.g., "MBA").
    *   **Expected ID**: `26MBA A 001` (Branch alias should be empty string if not applicable).

## 2. Sequence Management
**Requirement**: Sequence must be 3-digit padded and unique per College/Year/Course/Branch.

*   **Test Case 2.1: Incrementing**
    *   **Action**: Admit two students to the same Course/Branch/Category.
    *   **Expected**: First gets `...001`, second gets `...002`.
*   **Test Case 2.2: Cross-Branch Isolation**
    *   **Action**: Admit one student to "CE" and one to "ME".
    *   **Expected**: Both should get `...001` as their respective sequences are independent.

## 3. Data Integrity & Affiliation
**Requirement**: System must link the student to the college record.

*   **Test Case 3.1: User Table Update**
    *   **Action**: Check the `public.users` table after a student is admitted.
    *   **Expected**: The `college_id` column for that student must match the UUID of the college they applied to.

## 4. Rebranding Verification
**Requirement**: "Enrollment Number" should not appear in the UI.

*   **Test Case 4.1: UI Audit**
    *   Navigate to **Student Profile**.
    *   Navigate to **Adm-Officer > Application Details**.
    *   Navigate to **Fee-Collector > Payments**.
    *   Navigate to **University-Auth > Reports**.
    *   **Expected**: All headers and labels must say "College ID".
