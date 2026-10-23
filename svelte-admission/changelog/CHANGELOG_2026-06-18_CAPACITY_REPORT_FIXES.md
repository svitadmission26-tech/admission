# Changelog - 2026-06-18

## Capacity Report Accuracy & MQ/NRI Count Fixes

### Fixed
- **MQ/NRI Under-Counting**: Resolved a critical issue where MQ and NRI applications were being hidden from the Capacity Report due to over-aggressive deduplication.
- **Quota Separation**: Updated the report logic to ensure that applications for different form types (e.g., MQ vs. Standard) are counted independently, even if they belong to the same student and branch.
- **Disabled MQ/NRI Deduplication**: Explicitly disabled deduplication for 'MQ' and 'NRI' form types, ensuring every submitted application is counted separately as requested.
- **Admission Over-Counting**: Fixed a bug where a student's enrollment in one quota incorrectly inflated the "Admitted" counts for their other cancelled or pending applications. Admissions are now strictly tied to approved applications.
- **Unassigned Branch Collisions**: Fixed a logic error where students applying to multiple courses without branches would have their counts collapsed. Deduplication now uses course-specific keys (`unassigned_{course_id}`).
- **Bypass Type Visibility**: Improved visibility for GCAS, ACPC, and Direct Admission types. These now appear in "All", "Submitted", and "Approved" columns immediately upon submission rather than being hidden until enrollment.

### Technical Details
- Modified `src/routes/adm-officer/capacity-report/+page.server.ts`:
    - Updated `uniqueApps` filter to skip deduplication for `MQ`, `NRI`, and `Provisional` types.
    - Refined `isAdmitted` and `isMetricApproved` logic to verify application status alongside student enrollment data.
    - Standardized metadata checks using `provFormTypes` and `bypassFormTypes` sets.
    - Implemented safe, case-insensitive status priority sorting.
