# Changelog - July 2, 2026

## Summary of Changes
This changelog details the fix for the duplicate options and missing "COMPUTER ENGINEERING" option when filtering by course in the Saved Report template rendering pages.

---

## 1. Saved Report Option Deduplication (Trailing Whitespace)
* **Target Pages**: Saved Report rendering pages for Admission Officer, DEO, and Fee Collector.
* **Problem**: The master database `branches` table contains branch name entries with trailing spaces (e.g. `'COMPUTER ENGINEERING '` and `'ELECTRICAL ENGINEERING '`). When dynamically loading selection parameters for saved templates, a `Set` deduplicates options based on exact strings. Since the template parameter configs had `'COMPUTER ENGINEERING'` (no trailing space) and the database query returned `'COMPUTER ENGINEERING '`, they both remained in the option list, appearing as duplicate dropdown choices in the UI.
* **Fix**: Standardized option parameter building on the server side by trimming all entries when populating `uniqueValues`. This automatically merges trailing-space duplicates.
  * Files modified:
    * [src/routes/adm-officer/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.server.ts#L33-L71)
    * [src/routes/deo/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.server.ts#L29-L64)
    * [src/routes/fee-collector/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.server.ts#L29-L64)

## 2. Multi-Course Branch Mapping (Overwrite Fix)
* **Problem**: Multiple courses share the same branch name (e.g. `COMPUTER ENGINEERING` belongs to both `BE` and `DIP`). The helper map `branchCourseMapping` mapped branch names to a single course string (`Record<string, string>`). The last iterated course (e.g. `DIPLOMA ENGINEERING`) would overwrite the mapping, causing `COMPUTER ENGINEERING` to be filtered out and not display when the other course (`BACHELOR OF ENGINEERING` / `BE`) was selected.
* **Fix**:
  * Updated `branchCourseMapping` to map to an array of course names (`Record<string, string[]>`) so that a branch can belong to multiple courses.
  * Updated Svelte view pages to evaluate the mapped course arrays using `mappedCourses.some()` during dynamic option filtering.
  * Files modified:
    * Server files: Same +page.server.ts files listed above.
    * Svelte files:
      * [src/routes/adm-officer/saved-reports/\[id\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.svelte#L54-L60)
      * [src/routes/deo/saved-reports/\[id\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.svelte#L40-L44)
      * [src/routes/fee-collector/saved-reports/\[id\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.svelte#L40-L44)

## 3. Duplicate Column Name Resolution (ADMISSION REPORT)
* **Problem**: Both the Course column (`courses!course_id.name`) and the Branch column (`branches!branch_id.name`) were configured with the same header label: `"Name"`. Because Svelte/JS objects key flat rows dynamically by their column labels (`flatRow[col.label]`), the second column (`courses!course_id.name`) overwrote the first, resulting in two duplicate columns both displaying the Course Name instead of one showing Course Name and the other showing Branch Name.
* **Fix**: Ran a database modification script to update the column configurations inside the `report_templates` table. Renamed the labels to `"Course Name"` and `"Branch Name"` respectively. They now render as distinct columns with their correct corresponding data values.

## 4. Custom Column Names & Reordering in Admin Report Builder
* **Problem**: In the Admin Report Builder (`/admin/report-builder`), when adding columns to a tabular report template, they were saved with their default database names as labels. There was no user interface to rename columns or to change their ordering layout before saving the template.
* **Fix**:
  * Added a dedicated "Selected Columns & Custom Labels" configuration panel in `/admin/report-builder/+page.svelte` (displayed under Setup when Tabular report type is active).
  * Rendered a list of all selected columns with custom display label text inputs bound dynamically to `col.label`.
  * Implemented "Up" and "Down" chevron button controls to reorder columns in the template configuration array.
  * Added trash action buttons to directly delete/toggle columns from the layout.
  * Files modified:
    * [src/routes/admin/report-builder/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/admin/report-builder/+page.svelte)

## 5. Duplicate Student Profile Record Deduplication
* **Problem**: In the final rendered saved reports, if a student has multiple records (e.g. applications for both `Provisional` and `MQ/NRI` form types), they were displayed as separate duplicate rows. There was no feature to optionally deduplicate these rows and merge their form types.
* **Fix**:
  * Added a "Deduplicate Student Records" checkbox in the preview filter form of the saved reports view page.
  * Added query options support in `executeReportQuery` to always fetch `student_id` for applications, group the returned rows by `student_id`, and merge their `form_type` values to a comma-separated list (e.g. `"Prov, MQ/NRI"`).
  * Applied the deduplication check directly in `/api/reports/generate/+server.ts` for CSV exports and in the `preview` action of all three saved reports endpoints (`adm-officer`, `deo`, and `fee-collector`).
  * Files modified:
    * [src/lib/server/reportQueryBuilder.ts](file:///workspaces/admissionapp_v1/src/lib/server/reportQueryBuilder.ts)
    * [src/routes/api/reports/generate/+server.ts](file:///workspaces/admissionapp_v1/src/routes/api/reports/generate/+server.ts)
    * [src/routes/adm-officer/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.server.ts) & [+page.svelte](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.svelte)
    * [src/routes/deo/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.server.ts) & [+page.svelte](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.svelte)
    * [src/routes/fee-collector/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.server.ts) & [+page.svelte](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.svelte)

## 6. Columns Inclusion Selector & Form Type Expansion Columns
* **Problem**: Users wanted to choose which columns to include in the preview and CSV download, and when student profiles were deduplicated, they wanted to optionally split unique fields (like Receipt Number) into multiple columns per form type (e.g. `Receipt Number (Prov)` and `Receipt Number (MQ/NRI)`) rather than just showing the first matched record's value.
* **Fix**:
  * Added a "Columns to Include" checklist in the filters sidebar of all saved report pages. Users can check/uncheck columns to customize reports dynamically.
  * Added a conditional checklist "Split fields by Form Type as columns" (visible when deduplication is checked).
  * Updated the query builder `deduplicateStudentRecords` to identify all active form types in the retrieved dataset, expand split columns dynamically into `Column Name (Form Type)` columns, and look up matching values on a per-form-type basis.
  * Integrated visible columns and expanded columns into the server preview action and the CSV generation endpoint `/api/reports/generate`.
  * Files modified:
    * [src/lib/server/reportQueryBuilder.ts](file:///workspaces/admissionapp_v1/src/lib/server/reportQueryBuilder.ts)
    * [src/routes/api/reports/generate/+server.ts](file:///workspaces/admissionapp_v1/src/routes/api/reports/generate/+server.ts)
    * [src/routes/adm-officer/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.server.ts) & [+page.svelte](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.svelte)
    * [src/routes/deo/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.server.ts) & [+page.svelte](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.svelte)
    * [src/routes/fee-collector/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.server.ts) & [+page.svelte](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.svelte)
