# SVIT College ERP — Phase 1 Audit & Target Architecture

> Scope of this document: the audit of the existing project that was read before any
> code was changed, the gaps that were found against the 25 module requirement, and
> the target architecture that the remaining phases implement.
>
> Companion document: [`ERP_MODULE_PLAN.md`](./ERP_MODULE_PLAN.md) (module-wise plan,
> tables, fields, workflows, permissions and phase order).

---

## 1. Existing project audit

### 1.1 Technology stack (unchanged, reused as-is)

| Layer | Technology | Status |
| --- | --- | --- |
| Frontend | React 19 + Vite 6, plain JSX (no TypeScript in the app shell) | Reused |
| Backend / DB | Supabase (PostgreSQL + PostgREST + GoTrue Auth + Storage) | Reused |
| Server | Express (`server/index.js`), optional health + FAQ endpoints | Reused |
| Excel | ExcelJS (dynamic `import('exceljs')`, bundled as a lazy chunk) | Reused |
| QR | `qrcode` (ID card QR) | Reused |
| Styling | Hand-written CSS in `src/style.css` + per-component CSS files | Reused |
| Migrations | `supabase/migrations/001…034`, applied with `psql` in numerical order | Reused |

`npm run build` succeeded before any change (`✓ built in 9.53s`).

### 1.2 Application entry points

| File | Lines | Responsibility |
| --- | --- | --- |
| `src/main.jsx` | 3470 | Shell: auth, module routing, generic master-data CRUD, dashboards, receipt printing |
| `src/components/DynamicFormBuilder.jsx` | 1950 | Admission form designer (sections, fields, visibility rules, versions by duplication) |
| `src/components/InquiryModule.jsx` | 1281 | Public inquiry form + staff inquiry dashboard + chatbot |
| `src/components/UserManagement.jsx` | 1239 | Staff accounts, roles, pages, permissions, data scopes |
| `src/components/Academics.jsx` | 1204 | Timetable, leave, attendance modules |
| `src/components/InquiryAdmissions.jsx` | 916 | Inquiry → final admission workflow, seat intake |
| `src/lib/excel.js` | 518 | Excel export / template / read + full workbook importer |
| `src/lib/accessControl.js` | 226 | Page list, permission catalogue, dashboard routes |
| `src/components/LoginPage.jsx` | 425 | Centralised dynamic login (module dropdown, signup, reset) |
| `src/components/SmartIdCards.jsx` | 391 | ID card issue / reprint / revoke + QR |
| `src/components/ExcelTableTools.jsx` | 265 | Generic import/export toolbar for master tables |

### 1.3 Database state (68 tables, 56 functions after migrations 001–034)

Core, already correct and **kept as the single source of truth**:

- Identity: `profiles`, `staff_members`, `staff_roles`, `role_permissions`, `login_modules`, `login_portal_settings`
- Catalogue: `universities`, `colleges`, `courses`, `branches`, `departments`, `academic_years`, `form_types`, `designations`, `subjects`, `student_profile_fields`
- People: `students`, `faculty`, `faculty_leaves`, `lecture_proxies`
- Admission: `inquiries`, `inquiry_followups`, `inquiry_admissions`, `admission_intakes`, `admission_decision_events`, `admission_forms`, `admission_sequences`, `applications`, `documents`, `merit_schemes`, `merit_entries`, `fee_schemes`, `fee_structures`, `fee_assignments`, `payments`, `receipt_sequences`, `payment_gateways`
- Teaching: `timetable_slots`, `lecture_attendance`, `college_timings`, `college_holidays`
- Support: `notices`, `id_cards`, `id_card_events`, `report_templates`, `inquiry_forms`, `workbook_sheets`, `erp_settings`, `audit_logs`, `form_audit_logs`, `form_versions`, `form_submissions`
- Web/visit: `admission_visit_*`, `visit_appointments`, `appointment_reminders`, `admission_chatbot_faq`, `faq_chatbot_content`, `bus_seva_qr_configs`

