# SVIT ERP — AI Agent Master Implementation Specification

## Mission
Upgrade the EXISTING uploaded `admission-main (3).zip` project into a unified, dynamic, duty-assigned college ERP from college setup and student inquiry through admission, study, graduation/withdrawal, exit clearance and alumni. DO NOT create a disconnected second application. Inspect and reuse working code, migrations and screens; do not assume a documented feature is fully working until tested. Preserve all data and existing workflows.

## Repository starting points (verified in archive)
- React 19 + Vite, Express/Node and Supabase; see `package.json`.
- `src/lib/erpModules.js`, `src/lib/erpAccess.js`, `src/components/ErpAdminSettings.jsx`, `src/components/ErpModuleWorkspace.jsx`.
- `docs/ERP_MODULE_PLAN.md`, `docs/ERP_ARCHITECTURE.md`, `docs/COLLEGE_TIMING.md`.
- Existing migrations `supabase/migrations/001...046` including `017_branch_dynamic_intakes.sql`, `024_erp_document_modules.sql`, `035_erp_core_framework.sql`, `036_erp_dynamic_forms.sql`, `042_erp_security_audit.sql`, `046_college_timing_breaks.sql`. Note two distinct `029_` migration filenames: inspect actual applied history and migration ordering; never silently rewrite an applied migration.
- Existing `e2e` scripts and `npm run build`. First inventory actual implementations and tests, not just documentation.

## Non-negotiable architecture
One Super Admin configures institution, campuses (if needed), departments, programs/courses, branches, academic years, semesters, divisions, batches, shifts, rooms, subjects, admission types, intake categories, fee heads, documents, users, roles, permissions, duty assignments, approval chains, templates, and notification settings. Authorized assigned users enter records only within permitted department/branch/year/record scope. One student master linked to inquiry, application, enrollment, finance, attendance, exam, library, transport, hostel, placement and exit. Do not duplicate master profiles. Preserve immutable financial and approval audit events; use correction/reversal workflows.

## Phase 0 — mandatory audit and safe delivery
1. Unzip and inspect source, routes, component registry, schema, RLS, API and existing tests. Produce `docs/EXISTING_FEATURE_AUDIT.md`: feature / implemented / partial / broken / missing / source path / required change.
2. Establish git baseline; keep `.env`, service-role keys and real student data out of commits and agent output. Back up DB and storage before migrations. Provide additive idempotent migrations with rollback guidance. Keep existing routes/API backwards compatible or provide tested migrations.
3. Produce `docs/MODULE_INTEGRATION_MAP.md` identifying legacy and generic duplicate pages; consolidate navigation without deleting functioning workflows. Do not call mock UI production-ready.
4. Implement in small independently testable phases, report files changed and tests for each; don't claim success without running them.

## Central navigation
Super Admin > College Setup, Academic Structure, Dynamic Form Builder, User/Role/Duty Manager, Workflow & Approval Builder, Document Template/Requirements, Communication, Finance Setup, Dashboard/Report Builder, Audit, Backup Settings.
Operational modules: Inquiry & Visits; Admission & Intake; Student Master & ID; Faculty & HR; Academics & Timetable; Attendance; Examination & Results; Fees & Scholarship; Library; Transport; Hostel; Inventory; Training & Placement; Certificates; Exit & No Dues; Alumni; Reports. Separate module dashboards, shared consistent UI and central record links. Show users only authorized modules and actionable assigned work queues.

## Dynamic masters — all admin-manageable
College profile, name/logo/contact/receipt header, departments, programs, branches (branch code/name/department/program/intake/status/effective year), course-to-branch mapping, year, semester, division, batch, shift, room, timetable and breaks, subject (theory/practical and credits), admission type including lateral entry, category/quota/seat matrix, document types, fee structure, examination components, grade/pass rules, approval chains, user roles, duty assignment and certificate/receipt number sequences. Each master needs create/edit/deactivate (not destructive delete when referenced), validation, duplicate prevention, dependency warnings, effective dates and import/export where sensible. Branch selector must load from master and filter by program, academic year, admission type and active status; historical student branch must remain stable. Capacity checks must be transactional to prevent overbooking.

