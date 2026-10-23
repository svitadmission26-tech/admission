# Changelog - June 22, 2026

## Inquiry & Conversion Report Enhancements

Detailed record of the updates, bug fixes, and feature enhancements made to the admission officer public inquiries and conversion reports.

### Added
- **Page Size Selection & Default 100**:
  - Defaulted the inquiries page size parameter to `100` instead of `10`.
  - Added user-selectable page size dropdown controls (`10`, `25`, `50`, `100`, `200`, `500` records per page) to the card-footers of both the "Public Inquiries" and the "Conversion & Fees Status" tables.
- **Client-Side Excel Exporter (.xlsx)**:
  - Replaced the old CSV download mechanism with a full-featured Excel export using the `xlsx` (SheetJS) library.
  - Implemented dynamic column auto-fitting (`ws['!cols']`) based on contents length to output clean, readable spreadsheets.
- **Inquiry Branch List**:
  - Extracted interested branch preferences directly from inquiry records.
  - Rendered a comma-separated list of interested branches under a new `"Interested Branches"` column in the HTML report table.
  - Exported this branch list to the Excel sheet.
- **Email & Contact No Table Columns**:
  - Added dedicated, separate table columns for `"Email"` and `"Contact No"` on the report grid matching the Excel format.
- **Export API Endpoint**:
  - Created a server-side endpoint `/api/inquiry/export-report` to generate the complete filtered data set instead of limiting it to a single page-size subset.
  - Added concurrent batch chunking (splitting email fetches into chunks of 100) to keep GET requests fast and completely safe from HTTP header size overflows.

### Fixed
- **Query / Headers Overflow Error**:
  - Resolved `HeadersOverflowError` and `Bad Request` query crashes occurring when selecting conversion filters. The old logic passed 750+ email string filters via URL GET params.
  - Introduced optimized in-memory filter set checks on the backend for `prov_converted`, `fees_paid`, and `not_converted` paths, using case-insensitive set checks.
- **Admission Fees Paid Filter Empty**:
  - Fixed an issue where the "Admission Fees Paid" view returned no inquiries. The query had an unnecessary provisional form type constraint, filtering out tuition fees paid on regular applications (GCAS, Vacant). Removing the constraint correctly tracks all admitted inquirers.
- **Typos / Blank Cells**:
  - Resolved a frontend nesting typo (`row.email` and `row.phone` instead of `row.inquiry.email` and `row.inquiry.phone`) which caused contact details to display blank inside the table.
- **Course Interested Empty Fallback**:
  - Implemented a fallback chain (`provApp.course.name` -> `anyApp.course.name` -> `inquiryCourseList`) to display program interests for students without a provisional application form.
- **Provisional ID Column Removal**:
  - Removed the `Provisional ID` column from both the table and Excel sheets since it was no longer required.