Security helpers already in place and reused by the new modules:
`is_admin()`, `has_permission()`, `get_my_staff_access()`, `staff_scope_allows()`, `staff_course_scope_allows()`, `staff_department_scope_allows()`, `effective_login_role()`, `resolve_login_module()`.

### 1.4 What already works (must not regress)

- Dynamic login page with DB-driven module list, backend role validation, disabled-module handling, sign-in by user id, password reset, student self-registration, college branding.
- Role + data-scope RBAC: `role_permissions` (page and action grants), `staff_members` college / department / course scopes, `scope_all`.
- Admission form builder with sections, field types, conditional visibility, required flags, defaults, uppercase transform, copy-from field, branch selection, duplicate-as-new-version.
- Inquiry → final admission → seat intake workflow with capacity guards (`guard_admission_intake_capacity`, `guard_branch_intake_heads`).
- Academics: timetable slots, faculty leave with proxy and approval chain, lecture attendance roster and submission.
- ID card issue / reprint / revoke with QR, scoped writes.
- Excel import/export/template for master data, inquiries, admissions, applications, documents, forms, staff, ID cards; full nine-sheet workbook importer.
- Public inquiry form with honeypot + chatbot FAQ, inquiry prefill into admission applications.

### 1.5 Gaps against the 25-module requirement

| # | Gap | Impact |
| --- | --- | --- |
| G1 | Only **6 dashboard routes** exist (`college_info`, `admissions`, `timetable`, `faculty_leave`, `student_management`, `super_admin`). 25 modules have no routes. | Modules cannot be entered or navigated to. |
| G2 | **19 of 25 modules have no database tables at all** (accounts, transport, HR/payroll, library, hostel, inventory, placement, certificates, grievances, parent portal, website, examination beyond merit, analytics, system config beyond `erp_settings`). | No shared centralised data model. |
| G3 | `students` has **no** `user_id`, `application_id`, `admission_id` or `inquiry_id` link; `faculty` has **no** `user_id`/`department_id`/`designation_id` link. | The Student→Admission→Academic→Accounts chain and the Faculty→Department→Subject chain cannot be expressed with foreign keys. |
| G4 | The form builder is hard-wired to `admission_forms` + `applications`. There is no **central** form definition store, no schema **versioning** for arbitrary forms, and no generic record store for administrator-created forms. | "Centralised Dynamic Form Builder" (add/edit fields, types, required, dynamic dropdowns, validation, conditional fields, module permissions, custom forms, approval workflows, module enable/disable, receipt templates, custom reports, module timings) is not possible. |
| G5 | `role_permissions` stores page/action grants but there is **no module-level enable/disable** and **no per-module CRUD matrix** (view/create/edit/delete). | Module permissions cannot be configured per role. |
| G6 | No approval-workflow engine, no receipt-template store, no custom-report store, no notification store. | Workflows, receipts, reports and the notification centre are missing. |
| G7 | No audit write-path: `audit_logs` exists but nothing writes to it. | No traceable change history. |
| G8 | Master-data CRUD in `main.jsx` is hard-coded per table (`meta` map, `referenceTables`, `excelImportTables`). Each new module would need bespoke JSX. | 25 modules would be ~10 000 lines of copy-paste. |
| G9 | The Main Dashboard has no charts, no notification centre, no global search, no quick actions, and no role-specific KPI set beyond 5 static counters. | Dashboard requirement unmet. |
| G10 | `role_permissions` / staff roles contain no Parent, Transport, Accounts, Principal or Website roles. | The requested dynamic login roles do not all exist. |
| G11 | Excel import has no **duplicate detection**, no **bulk validation error report** (it aborts on the first bad row), and no PDF generation helper. | Section 5 requirement unmet. |
| G12 | `students`/`subjects`/`faculty` still carry **free-text** `course`/`branch` columns alongside UUID columns. | Duplicate / inconsistent academic references are possible. |