## Common UI/button contract (apply to every applicable module and form)
- Module Dashboard: Add New, View List, Assigned to Me, Pending Approval, Search, Filters, Reset, Refresh, Export Excel/PDF, Download Import Template, Import Excel (with row-by-row validation/error report), Print when meaningful.
- Entry form: Add Field only in authorized builder, Save Draft, Submit, Cancel/Back, Reset (confirmation if dirty), Upload/Replace/Remove attachment, Preview attachment, validation messages; auto-save only if explicitly designed and clearly indicated. Save Draft does not trigger approval or final count; Submit validates and atomically moves status to Submitted.
- List rows: View, Edit (only permitted states), Duplicate only where safe, Submit Draft, Approve, Reject with mandatory reason, Return for Correction, History, Print/Download, Archive/Deactivate/Delete only if authorized and no dependent record; confirmation for destructive actions.
- Edit mode: load persisted record, show unsaved changes, Update, Cancel, optimistic concurrency/version check; server-side validation and permissions. Never create a new duplicate record when editing.
- All buttons MUST have actual handlers, loading/disabled/error/success states, server persistence and test coverage; no dead buttons, alert-only fake saves, mock records or silently swallowed errors. Accessible labels and mobile-friendly layouts.
- Status workflow: Draft -> Submitted -> Under Review -> Approved/Rejected/Returned -> Finalized where relevant; record who/when/why. Define module-specific transitions and lock policy.

## Dynamic Form Builder
Admin creates and versions module-specific forms: text, textarea, email, phone, number, date/time, radio, select, multi-select, checkbox, address, dependent program->branch->semester->division, repeatable sections, calculated/read-only fields, attachment, signature if supported. Label, help text, order, group/tab, required/conditional required, regex/min/max, unique, defaults, visibility/editability by role, approval stage, effective date. Preview, Publish/Unpublish, clone, version history; published changes must not corrupt past submissions. Database-backed definitions AND submissions, safe schema validation and authorization. Admin can configure document checklist per program/branch/admission type/year.

## Duty assignment and security
Admin creates user or invites to Auth, links staff/faculty profile; assign one or many roles and duties by module, action, department, branch, academic year, specific record/queue, start/end dates, delegation/substitute and active state. Role permissions intersect with duty scope and row-level security; no privilege escalation via UI or API. Explicit View/Create/Edit/Submit/Approve/Reject/Delete/Import/Export/Print permissions. Maker-checker separation for sensitive admissions, payments, marks, exit and user permissions. Log permission changes, record changes, uploads, approval actions. Do not expose Supabase service-role key in frontend. Apply Supabase RLS and server checks; test cross-department and student self-access.

## Student lifecycle, integrated IDs and rules
Public inquiry -> unique inquiry ID -> assigned faculty follow-up, SMS/WhatsApp/email opt-in and delivery log -> configurable visit slots and capacity (example 5/hour), no-show follow-up -> counseling -> prefilled admission application -> document upload/verification -> merit/eligibility -> seat allocation within program/branch/year/type/quota -> provisional admission & provisional receipt -> verified fee payment -> final approval -> permanent student ID/enrollment mapping -> smart ID/QR -> academic registration -> timetable/attendance/assignments -> marks (theory and practical in same subject row, independently configurable max/pass, component rules) -> exams/results/promotion/backlog -> services/fees/placement -> graduation/withdrawal/transfer -> digital no-dues (library, accounts, hostel, transport, exam, department) -> authority approval -> TC/migration/character/completion documents -> exit status -> alumni for eligible graduates. Cancellation/reversal adjusts occupied seat count transactionally and retains history; never simply delete a finalized admission. One-time entry and linked read-only prefill, with authorized corrections.

