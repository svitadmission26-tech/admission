# SVIT Admission ERP

The active application is a React/Vite frontend backed by Supabase Auth, PostgreSQL, and private Supabase Storage. An optional Express server exposes a health endpoint. Application data access goes directly through Supabase with row-level security; the Express service does not use a service-role key.

## Run locally

1. Use Node.js 20 or newer and npm.
2. Create a new Supabase development project.
3. In the Supabase SQL Editor, review and run `supabase/migrations/002_admission_erp.sql`. The migration is idempotent, so it is safe to re-run if a later statement fails or if it has already been applied. The existing `001_initial_schema.sql` is for the legacy form-builder prototype and is not required by this application.
4. Copy `.env.example` to `.env.local`, then set the Supabase project URL and public publishable/anon key:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
   ```

   `VITE_SUPABASE_ANON_KEY` is also accepted for projects using the legacy anon-key name. Never put a service-role/secret key in a `VITE_` variable.

5. Install dependencies and start the frontend:

   ```bash
   npm install
   npm run dev
   ```

6. Register a user in the application. To create the first administrator, copy that user's UUID from Supabase Authentication → Users and run this statement in the trusted SQL Editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = 'REPLACE_WITH_AUTH_USER_UUID';
   ```

   Sign out and back in to load the administrator role. There is intentionally no self-service admin registration.

## Staff and user management

After the base migration, run migrations `003_staff_roles.sql` through `022_student_inquiry_prefill.sql` in numerical order in the Supabase SQL Editor. They add staff roles, ID cards, inquiries, final admission records, seat-capacity enforcement, academics workflows, workbook-backed admission setup, receipt sequence configuration, admission-management tab configuration, college-logo storage and print settings, admission form schema-builder configuration, Student Profile Schema field options/text-case settings, standard student profile fields, admin inquiry/report template storage, dynamic branch intake headings with category/branch capacity enforcement, quota seat report/transfer history, configurable staff page/feature access with college/department/course data scopes, fixes for recursive/hidden catalog row policies, and verified-student-email inquiry prefill for admission applications. The admission workflow depends on inquiries from migration 005 and must follow the existing migrations 003 and 004. Each migration is idempotent, so re-running an already-applied file is safe and does not duplicate tables, policies, indexes, or functions.

## Dynamic login modules (migration 034)

The login page lists the login modules from the `public.login_modules` table. **If migration `034_dynamic_login_modules.sql` has not been applied in your project, the login page has no modules to show.** Apply it in the Supabase SQL Editor after migration 033:

```bash
# the file to run in the Supabase SQL Editor
supabase/migrations/034_dynamic_login_modules.sql
```

The migration is idempotent and adds:

- `public.login_modules` – the module list (Admin, Faculty, Student, HOD, Admission Staff, Accountant, Library Staff, Examination Cell) with the dashboard route and the roles that may use each module,
- `public.get_college_branding()` – the college name and logo shown on the login page,
- `public.effective_login_role()` and `public.resolve_login_module()` – the server side validation of the selected module,
- `public.admin_save_login_module()` – the admin screen that renames, orders, enables, disables and restricts modules,
- `public.resolve_login_email()` – signing in with the user id instead of the email address.

Until the migration is applied the login page shows the built-in module list from `src/lib/loginModules.js` together with a warning, so the page is never empty. The server side validation stays switched off in that state: apply the migration to let the database validate the module and the role.

## The 25 ERP modules (migrations 035 to 042)

The dynamic College ERP runs on the framework that migrations `035` to `042` add. Apply
them in numerical order after migration 034:

```bash
supabase/migrations/035_erp_core_framework.sql      # module registry, permissions, workflows, receipts, reports, notifications, audit
supabase/migrations/036_erp_dynamic_forms.sql       # the centralised dynamic form builder and the system settings
supabase/migrations/037_erp_people_spine.sql        # the shared student / faculty / guardian spine
supabase/migrations/038_erp_academics.sql           # semesters, curriculum, rooms, substitutions, attendance
supabase/migrations/039_erp_finance_transport_hr.sql # accounts, transport, HR and payroll
supabase/migrations/040_erp_exam_library_hostel.sql # examination, library, hostel and ID card
supabase/migrations/041_erp_support_modules.sql     # communication, inventory, placement, certificates, website, helpdesk
supabase/migrations/042_erp_security_audit.sql      # the module path on the shared masters and the audit triggers
```

