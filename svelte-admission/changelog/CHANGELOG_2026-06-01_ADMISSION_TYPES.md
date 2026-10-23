# Changelog - June 1, 2026

## [1.2.0] - D2D/C2D Admission Type & Dynamic Enrollment Logic

### Added
- **Configurable Admission Types**: Introduced a new feature in the Form Builder allowing administrators to specify allowed admission modes (e.g., "Regular, D2D, C2D") on a per-form basis via a comma-separated input.
- **Dynamic Admission Dropdown**: Student and DEO application forms now dynamically render the "Admission Type" selection based on the administrator's configuration.
- **D2D/C2D Enrollment Prefix**: Automated enrollment number generation now prepends a **'2'** to the ID if the student is a D2D (Diploma to Degree) or C2D (Certificate to Degree) applicant.
- **Database Schema**: 
    - Added `admission_type` column to the `applications` table.
    - Added `admission_mode` column to the `account_admissions` table for finalized status tracking.

### Changed
- **Enhanced Application Details**: The Admission Officer, College Authority, and University Authority portals now display the student's selected Admission Type in the application overview and details cards.
- **Improved Data Export**: The CSV export tool for admission officers now includes an "Admission Mode" column.
- **Robust Data Access**: Refactored server-side logic in `application.ts` and report generation to safely handle complex database joins, preventing potential crashes.
- **Standardized Validation**: Updated Zod error handling in student and DEO portals to use the standard `.issues` API for better stability.

### Fixed
- Fixed TypeScript errors related to nested array structures returned from Supabase joins in the application approval logic.
- Resolved an issue where the admission type selection was lost when students resumed draft applications.
- Fixed inconsistent enrollment number prefixes during student course transfers in the administrative portal.

### Migration Required
- Execute `new_database/add_admission_type.sql` in the Supabase SQL Editor to update the schema and backfill existing records.