### 1.6 Design decisions taken from the audit

1. **No rebuild.** The shell, the router, the login page, the form builder, the academics screens, the admission workflow and the Excel layer are all kept and extended.
2. **One shared people spine.** `students` and `faculty` stay the only Student and Faculty tables. New modules reference them by UUID — no copies.
3. **Declarative module registry + one generic module screen.** Instead of 25 hand-written CRUD screens, each module is a configuration (tables, columns, relations, KPIs, filters, workflows, permissions). The generic screen renders dashboard, list, filters, form, search, Excel, PDF and workflow actions from that configuration. Configuration lives in `src/lib/erpModules.js` and is mirrored by DB rows so an administrator can rename/disable/reorder at runtime.
4. **Every module table is created by migration, never by the client.** Data always lands in one central PostgreSQL database with foreign keys, RLS and audit triggers.
5. **Excel/CSV/PDF helpers are centralised** in `src/lib/excel.js` + a new `src/lib/erpExcel.js` and `src/lib/pdf.js` so every module gets identical behaviour (template, import, validation, duplicate detection, error report, export, PDF).
6. **Existing migrations are never edited in place** except for the one idempotent fix already staged in the working tree (`027`); new work is additive migrations `035+`.

---

## 2. Target architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                               │
│                                                                       │
│  main.jsx ── shell / routing / RBAC guard / master CRUD (unchanged)    │
│    ├── LoginPage.jsx            dynamic login (module dropdown)        │
│    ├── ErpDashboard.jsx          role-aware KPI + charts + quick action │
│    ├── ErpModuleScreen.jsx       GENERIC module screen (25 modules)   │
│    ├── ErpAdminSettings.jsx      Super Admin: modules, permissions,    │
│    │                             form builder, workflows, templates,   │
│    │                             reports, timings                       │
│    ├── NotificationCenter.jsx    bell + unread + audit trail           │
│    └── existing components        DynamicFormBuilder, Academics, ...   │
│                                                                       │
│  lib/  erpModules.js (registry) · erpAccess.js · erpExcel.js · pdf.js  │
│        accessControl.js · excel.js · formFields.js · admissionTypes.js │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ supabase-js (RLS enforced, no service key)
┌───────────────────────────────▼───────────────────────────────────────┐
│  Supabase: PostgreSQL + PostgREST + GoTrue + Storage                  │
│                                                                       │
│  Core          profiles · students · faculty · courses · branches ·    │
│                departments · subjects · colleges · academic_years      │
│  Framework     erp_modules · erp_module_permissions ·                │
│                erp_form_definitions · erp_form_versions ·             │
│                erp_form_records · erp_approval_workflows ·            │
│                erp_receipt_templates · erp_report_definitions ·        │
│                erp_notifications · erp_module_timings ·               │
│                erp_audit_log                                         │
│  Domains       40+ new tables for accounts, transport, HR/payroll,    │
│                library, hostel, inventory, placement, certificates,    │
│                grievances, website, examination, parent portal        │
│  Security      RLS on every table · scope guards · audit triggers     │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.1 Module registry (single source of truth)

`src/lib/erpModules.js` exports `erpModules`, an ordered array of 25 entries:

```js
{
  id: 'transport',              // stable id, used by the DB and permissions
  number: 6,                    // order shown in the dashboard
  title: 'Transport Management',
  icon: '🚌',
  portal: 'transport',          // dashboard route the module belongs to
  entryPage: 'Transport Dashboard',
  description: '…',
  tables: [ /* declarative table configs */ ],
  dashboards: [ /* KPI + chart configs */ ],
}
```

Each table config carries: `table` (physical table), `title`, `fields[]`
(`key`, `label`, `type`, `required`, `options`, `ref` for foreign keys, `help`),
`searchFields`, `filters[]` (`key`, `label`, `source` = table/column),
`kpis[]`, `parent` (self FK, e.g. route → vehicle), `softDelete`, `excel` flags.

