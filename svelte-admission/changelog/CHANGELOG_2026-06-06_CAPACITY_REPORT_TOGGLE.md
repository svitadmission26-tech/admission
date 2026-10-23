# Changelog - 2026-06-06

## Capacity Report Enhancements & Reactivity Fixes

### Added
- **Status Filtering**: Added a toggle checkbox "Include Rejected/Removed" to the Capacity Report. By default, applications with 'rejected', 'cancelled', or 'removed' statuses are now excluded from all report counts.
- **Unassigned Filtering**: Added a toggle checkbox "Include Unassigned" to the Capacity Report interface to exclude "Unassigned/Other" branches from totals and grand totals.
- **Fee Collector Profile Viewing**: Enabled Fee Collectors to view and print student profiles directly from the payments table using allowed HTML templates.
- **Visual Builder Live-Sync**: Implemented real-time HTML preview and Side-by-Side mode for the Report Builder.

### Changed
- Updated `branchTotal`, `courseMetricTotal`, `grandTotal`, and `grandMetricTotal` calculation helpers to respect the filtering flags.
- Modified PDF and Excel export functionality to correctly reflect the filtered state of the report.
- Updated both Simple and Detailed UI views to dynamically hide/show rows and adjust subtotals based on user-selected filters.
- Refactored `VisualBuilder` sidebar to a manual drawer-style toggle for improved canvas workspace.

### Fixed
- Fixed reactivity issue where the **GRAND Total** row would not update immediately upon toggling filters.
- Resolved sync issues between sub-totals and the filtered branch view across different view modes.
- Fixed blank canvas issue in Visual Builder when pasting raw HTML code.

### Technical Details
- Added `includeUnassigned` and `includeRejected` reactive states to the Capacity Report.
- Implemented `include_rejected` query parameter support in `src/routes/adm-officer/capacity-report/+page.server.ts` to handle server-side status filtering.
- Refactored component to use **Svelte Reactive Statements** for instant UI updates when state changes.
- Updated profile printing authorization and template linkage logic for the Fee Collector role.
