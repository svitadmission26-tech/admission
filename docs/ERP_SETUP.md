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

After the base migration, run migrations `003_staff_roles.sql` through `008_academics.sql` in numerical order in the Supabase SQL Editor. They add staff roles, ID cards, inquiries, final admission records, seat-capacity enforcement, and academics workflows. The admission workflow depends on inquiries from migration 005 and must follow the existing migrations 003 and 004. Each migration is idempotent, so re-running an already-applied file is safe and does not duplicate tables, policies, indexes, or functions.

Copy `server/.env.example` to `server/.env` and set the Supabase URL, public anon key, and **server-only service-role key**. Set a valid `CORS_ORIGIN` for the frontend. Never put the service-role key in `.env.local`, a `VITE_` variable, source control, or client code. The frontend calls `http://localhost:3001/api` by default; set `VITE_API_BASE_URL` in `.env.local` if the API runs elsewhere.

Run the API and frontend in separate terminals:

```bash
npm run server
```

```bash
npm run dev
```

Sign in as an administrator and open **User Management** to invite staff, assign a role and optional department, link Faculty accounts to a faculty record, or disable staff access. Active ID Card Operators and administrators can use the **ID Cards** tab to issue cards for approved applications, preview/print cards, record reprints, and revoke cards. Admission Authorities and administrators can prepare and finalize records in **Final Admissions**; Data Entry Operators can fetch inquiry data for preparation; principals and department heads have read access. Only administrators can create seat intakes. Invitation emails require Supabase Auth email delivery and a configured redirect URL. The API verifies the caller's access token and admin profile before using its server-side service key.

The public inquiry form is available at `/#/inquiry` (also linked from the sign-in screen). Admin, Admission Authority, and Data Entry roles can manage inquiries and follow-ups from the **Inquiries** tab; Principal and Department Head roles have read-only access. The inquiry form's database submission RPC has a honeypot, but that is not bot protection: add CAPTCHA/Turnstile and rate limiting at an Edge Function or API gateway before public launch.

## Included modules

- A Main Dashboard with separate Admissions, Student Management, Time Table & Faculty, and restricted Super Admin module entry points. Each entry opens a module-branded sign-in screen; existing Supabase accounts and role permissions are shared, and navigation after sign-in is limited to the selected module. Only the administrator profile can enter Super Admin and access all modules.
- Admin dashboard and CRUD for colleges, courses, branches, and academic years, plus a visual admission form builder.
- Student registration, published dynamic admission forms, application submission, and admin application status review.
- Private PDF/JPEG/PNG document upload and short-lived signed downloads.
- Fee structures, assignments, and manual payment records stored in integer paise.
- Manual merit schemes and entries, plus basic application CSV reporting.
- Admin-only staff invitation and role/department management.
- Smart student ID card issuance, print preview, QR encoding of an opaque card number, reprint logging, and revocation.
- Inquiry-linked final admission records, seat intake management, capacity enforcement, decision history, and CSV export.
- Public admission inquiries, staff inquiry follow-up history, inquiry search, and status filtering.
- Academics tabs for student roster, timetable, faculty leave, and attendance. Administrators and Department Heads can manage academic records; other academic readers get read-only student/timetable views, while linked Faculty accounts get their own timetable and leave requests plus attendance for their assigned lectures.
- Student Management reads and writes the shared `public.students` master; timetable, attendance, and Faculty account links use the shared `public.faculty` master. These are common database records, not separate copies per module.

## Excel workbooks

Excel tools use `.xlsx` files and are available on the relevant module screens:

- Master data and fee structures: export, download a matching template, and import new rows only. Imports use the signed-in user's Supabase permissions and do not update or delete existing records.
- Inquiries: export the filtered list, or import new inquiries through the public inquiry RPC. Every row must contain explicit consent and a valid 10-digit Indian mobile number.
- Final Admissions: export the filtered admission list and seat-availability summary. Administrators can import new intake/seat rows; admission decisions must still be made through the guarded workflow.
- Form Builder: export forms and import validated draft forms. Imported forms are never published automatically.
- Staff and ID Cards: export the visible staff directory or issued-card register. Invitations, card issuance/revocation, and reprints remain controlled actions in their respective screens.
- Applications, Reports, and Documents: export visible application summaries, overview metrics, or document-register metadata. Application decisions and private document files are not imported or included in these exports.

Templates require their original header names and order. Formula and hyperlink cells are rejected. Imports create records only; use the module workflow for changes that affect admission decisions, payments, private files, accounts, or issued cards. ExcelJS is loaded on demand when an Excel action is used.

In **Form Builder**, administrators can add and reorder fields, preview the form, save drafts, publish, and duplicate a published form to start a new version. Published forms are locked in the UI. Supported field types are text, email, telephone, number, date, textarea, select, radio, and checkbox.

Students are shown the newest published form. Course-specific form selection is not implemented yet. Form Builder `fields` are stored in the `admission_forms.fields` JSON column as an array. Example:

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
- Payments are manual records; no payment gateway, webhook, or reconciliation flow is implemented. Merit entries are manual; there is no automatic ranking engine.
- ID card QR codes are not a public verification service; they contain only an opaque card number. Optional photo paths must refer to the student's existing private document storage object.
- Admission records in **Final Admissions** are linked to inquiry records; they do not automatically create student accounts, application rows, or ID cards. Before applying migration 007 to an existing database, reconcile previously admitted records and assign their intake IDs.
- Staff role-specific screens outside the listed modules, full server-side form submission validation, form versioning, receipt generation, integration/browser/security tests, and production deployment are not implemented. Role and permission records alone do not make every staff workflow available. The module-specific login pages use the same Supabase email/password; they are separate entry screens, not separate credentials or identity stores.
- Use sanitized test data and a separate staging project. Do not use real applicant data until institutional acceptance, security, backup, and recovery testing is complete.
