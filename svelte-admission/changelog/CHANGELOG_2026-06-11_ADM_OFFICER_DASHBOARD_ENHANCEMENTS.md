# Changelog - 2026-06-11

## Admission Officer Dashboard Enhancements

### Features & Improvements

- **Multi-Status Filtering**: Added the ability to select multiple application statuses simultaneously in the Admission Officer dashboard.
- **Multi-Type Filtering**: Implemented multi-select support for form types (e.g., Provisional, Direct) in the dashboard filters.
- **Enhanced Export**: Updated the application export functionality to respect multi-select filters for status and form types.
- **Student Name Sorting**: Introduced in-memory sorting by student name in the application list, allowing officers to easily organize records alphabetically.
- **UI Filter States**: Improved the dashboard UI to clearly indicate active filters for status and form types with active states on card items and badges in the header.

### Technical Changes

- **Filter Logic Refactoring**: Updated `+page.server.ts` and `export/+server.ts` to handle comma-separated filter values using Supabase's `.in()` filter.
- **Sorting Logic**: Extended in-memory sorting routine in `+page.server.ts` to handle `student_name` based on nested user profile data.
- **UI Components**: Updated dashboard Svelte components to handle toggle-based selection for status and form type filters.