## Document management — mandatory
Admin-defined document categories/checklists by module and program/branch/admission type; upload from desktop/mobile, multi-file where configured, drag/drop optional, preview for supported MIME, download, replace/re-upload with version history, verify/reject with reason, expiry and mandatory/pending flags. Store files in private Supabase Storage; store metadata in DB: owner/student/application, type, filename, MIME, size, storage path, version, checksum if feasible, uploaded by/at, verified by/at/status. Signed time-limited access URLs; enforce owner and duty permissions on upload/download/delete. Validate MIME AND size server-side, use safe filenames, restrict executable files; no public buckets for sensitive student documents. Add document completeness gate before final admission/exit where configured. Include photo, signature, certificates, marksheets, ID proofs, fee evidence and clearance files as configurable categories; don't hardcode mandatory documents for all students.

## Module-specific minimum scope
- Admission: inquiry/follow-up/visit, forms, document verification, branch/intake, provisional/final receipts, cancellations, admission dashboard.
- Student: master, guardian, academic history, division changes/transfers with history, portal and ID.
- Faculty: profiles, department/branch mapping, workload, leave, substitute/proxy duty and attendance visibility.
- Academics: year/calendar, program/curriculum, theory/practical subjects, timetable, classroom, proxy indication and proxy attendance audit.
- Exam: dynamic components, one subject row with theory/practical columns, moderation/approval, results, SGPA/CGPA as configured, backlog and promotion.
- Finance: fee heads, assignments, payments, verified receipts, refund/reversal, scholarship, outstanding/no-dues; do not silently edit posted transactions.
- Services: library issue/return/fines, transport route/vehicle/allocation, hostel rooms/allocation, inventory.
- Placement: internship, company drives, offers and outcome.
- Exit: application, department clearance work queues, library/accounts/hostel/transport/exam clearance, approval, document generation and alumni handoff.
- Reports: branch/program/year/status scoped dashboards, counts reconciled to source tables, configurable filters, Excel/PDF, role-restricted export.

## Acceptance criteria and testing
Test CRUD buttons and persisted round-trip per module, validation, unauthorized action, draft vs submit, edit vs create, attachment upload/download/replace/reject, dynamic branch mapping, intake cancellation/reassignment, duplicate inquiry/enrollment prevention, assigned duty visibility, proxy attendance, marks theory/practical in one row, exit gates, PDF/Excel and mobile navigation. Run `npm ci`, `npm run build`, existing npm tests and `git diff --check` (adapt environment and report blockers honestly). Add tests for newly added functionality and migration/RLS tests; resolve actual errors. Verify that old admission/receipt workflows still work. Update README with setup, env placeholders, migration order, deployment, storage buckets, roles, backup and module usage. Deliver actual changed code and SQL, not just a plan.

## Implementation order
0 audit/backups -> 1 central admin + unified navigation -> 2 dynamic masters/branch -> 3 user/role/duty/RLS -> 4 form builder + document management -> 5 inquiry/admission/intake integration -> 6 student/faculty/academics -> 7 attendance/exam -> 8 finance/services -> 9 placement/exit/alumni -> 10 reports, regression, deployment docs.

## Mandatory agent response at the end of each phase
List files changed, migrations added, old functionality preserved, screenshots or test evidence where possible, commands run/results, known gaps, and the exact next phase. Ask for approval before destructive schema/data changes. Never state that a feature works merely because a page or registry entry exists.

## Implementation progress (2026-10-22)
- Inquiry Forms builder now supports college, course, branch, department, faculty, timing, gender, source, qualification, radio, tel, url and consent fields.
- College timing supports multiple breaks and feeds public inquiry timing slots by college.
- Added `docs/EXISTING_FEATURE_AUDIT.md` and `docs/MODULE_INTEGRATION_MAP.md`.
- Verification: `npm run build`, `npm run test:form-fields`, `npm run test:migrations` pass.

Next phase: deepen document management checklist/versioning and inquiry-to-admission intake capacity checks.
