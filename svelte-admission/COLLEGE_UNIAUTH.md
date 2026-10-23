# Feature Expansion Plan: College & University Roles

This document outlines suggested enhancements for the `college_auth` and `univ_auth` roles to improve their utility beyond basic application processing.

## 1. Enhanced Dashboard with Analytics

### For College (`college_auth`)
*   **Application Statistics:**
    *   Cards displaying counts for **Pending**, **Verified**, **Rejected**, and **Total** applications.
    *   Daily/Weekly trend graphs of new applications.
*   **Seat Utilization (Seat Matrix):**
    *   Visual progress bars or tables showing **Intake Capacity vs. Admitted Students** for each specific Branch and Course offered by the college.
    *   "Vacancy" highlighting to alert admins to low-enrollment courses.
### For University (`univ_auth`)
*   **Affiliated College Performance:**
    *   Comparative tables or charts showing application volumes across different colleges.
    *   Identification of top-performing and under-performing colleges.
*   **Overall Admission Health:**
    *   University-wide statistics: Total seats available vs. filled across all colleges.
    *   Aggregate fee collection summaries (if applicable).

## 2. Reports Center
Dedicated `/reports` routes for generating operational data.

*   **Admitted Students List:**
    *   Exportable (CSV/PDF) lists of students who are fully approved and have paid fees.
    *   Useful for generating ID cards, library access, or classroom batch lists.
*   **Merit List View:**
    *   Read-only access to the final merit lists for courses relevant to the specific college/university.
*   **Daily Transaction/Fee Report:**
    *   (Read-only) Summary of application or admission fees collected attributed to the institution.

## 3. Seat Matrix & Course Management
*   **College View:**
    *   Read-only view of configured `courses` and `branches`.
    *   **Potential Feature:** Allow updating specific metadata like "Department Contact Person" or "Department Description" visible to students.

## 4. Operational Efficiency Tools
*   **Bulk Document Verification:**
    *   A grid interface allowing `college_auth` users to view specific document types (e.g., "12th Marksheet") for multiple students side-by-side for faster processing.
*   **Batch Status Updates:**
    *   Ability to select multiple filtered applications and apply a status change (e.g., "Approve All Selected") with a single confirmation.

## 5. Internal Communication & Governance
*   **Circulars & Notices:**
    *   **University -> College:** System for `univ_auth` to publish official notices (e.g., "Verification Deadline Extended") visible on the `college_auth` dashboard.
*   **Escalation/Support:**
    *   **College -> University:** A structured form for colleges to flag specific complex applications for University review or clarification on rules.
