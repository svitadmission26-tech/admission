# SVIT College ERP — Dynamic Education ERP

> **Active application:** this repository runs the **SVIT College ERP**: a React + Vite
> frontend on Supabase (PostgreSQL, Auth, Storage) with **25 dynamic modules**, a
> **centralised dynamic form builder**, a **database driven role and module permission
> matrix**, and a module wise dashboard. The original admission ERP is intact and is
> the backbone of the admission, inquiry, academics and ID card modules.
>
> - Architecture and audit: [`docs/ERP_ARCHITECTURE.md`](docs/ERP_ARCHITECTURE.md)
> - Module by module plan: [`docs/ERP_MODULE_PLAN.md`](docs/ERP_MODULE_PLAN.md)
> - Setup and operations: [`docs/ERP_SETUP.md`](docs/ERP_SETUP.md)

---

## 1. What the ERP contains

### The 25 modules

| # | Module | # | Module | # | Module |
| --- | --- | --- | --- | --- | --- |
| 1 | Super Admin Management | 10 | Examination Management | 19 | Inventory & Purchase |
| 2 | Admission & Inquiry Management | 11 | Department & HOD Management | 20 | Placement & Training |
| 3 | Student Management | 12 | HR & Payroll | 21 | Certificate Management |
| 4 | Faculty Management | 13 | Library Management | 22 | College Website & Public Portal |
| 5 | Accounts & Finance | 14 | Hostel Management | 23 | Grievance & Helpdesk |
| 6 | Transport Management | 15 | Smart ID Card | 24 | Reports & Analytics |
| 7 | Academic Management | 16 | Communication & Notification | 25 | System Configuration |
| 8 | Timetable Management | 17 | Parent Portal | | |
| 9 | Attendance Management | 18 | Student Portal | | |

Every module has its own dashboard, record lists, forms, search, filters, permissions,
Excel import/export and PDF output. The modules are **declared once** in
`src/lib/erpModules.js` and rendered by the shared module screen, so a module is a
configuration and a migration — not a new React file.

### The dynamic pieces

- **Dynamic form builder** — the Super Admin builds a form for any module: field types
  (text, number, date, dropdown, checkbox, radio, file upload, …), required and optional
  fields, dynamic dropdown options that read another table, validation rules, conditional
  visibility and module permissions. Every save writes a **new schema version**, so the
  data that was already collected is never changed.
- **Dynamic login modules** — the login page reads the modules from the database.
  Administrators rename, reorder, enable, disable and restrict them.
- **Module registry and permission matrix** — `public.erp_modules` and
  `public.erp_module_permissions` give every role its own view / create / edit /
  delete / export / approve rights per module. The database enforces the matrix; the
  browser only renders what the database allows.
- **Approval workflows, receipt templates, custom reports, module timings, feature
  flags, notification centre and an audit trail** are part of the framework.

### The shared spine

`students` and `faculty` remain the only Student and Faculty records. Every other
module links to them with a foreign key, so a person is never duplicated:

```
Student → Admission → Application → Student → Academic → Attendance → Examination
        → Accounts → Transport → Library → Hostel → Certificates → Placement

Faculty → Department → Subject → Timetable → Attendance → Leave → Payroll
```

---

## 2. Running the project

```bash
npm install

# a local Postgres + PostgREST + GoTrue + MailHog stack with every migration applied
npm run local-stack        # prints the .env.local values for the local stack
npm run local-stack:down   # stops the stack

cp .env.example .env.local # or paste the values that the stack printed
npm run dev                # the frontend
npm run server             # the optional Express health endpoint
```

For a hosted Supabase project, apply the migrations in `supabase/migrations` in
numerical order in the SQL editor. Every migration is idempotent: running the whole
chain twice produces no error and changes nothing.

```bash
npm run build              # the production build
```

### The tests

| Command | What it proves |
| --- | --- |
| `npm run test:migrations` | every migration file is complete, the dollar quoting is balanced, every module migration carries the policy helper and no migration reads a shared master without making sure it is there |
| `npm run test:login-modules` | the built-in login catalogue matches migration 034 |
| `npm run test:form-fields` | the admission form field helpers |
| `npm run test:admission-types` | the admission type codes and labels |
| `npm run test:erp-excel` | the shared Excel layer: conversion, validation, duplicate detection |
| `npm run test:erp-registry:e2e` | the module registry matches the navigation and the database |
| `npm run test:erp-modules:e2e` | the 25 modules, the permission matrix, the shared masters, the form versioning and the audit trail |
| `npm run test:login-modules:e2e` | the dynamic login and the role routing |
| `npm run test:branch-field:e2e` | the branch field on a published admission form |

The end-to-end suites need the local stack (`npm run local-stack`).

### Repair files

