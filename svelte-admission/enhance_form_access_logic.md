# Plan: Filter Student Dashboard Course Cards by Accessibility

## Objective
Only show Course options on the Student Dashboard that have at least one admission form enabled and marked as accessible to students.

## Verification of Current State
1. **Database Flag**: There is currently no `student_can_apply` flag in `form_types` or `showToStudents` flag in the dynamic form `schema_json`. 
2. **Dashboard Fetching**: The `src/routes/student/+page.server.ts` file currently fetches all records from the `courses` table without checking for active admission forms.
3. **User Confusion**: This causes students to see "Apply" buttons for courses that might only have internal (DEO-only) or inactive forms, leading to empty dropdowns or errors on the next page.

## Proposed Improvements

### 1. Database Update (Consolidated)
- Add `student_can_apply` (BOOLEAN, Default: `true`) to `public.form_types`.
- This provides a central switch for form categories (e.g., hiding "Vacant" or "Internal Transfer" from students).

### 2. Refactor Student Dashboard (`src/routes/student/+page.server.ts`)
- Update the `availableCourses` fetching logic.
- **New Logic**:
    1. Fetch `course_id`s from `admission_forms` where `is_enabled = true` AND the linked `form_type` has `student_can_apply = true`.
    2. Filter the `courses` query to only include these specific IDs.
- This ensures that if a course has no valid student-facing forms, it won't clutter the dashboard.

### 3. UI Feedback for Students
- If a course is visible but the student is already "Admitted" (has a College ID), the "Apply" button should be disabled or hidden to prevent double-applications.

## Implementation Steps (Plan Only)
1. Execute `new_database/add_form_type_permissions.sql` (created in previous turn).
2. Update the Admin portal's "Form Types" edit modal to expose the `student_can_apply` checkbox.
3. Modify the load function in `src/routes/student/+page.server.ts` to perform the filtered fetch described above.

## Expected Result
Students will only see cards for courses they can actually apply for. If a course is for "Management Quota" only and the Admin marks that form type as `student_can_apply = false`, only the DEO will see that course option, keeping the student dashboard clean and accurate.