Every migration is idempotent. The whole chain can be applied again on a database that
already has it: no error, no duplicated table, policy, index or function.

> **If a migration fails with**
> `ERROR: function public.erp_apply_module_policies(unknown, unknown) does not exist`
> **or with**
> `ERROR: cannot change name of input parameter`
> **or with**
> `ERROR: column "student.user_id" does not exist`
> **or with**
> `ERROR: relation "public.erp_timetable_rooms" does not exist`
>
> **then run the single repair file `supabase/repair/erp_apply_module_policies.sql`**
> in the Supabase SQL Editor and run the module migrations 036 to 042 again.
> The repair file creates the helper, makes sure the shared masters are there
> and protects every module table that already exists. It never drops a record.
>
> To see why a migration stops, run `supabase/repair/diagnose.sql` first. It
> only reads and shows every version of the policy helper, everything that
> still uses it, the module tables and their permissions. The **last table** of
> the output is a summary of 19 checks. Every row that says `MISSING` is what
> the error is about. The file never fails, not even on a database where
> nothing of the ERP is there yet.
>
> The helper is carried by the migrations 036 to 042 themselves, so a module
> migration can be applied on its own.
>
> The helper never stops a migration. A table that is missing, a role that is
> missing or a policy that cannot be created is reported as a warning and the
> migration goes on. When the permission matrix of migration 035 is not there
> yet, a safe fallback is used: everybody is refused and the admins are let in.
> The report of the repair file then shows that migration 035 is still missing.
>
> Every other statement of the migrations 036 to 042 is protected the same
> way. A statement that cannot be run is reported as a warning that names the
> statement, for example:
>
>     WARNING:  create unique index if not exists erp_curriculum_unique:
>                column "course_id" does not exist
>
> The rest of the migration is still applied. The Supabase SQL Editor runs a
> whole script in one transaction, so without that protection a single error
> would roll the whole migration back.
>
> **If a module migration stopped halfway**, run
> `supabase/repair/module_policies.sql` as well. It applies the module permissions
> to every module table again and reports what is still missing.
>
> `npm run test:migrations` checks the migration files themselves: a file that was
> cut short, a broken dollar quoting, a module migration without the helper or a
> migration that reads a shared master without making sure it is there fails that
> test before the migrations are applied.

What the framework adds:

- `public.erp_modules` – the 25 modules with their number, title, icon, dashboard
  route, entry page and the **enabled** switch. A disabled module disappears from the
  navigation and from the access list; its records and its users stay untouched.
- `public.erp_module_permissions` – the per-role view / create / edit / delete / export /
  approve rights of every module. `public.get_my_erp_access()` returns the access of the
  signed-in account and `public.erp_module_permission(module, action)` is the check that
  the row level security of every module table uses.
- `public.erp_form_definitions`, `public.erp_form_versions`, `public.erp_form_records` –
  the dynamic form builder. `public.erp_save_form()` writes a **new version** on every
  save, so a renamed or removed field never changes the data that was already
  collected. `public.erp_form_errors()` validates a payload against a version and
  `public.erp_save_form_record()` refuses a payload that does not match.
- `public.erp_approval_workflows`, `public.erp_workflow_items`,
  `public.erp_workflow_action()` – the configurable approval chains.
- `public.erp_receipt_templates`, `public.erp_report_definitions`,
  `public.erp_saved_reports`, `public.erp_report_schedules` – the receipt layouts and the
  custom reports.
- `public.erp_module_timings`, `public.erp_feature_flags`, `public.erp_settings` – the
  module wise configuration.
- `public.erp_notifications`, `public.erp_notification_reads`,
  `public.erp_notify()` – the notification centre.
