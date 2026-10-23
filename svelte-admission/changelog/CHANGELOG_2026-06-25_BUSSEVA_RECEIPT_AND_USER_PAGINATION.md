# Changelog - June 25, 2026

## Bus Seva Receipt & User Pagination Enhancements

Detailed record of the updates, additions, and enhancements made to the `/admin/users` pagination, `/busseva/collect/[student_id]` form inputs and duplicate check, and the `/busseva/receipt/[id]` print layout.

### Added
- **Dynamic User Pagination & Search (`/admin/users`)**:
  - Implemented proper server-side query filters using URL parameters (`search` and `page`).
  - Added a smart Bootstrap pagination controller with page number navigation and ellipses.
  - Linked Svelte template search inputs with Svelte `$state` / parameters binding for live searching across all database records instead of the initial subset.
- **Bus Seva Location & Route Inputs (`/busseva/collect/[student_id]`)**:
  - Added form input fields for **Route Name** and **Location/Stop** to capture passenger route details.
  - Updated the server `default` form action to save these fields directly into the database.
- **Duplicate Payment Check**:
  - Implemented logic in the server load function to check if the student has already paid for the current academic year.
  - Added warning banner in the payment collection UI that prevents double collection and provides a quick link to re-print the existing receipt instead.
- **Database Migration**:
  - Created migration file `20260625054700_add_route_name_and_location_to_busseva.sql` to add `route_name` and `location` columns to `busseva_fees` and trigger a PostgREST schema cache reload.
- **A4 Symmetrical Receipt Layout (`/busseva/receipt/[id]`)**:
  - Positioned Student and Office copies symmetrically in the top and bottom halves of an A4 page, centered around a middle cutting dashed line (`y = 420.94`).
  - Enlarged the passport-sized student photo box to `60x70` points and positioned it on the right side.
  - Placed the college logo aligned left beside the college name.
  - Center-aligned college details and receipt subtitle headers.
  - Implemented direct database querying of the `colleges` table via the fee record's `college_id` for accurate college details.

### Fixed
- **College Logo Resolution**:
  - Fixed a bug where Base64-encoded `logo_url` strings in the database were parsed as Supabase storage file paths, resulting in broken URLs and empty logo boxes.
  - Updated server loader and Svelte template to detect and output Base64 data URLs directly.
  - Resolved Svelte server scoping bugs for `collegeName` causing a `ReferenceError` during load.

### Removed
- **Particulars Row from Receipt**:
  - Removed the "Particulars: Bus Seva Fee Collection" line from the receipt layout table structure as requested, maintaining correct alignment of the total amount.
