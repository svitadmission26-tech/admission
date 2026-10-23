# Changelog - 2026-06-09

## [Admin Form Management Enhancements]

### Added
- **Course Filter for Admin Forms:** Added a course-based filter to the `/admin/forms` list view to help administrators manage large numbers of admission forms more efficiently.
- **Enhanced Conditional Visibility:**
    - Supported `contains` and `notContains` operators in `DynamicForm` logic for case-insensitive partial matching.
    - Added `course_name` and `branch_name` to the Form Builder visibility options, allowing fields to be shown/hidden based on readable names instead of just UUIDs.
    - Added standard system fields (`course_id`, `branch_id`, `admission_type`, `cycle_id`, `form_type`) to the Form Builder's "Field to Check" datalist.

### Fixed
- **Form Builder Syntax Error:** Resolved a Svelte compilation error in `FormBuilder.svelte` caused by dangling/duplicated code at the end of the file.
- **Indentation & Code Quality:** Refactored `constructCustomFieldObject` and related functions in `FormBuilder.svelte` for better readability and maintainability.

### Improved
- **State Synchronization:**
    - Implemented automatic synchronization of course/branch names and IDs into the application form state on Student and DEO "Apply" pages.
    - Ensured consistent visibility behavior in the Admin Officer's application review and data editing modes by injecting system context into the form state.