- `public.erp_audit_log` – every write of every module table, written by a trigger.

The shared masters are extended, never copied:

- `students` gets `user_id`, `inquiry_id`, `application_id`, `admission_id`, `course_id`,
  `branch_id`, `department_id` and the profile columns. The enrollment, the student id
  code and the login are unique, so a student is never created twice.
- `faculty` gets `user_id`, `employee_code`, `department_id`, `designation_id` and the
  employment columns. The faculty code and the login are unique.
- `departments` gets `hod_faculty_id`.
- A trigger links a portal login to the master row that already carries the verified
  e-mail address, in both directions. The student and the faculty portal therefore read
  the master record and never a copy.

### The roles of the modules

The module matrix is seeded by migration 035 for the roles of the ERP. New roles:
`principal`, `transport_manager`, `accounts_officer`, `hr_manager`, `librarian`,
`hostel_warden`, `exam_controller`, `placement_officer`, `inventory_manager`,
`certificate_officer`, `website_editor`, `helpdesk_agent`, `parent` and `counsellor`.
Each of them also gets a login module, so the login page offers the entry point of
every module.

### Local stack for development

A local Postgres + PostgREST + GoTrue stack with all migrations applied can be started without touching the hosted project:

```bash
npm run local-stack          # starts the stack and prints the .env.local values
npm run local-stack:down     # stops and removes it
```

Put the printed values into `.env.local` to run the app against the local stack, then start the frontend with `npm run dev`. The stack serves `http://127.0.0.1:8000`, MailHog captures the outgoing emails on `http://127.0.0.1:8025`.

### Tests

```bash
npm run test:login-modules       # the built-in catalogue stays in sync with migration 034
npm run test:login-modules:e2e   # the full login flow against the local stack
npm run test:form-fields         # the admission form field helpers
npm run test:admission-types     # the admission type codes and labels
npm run test:erp-excel           # the shared Excel layer of the modules
npm run test:erp-registry:e2e    # the module registry against the navigation and the database
npm run test:erp-modules:e2e     # the 25 modules, the permissions, the shared masters and the audit trail
```

The end-to-end suites need the local stack to be running (`npm run local-stack`). They cover the public module dropdown, college branding, the role based routing of every module, disabled modules, disabled staff accounts, the row level security of the module tables, the permission matrix of the 25 modules, the shared student and faculty masters, the schema versioning of the dynamic form builder, the notification centre and the audit trail.


Copy `server/.env.example` to `server/.env` and set the Supabase URL, public anon key, and **server-only service-role key**. Set a valid `CORS_ORIGIN` for the frontend. Never put the service-role key in `.env.local`, a `VITE_` variable, source control, or client code. The frontend calls `http://localhost:3001/api` by default; set `VITE_API_BASE_URL` in `.env.local` if the API runs elsewhere.

Run the API and frontend in separate terminals:

```bash
npm run server
```

```bash
npm run dev
```

Sign in as an administrator and open **User Management** to invite staff, assign a role and optional department, link Faculty accounts to a faculty record, or disable staff access. Active ID Card Operators and administrators can use the **ID Cards** tab to issue cards for approved applications, preview/print cards, record reprints, and revoke cards. Admission Authorities and administrators can prepare and finalize records in **Final Admissions**; Data Entry Operators can fetch inquiry data for preparation; principals and department heads have read access. Only administrators can create seat intakes. Invitation emails require Supabase Auth email delivery and a configured redirect URL. The API verifies the caller's access token and admin profile before using its server-side service key.

The public inquiry form is available at `/#/inquiry` (also linked from the sign-in screen). Admin, Admission Authority, and Data Entry roles can manage inquiries and follow-ups from the **Inquiries** tab; Principal and Department Head roles have read-only access. Students who sign in with the same verified email address used on their inquiry can prefill matching fields in the published admission form; the inquiry lookup is restricted to that authenticated account. The inquiry form's database submission RPC has a honeypot, but that is not bot protection: add CAPTCHA/Turnstile and rate limiting at an Edge Function or API gateway before public launch.

## Included modules