| File | When it is used |
| --- | --- |
| `supabase/repair/diagnose.sql` | the first file to run when a module migration stops. It only reads and shows every version of the policy helper, everything that still uses it, the module tables and their permissions. The last table of the output is a summary of 19 checks: every row that says `MISSING` is what the error is about. Send that last table back. |
| `supabase/repair/erp_apply_module_policies.sql` | a module migration stopped with `function public.erp_apply_module_policies(unknown, unknown) does not exist`, `cannot change name of input parameter` or `relation "public.erp_timetable_rooms" does not exist`. The file creates the helper, makes sure the shared masters are there and protects every module table that already exists; it never drops a record. Run it once, then run 036 to 042 again. |
| `supabase/repair/module_policies.sql` | a module migration stopped halfway. The file applies the module permissions to every module table again and reports what is still missing. |

**The report of the repair files** ends with two numbers: `protected_module_tables`
are the tables that really carry the four module policies and `module_tables`
are the tables that are there. When the two are the same, every module table
is protected. The list under them names the tables that are still open.

**A module migration never stops.** Every statement of the migrations 036 to
042 is protected: a statement that cannot be run is reported as a warning that
names the statement, and the rest of the migration is still applied. The
Supabase SQL Editor runs a whole script in one transaction, so a single error
would otherwise roll the whole migration back.

---

## 3. The migrations

| Migration | Content |
| --- | --- |
| 001 – 034 | the original admission ERP (master data, admissions, inquiries, academics, ID cards, dynamic login modules) |
| `035_erp_core_framework.sql` | the module registry, the permission matrix, the module timings, the feature flags, the approval workflows, the receipt templates, the report definitions, the notifications and the audit trail |
| `036_erp_dynamic_forms.sql` | the centralised dynamic form builder: definitions, schema versions, records, templates and the system settings |
| `037_erp_people_spine.sql` | the shared people spine: the student and the faculty master with their foreign keys, the guardians, the parent links, the department targets and the login linking |
| `038_erp_academics.sql` | semesters, curriculum, course outcomes, credit rules, academic records, rooms, substitutions, faculty attendance and the regularisation requests |
| `039_erp_finance_transport_hr.sql` | ledger heads, vouchers, ledger entries, bank accounts and reconciliation, budgets, routes, stops, vehicles, drivers, allocations, transport attendance, maintenance, leave policies, balances, payroll, payslips and advances |
| `040_erp_exam_library_hostel.sql` | exams, schedules, seating plans, results, marksheets, grade scales, revaluation, the library catalogue, members, issues, reservations, fines, the hostel rooms, allocations, attendance, maintenance and the ID card templates |
| `041_erp_support_modules.sql` | communication, inventory and purchase, placement and training, certificates, the website and the helpdesk |
| `042_erp_security_audit.sql` | the module path on the shared masters with the college / department / course scope, and the audit triggers |

---

## 4. The source tree

```
src/
  main.jsx                 the shell: authentication, routing, the module navigation
  lib/
    erpModules.js          the 25 modules: tables, fields, filters, KPIs, Excel and PDF
    erpAccess.js           the ERP access of the signed-in account (read from the database)
    erpExcel.js            the shared Excel layer: export, template, import, validation,
                           duplicate detection and the error report
    pdf.js                 the print ready document renderer (PDF through the print dialog)
    accessControl.js       the pages, the permissions and the dashboard routes
    excel.js               the legacy Excel helpers and the workbook importer
  components/
    ErpDashboard.jsx       the role aware dashboard: KPIs, charts, quick actions, search
    ErpModuleOverview.jsx  the dashboard of one module
    ErpModuleScreen.jsx    the generic module screen: list, filters, form, Excel, PDF
    ErpAdminSettings.jsx   the Super Admin console and the dynamic form builder
    NotificationCenter.jsx the notification centre of the header
    ...                    the existing admission, inquiry, academics and ID card screens
supabase/migrations/       the schema, applied in numerical order
e2e/                       the test suites
```

---

## 5. Security notes

- Every table has row level security. The module permission matrix and the legacy
  page permissions are both enforced by the database, never by the browser alone.
- The college / department / course scope of a staff account is applied to the module
  path as well, so a scoped account never sees more than its own scope.
- A student reads only the student record that is linked to the login. A guardian
  reads only the child that is linked to the login.
- Every write on a module table is written to `public.erp_audit_log`.
- The service-role key is never used in the browser. The Express server keeps it
  server-side only.
- Document buckets are private: `student-documents` (5 MB, PDF/JPEG/PNG) and
  `college-logos` (2 MB, image).

---

## 6. Legacy reference

The original Dynamic Form Builder blueprint (SvelteKit prototype) is kept in
[`docs/LEGACY_DYNAMIC_FORM_BUILDER.md`](docs/LEGACY_DYNAMIC_FORM_BUILDER.md) as a
reference for the field model and the conditional logic vocabulary. The running
application is the React/Vite ERP described in the first section; the SvelteKit
material is no longer part of the build.