The generic screen reads this configuration, so a new module is a configuration
change plus a migration — not a new React file.

### 2.2 Data model (relations)

```
profiles ─┬─< staff_members ─> staff_roles ─< role_permissions
          ├─< erp_guardians ─< erp_parent_students >─ students
          └─< notifications

students ── student_id_code / enrollment (unique)
   │  ├─ user_id        → profiles            (portal login, one row only)
   │  ├─ inquiry_id     → inquiries
   │  ├─ application_id → applications
   │  ├─ admission_id   → inquiry_admissions
   │  ├─ course_id      → courses
   │  ├─ branch_id      → branches
   │  ├─ department_id  → departments
   │  ├─< lecture_attendance · timetable_slots(→subjects→faculty)
   │  ├─< erp_exam_results · erp_marksheets · erp_certificates
   │  ├─< fee_assignments >─ payments
   │  ├─< erp_transport_allocations · erp_hostel_allocations
   │  ├─< erp_library_issues · erp_inventory_issues
   │  └─< erp_placements · erp_training_enrollments · erp_grievances

faculty ── code (unique)
   │  ├─ user_id        → profiles
   │  ├─ department_id  → departments   (HOD link: departments.hod_faculty_id)
   │  ├─ designation_id → designations
   │  ├─> subjects · timetable_slots · lecture_attendance
   │  └─< faculty_leaves · erp_payroll_runs · erp_payslips · erp_employee_attendance
```

Every new table uses `uuid` primary keys, `created_at`/`updated_at`, explicit
foreign keys, `active` flags where soft-delete applies, and RLS enabled with
`is_admin()` / `has_permission()` / scope-aware policies.

### 2.3 Duplicate prevention

- `students.enrollment` and `students.student_id_code` get unique indexes
  (nulls are allowed and duplicated for legacy rows only — the index is created
  with `where ... is not null and <> ''` so existing data is never broken).
- `faculty.code` gets a unique index where not null.
- `students.user_id` gets a unique index: **one student row per login**.
- `faculty.user_id` gets a unique index: **one faculty row per login**.
- A trigger resolves a student/faculty by verified e-mail the first time a
  person signs in, so the portal login reuses the master row instead of
  creating a second one.
- Every generic table gets a natural-key uniqueness rule declared in the
  module registry, and the Excel importer reports a duplicate as a validation
  error instead of inserting a second row.

### 2.4 Dynamic form builder (centralised)

`erp_form_definitions` → `erp_form_versions` → `erp_form_records`:

- A definition belongs to a module, has a name, a status (`draft` / `published`
  / `archived`), and points at the physical table it stores records in, or at
  the shared `erp_form_records` table.
- Every save creates a **new version row** containing the full field
  definition JSON. The previous version is never overwritten.
- `erp_form_records.data` is `jsonb` and stores `form_version`, so a record
  always renders with the field set that was live when it was submitted. Old
  data is preserved when a field is renamed or removed.
- Field types: `text`, `textarea`, `number`, `money`, `date`, `datetime`,
  `time`, `select`, `multiselect`, `radio`, `checkbox`, `email`, `phone`,
  `url`, `file`, `reference` (FK to another table).
- Field options: static list, or a **dynamic dropdown** bound to another
  table (`options_source: { table, valueColumn, labelColumn, filter }`).
- Validation per field: required, min/max, minLength/maxLength, pattern,
  unique, default value.
- Conditional visibility: `{ fieldKey, operator, value }` — the same operator
  vocabulary already used by the admission form builder, so the two builders
  behave identically.
- Module permissions: each definition carries `allowed_roles` and is checked
  against the signed-in role before it is rendered.

### 2.5 Module enable / disable and permissions

