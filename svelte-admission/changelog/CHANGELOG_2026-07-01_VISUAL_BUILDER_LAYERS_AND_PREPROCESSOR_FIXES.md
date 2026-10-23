# Changelog - July 1, 2026

## Summary of Changes
This changelog details updates across report template rendering, visual layout editing, template logic parsing, database record cleaning, and route filters.

---

## 1. Saved Reports & Template Filtering
* **Target Pages**: Admission Officer, Fee Collector, and DEO Reports and Saved Reports lists.
* **Problem**: Visual print profile templates (`report_type: 'html_profile'`) were erroneously listed alongside query-based custom and saved reports.
* **Fix**: Added `.neq('report_type', 'html_profile')` filters to exclude layout templates from query/saved report selections in:
  * [src/routes/adm-officer/reports/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/reports/+page.server.ts)
  * [src/routes/adm-officer/saved-reports/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/+page.server.ts)
  * [src/routes/fee-collector/reports/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/reports/+page.server.ts)
  * [src/routes/fee-collector/saved-reports/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/+page.server.ts)
  * [src/routes/deo/saved-reports/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/+page.server.ts)

## 2. Preprocessor & Logical Condition Engine Updates
* **Stateful Regex Fix**:
  * **File**: [src/routes/print-profile/\[applicationId\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/print-profile/%5BapplicationId%5D/+page.svelte)
  * **Fix**: Swapped the global tag tester regex to an anchored, non-global RegExp pattern `tagTestRegex`. This prevents the stateful `lastIndex` pointer from skipping matching Svelte tags, ensuring block nesting stacks balance correctly and eliminating unwanted raw `{{/if}}` characters on the page.
* **Complex Logical Condition Support**:
  * **Fix**: Created a recursive evaluator `evaluateCondition` supporting logical AND (`&&`), logical OR (`||`), negation (`!`), nested grouping, and relation comparisons (`==`, `!=`, `<`, `>`, `<=`, `>=`).
  * **Result**: Allows rich expressions inside template conditions during PDF print rendering.

## 3. Visual Builder Stacking & Selection Enhancements
* **Canvas Stacking Fix**:
  * **File**: [src/lib/components/reports/visual-builder/VisualBuilder.svelte](file:///workspaces/admissionapp_v1/src/lib/components/reports/visual-builder/VisualBuilder.svelte)
  * **Fix**: Established a CSS stacking context on the canvas surface by setting `z-index: 1` on `.canvas-paper`. This keeps negative `z-index` nodes (e.g. elements sent to the back) click-accessible rather than rendering underneath the canvas background. Excluded `z-index` from compiled production CSS classes.
* **Sidebar Layers Tab**:
  * **File**: [src/lib/components/reports/visual-builder/Sidebar.svelte](file:///workspaces/admissionapp_v1/src/lib/components/reports/visual-builder/Sidebar.svelte)
  * **Fix**: Added a recursive **Layers** navigator tab that maps layout trees dynamically. Click-selection redirects focus to the clicked node.
* **Recursive Tree Collapsing**:
  * **Fix**: Changed layers tree rendering to default to a collapsed (reduced) state, expanding only when clicking caret toggle buttons.
* **Selected Subtree Isolation**:
  * **Fix**: Created a dedicated **Selected Subtree** tree panel that displays under the main tree, showing ONLY the child hierarchy of the selected node.

## 4. Component Renaming
* **Renaming Controls**: Added a "Component Name" property input in `Sidebar.svelte` supporting custom node labels (`customName`).
* **Defaults**: Configured dynamic table drops, rows, and grid cell creation methods to initialize components with short, descriptive names (8 to 10 characters).
* **Database Updates**: Executed a database migration script assigning clean `customName` values to all visual layout components inside existing template records.

## 5. Text Sizing, Overflow, & Tooltips
* **Fixed Heights & Clipping**:
  * **File**: [src/lib/components/reports/visual-builder/CanvasNode.svelte](file:///workspaces/admissionapp_v1/src/lib/components/reports/visual-builder/CanvasNode.svelte)
  * **Fix**: Text nodes now respect fixed heights instead of forcing `auto` height. Components with height restrictions clip overflowing content cleanly (`overflow: hidden`).
* **Hover Tooltip**:
  * **Fix**: Added a native `title` hover attribute to text components on the canvas to display unclipped contents on hover.

## 6. Payments Page Default Sorting
* **File**: [src/routes/fee-collector/payments/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/payments/+page.server.ts)
* **Fix**: Configured default query sorting to organize payment logs by `created_at` descending.

## 7. Applications Page Course & Branch Filtering
* **Target Pages**: Admission Officer applications list ([src/routes/adm-officer/applications](file:///workspaces/admissionapp_v1/src/routes/adm-officer/applications)) and University Auth applications list ([src/routes/university-auth/applications](file:///workspaces/admissionapp_v1/src/routes/university-auth/applications)).
* **Features**:
  * Added dropdown selection filters for **Course** and **Branch** side-by-side with Search and Form Type controls.
  * **Dynamic Dependency**: The **Branch** select element is initially disabled. It is enabled only when a valid Course is selected.
  * **Course-Specific Filtering**: Branch choices are filtered to only display branches corresponding to the selected Course (`branch.course_id === selectedCourseId`), instead of loading all branches.
  * **Automated Reset**: Changing the Course filter automatically resets the active Branch filter to avoid query state conflicts.