- A Main Dashboard with separate Admissions, Student Management, Time Table & Faculty, and restricted Super Admin module entry points. Each entry opens a module-branded sign-in screen; existing Supabase accounts and role permissions are shared, and navigation after sign-in is limited to the selected module. Only the administrator profile can enter Super Admin and access all modules.
- Admin dashboard and CRUD for colleges, courses, branches, and academic years, plus admission form, form type, student profile schema, fee scheme, fee structure, and merit formula management.
- Dedicated Student Profile Schema editor with required/default settings, select options, and as-entered/uppercase/lowercase text handling; linked Dynamic Form fields inherit these settings.
- Admin-only **Workbook Data** area for all nine supplied workbook sheets. Importing saves the sheet headings and rows and synchronizes matching colleges, courses, branches, form types, profile fields, admission form setup, fee structures, fee schemes, and merit rules with their ERP tables.
- Admin-only **Receipt Sequence Management** tab in Admission Management for college/year/payment/course/admission-type receipt prefixes, current sequence, next-receipt preview, filters, and add/edit/reset/delete actions.
- Student registration, published dynamic admission forms, application submission, and admin application status review.
- Private PDF/JPEG/PNG document upload and short-lived signed downloads.
- Fee structures, assignments, and manual payment records stored in integer paise.
- Manual merit schemes and entries, plus basic application CSV reporting.
- Admin-only staff invitation and role/department management.
- Smart student ID card issuance, print preview, QR encoding of an opaque card number, reprint logging, and revocation.
- Inquiry-linked final admission records, seat intake management, capacity enforcement, decision history, and CSV export.
- Branches can define government intake headings dynamically (for example ACPC, Management, or TFWS) with seat limits. Academic-year allocations must stay within each heading limit and the branch's total intake; final admissions are checked against both limits in the database.
- **Quota Seat Report** shows allocated and filled seats, cancellations, transfer-in/transfer-out history, vacant quota seats, and branch-wide filled/vacant totals. Cancelled admissions release their seats; a transfer records the source and destination quota and counts the student only once in current filled seats. Apply migration `018_intake_quota_report.sql` for this report and transfer history.
- **Dynamic Staff & User Management** lets administrators create roles, select visible pages and action permissions, and assign each staff account all-data access or a combination of college, department, and course scopes. Dashboard counts, admissions, inquiries, academic records, fees, reports, intake allocations, and exports are filtered by the assigned scope; database row policies and write guards enforce it as well. Existing staff accounts retain their prior all-data access after migration 019; assign narrower scopes in Manage Users where needed.
- Report templates can be shared with selected staff roles. Users need both the Reports/Report Builder page permission and `View reports`; template rows and the underlying report data remain restricted by role and data scope.
- Public admission inquiries, staff inquiry follow-up history, inquiry search, and status filtering.
- Admin-only **Inquiry Forms** builder for saving form layouts, sections, fields, student-profile links, and previews. These saved definitions do not replace the standard public inquiry submission endpoint.
- Admin-only **Report Builder** for saving table/column templates, custom column labels and allowed-role settings, previewing up to 100 policy-visible records, and exporting the preview as CSV.
- Academics tabs for student roster, timetable, faculty leave, and attendance. Administrators and Department Heads can manage academic records; other academic readers get read-only student/timetable views, while linked Faculty accounts get their own timetable and leave requests plus attendance for their assigned lectures.
- Student Management reads and writes the shared `public.students` master; timetable, attendance, and Faculty account links use the shared `public.faculty` master. These are common database records, not separate copies per module.

## Excel workbooks

Excel tools use `.xlsx` files and are available on the relevant module screens:

- **Workbook Data**: import the complete workbook (`Courses`, `form type`, `Student Profile Schema`, `Manage Admission Forms`, `branch`, `college`, `Fee Structure Management`, `Manage Fee Schemes`, and `Merit Formula Management`). The importer checks that all nine worksheets and their required headings are present, rejects formulas/hyperlinks in imported values, stores rows in the workbook tables, and upserts matching ERP master/setup records. Workbook-created admission forms are drafts because the workbook has no form-field definitions; configure and publish them in **Form Builder**. Removing a row from the workbook snapshot does not delete the matching live ERP record. Edit and add workbook rows from the same screen; the migration `009_workbook_setup.sql` must be applied first. The original workbook is not modified.
- Course **Intake Capacity** is calculated from the sum of branch intakes for that course and college. It updates when branches are added, edited, or removed; the course total is read-only in course management, and imported course totals are recalculated from the branch sheet.
- **College logos and print settings**: upload a JPG, PNG, or WebP logo (up to 2 MB) from the college record editor. In Dynamic Forms, choose the college and enable **Show college logo on this admission form**; the selected logo appears on that college's published student form. Enable **Show college logo on receipts for this sequence** in Receipt Sequence Management to include the logo on printed payment receipts that match the active sequence. Payment receipt printing uses the existing payment reference; receipt numbers are not generated or advanced automatically.
- **Admission form schema builder**: choose a course, admission cycle, form type, application-fee amount, student availability, branch-selection flag, and allowed admission types. Arrange fields into configurable sections with Cards, Tabs, or Simple List layouts. Field settings include student-profile links, column width, required/merit flags, defaults, uppercase transformation, file/photo/document inputs, and conditional visibility. The application-fee amount is displayed as form configuration only; no online payment is initiated by form submission.
- Master data and fee structures: export, download a matching template, and import new rows only. Imports use the signed-in user's Supabase permissions and do not update or delete existing records.
- Inquiries: export the filtered list, or import new inquiries through the public inquiry RPC. Every row must contain explicit consent and a valid 10-digit Indian mobile number.
- Final Admissions: export the filtered admission list and seat-availability summary. Administrators can import new intake/seat rows; admission decisions must still be made through the guarded workflow.
- Form Builder: export forms and import validated draft forms. Imported forms are never published automatically.
- Staff and ID Cards: export the visible staff directory or issued-card register. Invitations, card issuance/revocation, and reprints remain controlled actions in their respective screens.
- Applications, Reports, and Documents: export visible application summaries, overview metrics, or document-register metadata. Application decisions and private document files are not imported or included in these exports.

Templates require their original header names and order. Formula and hyperlink cells are rejected. Imports create records only; use the module workflow for changes that affect admission decisions, payments, private files, accounts, or issued cards. ExcelJS is loaded on demand when an Excel action is used.

In **Form Builder**, administrators can add and reorder fields, preview the form, save drafts, publish, and duplicate a published form to start a new version. A published form stays editable: saving a change applies it to the live form straight away. Supported field types are text, email, telephone, number, date, textarea, select, radio, checkbox, file upload, photo, document and branch selection.

### Draft and published forms

The form list shows a **Draft** or **Published** badge next to every form, so it is clear at a glance which forms are live for students.

- A **draft** form has the actions **Edit**, **Copy** and **Delete**. Editing it opens the form builder with all fields editable.
- A **published** form has the actions **Edit**, **Duplicate** and a disabled **Delete**. Editing it opens the same builder; the editor shows a notice that the form is live for students.
- **Save Draft** and **Publish Form** belong to a draft. A published form is saved with **Save Changes**, which updates the form in place and keeps its published status.
- **Save Changes** on a published form applies the change to the live form immediately: the students who have not applied yet see the new questions. The applications that are already submitted keep their own answers.
- **Duplicate** (in the list or as **Duplicate as new version** in the editor) creates an editable draft named `<form title> (New Version)`. Use it when the current form has to stay exactly as it is and the new questions belong to a separate form.
- A published form cannot be deleted because the applications refer to it. Take it out of service with **Enabled for Students** instead.

A staff role that has the **Dynamic Forms** page can open the screen to read the forms. The screen then only offers **View** and **Export Excel** and explains that only an administrator can change a form.

### Admission types

**Admission Types** on a form decides which admission types the student may apply with. Tick the types that the form allows:

| Stored value | Shown to the administrator and to the student |
| --- | --- |
| `Regular` | Regular |
| `C2D` | C2D (C to D) |
| `D2D` | D2D (D to D) |