- `erp_modules.enabled` — a disabled module is hidden from the dashboard and
  its pages are unreachable; existing rows and users are untouched.
- `erp_module_permissions(module_id, role_code, can_view, can_create, can_edit,
  can_delete, can_export, can_approve)` — the per-role CRUD matrix.
- The client resolves the matrix through `get_my_erp_access()`; the database
  enforces it through RLS policies that call the same helper. The client can
  never widen access.

### 2.6 Approval workflows

`erp_approval_workflows(module_id, name, steps jsonb, enabled)` where `steps`
is an ordered list of `{ role_code, action, label }`. Records in a workflow
module store their current step in `erp_workflow_items`. The database exposes
`erp_workflow_action(p_item_id, p_action, p_comment)` which validates the
caller's role against the current step and advances or rejects the item. Every
transition is written to `erp_audit_log`.

### 2.7 Receipt templates and custom reports

- `erp_receipt_templates` — JSON template (header lines, table columns, footer)
  bound to a module and a receipt kind; the printing helper renders it to a
  print-ready document.
- `erp_report_definitions` — base table, columns, filters, chart type and
  allowed roles; the Reports screen renders saved reports and exports them.

### 2.8 Notifications

`erp_notifications(id, module_id, title, body, severity, audience jsonb,
target_user, target_role, created_by, created_at, expires_at)` plus
`erp_notification_reads(notification_id, user_id, read_at)`. The bell in the
header shows the unread count for the signed-in account, and the centre lists,
filters and marks notifications as read.

### 2.9 Audit logging

A generic trigger `erp_audit_trigger()` writes to `erp_audit_log`
(`table_name`, `record_id`, `action`, `actor`, `before`, `after`, `at`) for
every insert/update/delete on the ERP domain tables. The existing
`audit_logs` table is left in place for the legacy admission screens.

### 2.10 Excel / PDF rules (every module)

| Capability | Implementation |
| --- | --- |
| Export | `downloadExcel` with the module's configured columns |
| Template | `downloadExcelTemplate` with an Instructions sheet |
| Import | `readExcelRows` + per-column validation + reference resolution |
| Bulk validation | All rows are validated **before** anything is written; the run aborts with a full error report |
| Duplicate detection | Natural key from the module config; duplicates are reported as errors and skipped, never inserted twice |
| Error report | Downloadable `.xlsx` "Import Errors" sheet with row number, column and reason |
| Document upload | Private `erp-documents` bucket, 5 MB, PDF/JPEG/PNG |
| PDF | `src/lib/pdf.js` renders a print-ready document through the browser print dialog |
| Search / filters | Free-text search over `searchFields` plus configured dropdown filters |

### 2.11 Dashboard

`ErpDashboard.jsx` renders, for the signed-in role:

- summary cards from the module's `kpis` (each KPI is a real aggregate query),
- bar / donut charts built from CSS + SVG (no chart dependency is added),
- a notification centre bell,
- a global search that queries the module tables the user may see,
- quick actions that deep-link into the module pages the user may open,
- a responsive layout that keeps the existing `.shell` / `aside` / `main`
  structure and the existing colour palette (`#1459b5`, `#102c53`, `#f4f7fb`).

---

## 3. Verification strategy (applied to every phase)

| Check | Command |
| --- | --- |
| Production build | `npm run build` |
| Whitespace / conflict markers | `git diff --check` |
| Migration idempotency | re-run every migration against the local stack with `ON_ERROR_STOP=1` |
| Migration correctness | `scripts/local-stack.sh up` applies 001 → N in order against PostgreSQL 15 |
| Unit checks | `npm run test:login-modules`, `npm run test:form-fields`, `npm run test:admission-types` |
| End-to-end | `npm run test:login-modules:e2e`, `npm run test:branch-field:e2e` (local stack) |
| Regression | existing admission / inquiry / academics screens re-checked in the browser |

