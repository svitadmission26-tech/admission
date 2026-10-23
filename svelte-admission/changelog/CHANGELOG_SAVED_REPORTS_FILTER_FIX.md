# Changelog: Saved Reports Nested Filter Fix
**Date:** 2026-05-18

## Summary of Changes
This update resolves an issue where filtering by nested relations (such as Course, Branch, or Student Name) in the Saved Reports system did not correctly exclude rows from the report.

### 1. Reporting Engine (`src/lib/server/reportQueryBuilder.ts`)
*   **Dynamic Inner Joins:** The query builder now automatically detects when a filter is applied to a related table (nested relation).
*   **!inner Modifier:** Appends the PostgREST `!inner` modifier to the select string for filtered relationships. This forces an `INNER JOIN` behavior, ensuring that if a student does not match the selected course/branch, the entire student row is removed from the report instead of just showing null values for those columns.
*   **Recursive Support:** The fix works for deeply nested relations (e.g., Filtering by a College inside a Course inside an Application).

### 2. UI Consistency
*   **Preview & Export:** This fix applies to both the in-browser report preview and the downloaded CSV/Excel exports, as they share the same underlying query engine.

## Impact
Admins and Admission Officers can now generate accurate filtered reports. Previously, selecting a specific "Course" would still show all students in the system, which made the filtering feature ineffective for large datasets.