- The codes are stored in `admission_forms.allowed_admission_types` (a text array) and the chosen type is written to `applications.answers.admission_type`.
- When the form allows more than one type, the student picks one on the application form. When only one type is allowed, it is written to the application automatically.
- When no type is ticked, only Regular admission is allowed.
- A type that an older form already uses and that is not one of the three is kept and can be removed in the builder, so an existing form never loses a value.

### Adding fields in Form Builder

- **Add Field** opens the field editor for one field.
- **Add Fields in Bulk** adds several fields in one step. The panel has two tabs:
  - *Custom field types*: tick every field type you need, change the label of each one and add them together. A key that is already used gets a numeric suffix, so the form stays valid.
  - *Student profile fields*: tick the student profile fields and add them together. Every added field keeps its label, key, type, required flag and text case and stays linked to the student profile field.
- The new fields are added to the section that is open in the sidebar. Every field row starts with its **Sr. No.**, the position of the field inside that section (1, 2, 3 …). The number follows the field when it is moved, and every section counts from 1 again. Use the **↑** and **↓** buttons of a field to move it up or down inside its section. The fields of the other sections keep their position.
- The field editor has a **Move to Sr. No.** box. It starts on the number the field has now; type another number and save the field and it moves to that number in its section. The same box works for a new field, so a field can be added straight at the right place. A number that is too large moves the field to the end of the section, a number that is too small moves it to the start.
- **Branch Selection** is a field type that shows the branches of the course that is selected on the form. Tick the branches that should be offered; when no branch is ticked every active branch of the course is offered. The branch that the student chooses is stored with the application in `answers.branch_id`, and an inquiry that mentions the same branch pre-fills the field.

### Tests

```bash
npm run test:form-fields        # field keys, move up / down and the branch options
npm run test:admission-types    # the admission type codes, labels and clean up
npm run test:branch-field:e2e   # the branch field on a published form (needs the local stack)
```

Students are shown every published form that is enabled for students. When only one form is published it is opened straight away. When more than one form is published the student gets an **Admission Form** selection and picks the form that belongs to the course and the admission cycle; the newest form is selected by default. The chosen form decides the questions, the sections, the admission types and the branches, and the application is stored with the form that was chosen (`applications.form_id`).

Form Builder `fields` are stored in the `admission_forms.fields` JSON column as an array. Example:

```json
[
	{
		"key": "full_name",
		"label": "Full name",
		"type": "text",
		"required": true
	},
	{
		"key": "program",
		"label": "Program",
		"type": "select",
		"required": true,
		"options": ["BSc", "MSc"]
	}
]
```

## Security and limitations

- RLS policies restrict student records to their own applications, documents, fees, and payments. Admin privileges are granted only through a trusted database operation.
- The student document bucket is private and limits files to 5 MB PDF/JPEG/PNG. Add malware scanning, retention controls, and audit logging before production.
- Payments are manual records; no payment gateway, webhook, or reconciliation flow is implemented. Gateway settings store non-secret metadata only. Admission and receipt sequence settings do not generate application or receipt numbers. Merit entries are manual; there is no automatic ranking engine. Bus QR settings store route and URL configuration only; no bus integration or QR generation flow is implemented.
- ID card QR codes are not a public verification service; they contain only an opaque card number. Optional photo paths must refer to the student's existing private document storage object.
- Admission records in **Final Admissions** are linked to inquiry records; they do not automatically create student accounts, application rows, or ID cards. Before applying migration 007 to an existing database, reconcile previously admitted records and assign their intake IDs.
- Staff role-specific screens outside the listed modules, full server-side form submission validation, form versioning, receipt generation, integration/browser/security tests, and production deployment are not implemented. Role and permission records alone do not make every staff workflow available. The module-specific login pages use the same Supabase email/password; they are separate entry screens, not separate credentials or identity stores.
- Use sanitized test data and a separate staging project. Do not use real applicant data until institutional acceptance, security, backup, and recovery testing is complete.