The local stack (Postgres 15 + PostgREST 12 + GoTrue + MailHog) was started
during Phase 1 and all 34 existing migrations applied without error — 68 tables
and 56 functions are present.

---

## 4. Phase plan and the files each phase touches

| Phase | Files added / changed | Migration |
| --- | --- | --- |
| 1. Audit & architecture | `docs/ERP_ARCHITECTURE.md`, `docs/ERP_MODULE_PLAN.md` | – |
| 2. RBAC, users, dynamic login | `src/lib/accessControl.js`, `src/lib/erpAccess.js`, `src/components/UserManagement.jsx`, `src/main.jsx`, `src/components/LoginPage.jsx` | `035_erp_core_framework.sql` |
| 3. Dynamic form builder & settings | `src/components/ErpAdminSettings.jsx`, `src/lib/erpExcel.js`, `src/lib/pdf.js`, `src/main.jsx` | `036_erp_dynamic_forms.sql` |
| 4. Admission, Student, Faculty integration | `src/lib/erpModules.js`, `src/components/StudentManagement.jsx`, `src/components/Academics.jsx`, `src/components/InquiryAdmissions.jsx` | `037_erp_people_spine.sql` |
| 5. Academic, Timetable, Attendance | `src/lib/erpModules.js`, `src/components/Academics.jsx`, `src/components/TimetableDashboard.jsx` | `038_erp_academics.sql` |
| 6. Accounts, Transport, HR, Payroll | `src/lib/erpModules.js`, `src/components/ErpModuleScreen.jsx` | `039_erp_finance_transport_hr.sql` |
| 7. Examination, Library, Hostel, ID Card | `src/lib/erpModules.js`, `src/components/SmartIdCards.jsx` | `040_erp_exam_library_hostel.sql` |
| 8. Remaining modules, notifications, reports | `src/lib/erpModules.js`, `src/components/NotificationCenter.jsx`, `src/components/ErpDashboard.jsx`, `src/components/ErpModuleOverview.jsx`, `src/erp.css` | `041_erp_support_modules.sql` |
| 9. Integration, security, production | `src/main.jsx`, `src/style.css`, `docs/ERP_SETUP.md`, `README.md`, `PROJECT_STATUS.md` | `042_erp_security_audit.sql` |

Each phase ends with `npm run build`, `git diff --check`, a full migration
re-run against the local stack, and a README update. A phase is only reported
as complete when all of those pass.

### What the phases delivered

| Phase | Result |
| --- | --- |
| 1 | The audit of the existing project, the twelve gaps that were found and the target architecture |
| 2 | The module registry, the permission matrix, the module enable/disable switch, the 14 new staff roles, the 14 new login modules and the 19 new dashboard routes |
| 3 | The centralised dynamic form builder with schema versioning, the record store, the validation function, the system settings and the Super Admin console |
| 4 | The shared student, faculty, department and guardian spine with the foreign keys, the duplicate protection and the login linking |
| 5 | The academic, timetable and attendance tables of the modules |
| 6 | The accounts, transport, HR and payroll tables and the voucher, library and payroll workflows |
| 7 | The examination, library, hostel and ID card tables and the issue / return workflow |
| 8 | The communication, inventory, placement, certificate, website and helpdesk tables, the notification centre, the role aware dashboard and the generic module screen |
| 9 | The module path on the shared masters with the data scope, the audit triggers, the tests and the documentation |

### The tests that were added

| Test | What it proves |
| --- | --- |
| `e2e/erp_registry.test.mjs` | the registry, the navigation and the database agree with each other |
| `e2e/erp_modules.e2e.mjs` | the 25 modules, the permission matrix, the shared masters, the form versioning, the notification centre, the module enable/disable, the audit trail and the module workflows |
| `e2e/erp_excel.test.mjs` | the shared Excel layer: conversion, validation, duplicate detection |
| `e2e/login_modules.e2e.mjs` | the dynamic login and the role routing (extended for the 22 login modules) |
