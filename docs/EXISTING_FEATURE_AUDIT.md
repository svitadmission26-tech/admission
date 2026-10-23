# Existing Feature Audit

Date: 2026-10-22

This audit inventories the React/Supabase codebase that already exists in the repository.
Status legend: Implemented = working screen and persistence; Partial = screen exists but
incomplete; Planned = referenced in the master spec but not yet implemented.

| Feature | Status | Source path | Notes |
| --- | --- | --- | --- |
| Super Admin dashboard | Implemented | `src/components/ErpDashboard.jsx`, `src/components/ErpAdminSettings.jsx` | Module registry, permissions, login modules, forms, workflows, templates, reports, timings, flags, settings, audit. |
| Dynamic module screen | Implemented | `src/components/ErpModuleScreen.jsx`, `src/components/ErpModuleWorkspace.jsx` | Shared CRUD/list for registry modules. |
| Inquiry public form | Implemented | `src/components/InquiryModule.jsx` | Dynamic fields, college/branch/timing selection, college timing slots. |
| Inquiry form builder | Implemented | `src/components/InquiryFormBuilder.jsx` | College, branch, timing and other field types now selectable. |
| Admission form builder | Implemented | `src/components/DynamicFormBuilder.jsx` | Branch/table fields and course college scoping. |
| College timing | Implemented | `src/components/CollegeTiming.jsx`, `supabase/migrations/023_college_timing.sql`, `046_college_timing_breaks.sql` | Multi-break support added. |
| Timetable dashboard | Implemented | `src/components/TimetableDashboard.jsx` | Displays multiple breaks. |
| Student/faculty/academics | Partial | `src/components/*` | Core screens exist; full lifecycle hardening pending. |
| Document management | Partial | `src/main.jsx` Documents page | Upload/verify flows present; comprehensive checklist/versioning pending. |
| Exit/alumni | Partial | module registry | Screens and workflows need integration. |
| Reports | Implemented | `src/components/ErpModuleScreen.jsx`, Report Builder | Role-scoped exports present. |

Known gaps are tracked in `PROJECT_STATUS.md` and the master implementation specification.