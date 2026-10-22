# SVIT College ERP — project status

## What is running

- React 19 + Vite 6 frontend, Supabase (PostgreSQL / PostgREST / GoTrue / Storage),
  an optional Express health endpoint, ExcelJS for the workbooks, `qrcode` for the ID
  cards.
- **25 dynamic ERP modules** sharing one central PostgreSQL database, driven by the
  module registry in `src/lib/erpModules.js` and rendered by the shared module screen.
- A **centralised dynamic form builder** with schema versioning, a **module registry**
  with an enable / disable switch, a **per-role permission matrix** that the database
  enforces, approval workflows, receipt templates, custom reports, module timings,
  feature flags, a notification centre and an audit trail.
- The original admission ERP is intact: inquiries, applications, final admissions,
  seat intake, the admission form builder, fees, payments, merit, the Excel workbook
  importer, the academics screens, the leave workflow, the ID cards and the public
  inquiry form.

## Verified

- `npm run build` succeeds.
- The whole migration chain `001` → `042` applies on a clean Supabase-like database
  **and** applies a second time without a single error.
- `npm run test:login-modules`, `npm run test:form-fields`,
  `npm run test:admission-types` and `npm run test:erp-excel` pass.
- `npm run test:login-modules:e2e`, `npm run test:erp-registry:e2e` and
  `npm run test:erp-modules:e2e` pass against the local stack (Postgres 15 +
  PostgREST 12 + GoTrue).
- `git diff --check` reports no whitespace errors.

## Known limitations

- The PDF output is a print-ready document that goes through the browser print dialog,
  where it can be saved as a PDF. No PDF engine is bundled.
- The fee module still records the payments by hand; no payment gateway, webhook or
  reconciliation flow is implemented.
- The public inquiry form has a honeypot but no CAPTCHA. Add Turnstile and a rate
  limiter at an Edge Function before the public launch.
- The ID card QR contains an opaque card number; it is not a public verification
  service.
- The admission and the receipt sequence settings do not generate a number by
  themselves.
- The documents are stored in a private bucket without a malware scan and without a
  retention policy. Add both before the production launch.
- The module screens read at most 500 records per list. Narrow the dataset with a
  filter for a larger list.

## Setup

1. `npm install`.
2. `npm run local-stack` for the local database, or apply the migrations in
   `supabase/migrations` in numerical order on a Supabase project.
3. Copy `.env.example` to `.env.local` and set the project URL and the publishable
   key. Never commit a secret and never put the service-role key in a `VITE_`
   variable.
4. `npm run dev` for the frontend, `npm run server` for the optional API.
5. Promote the first account to the administrator:
   `update public.profiles set role = 'admin' where id = '<AUTH_USER_UUID>';`
6. Open **Super Admin Dashboard** to grant the module permissions, to build the
   dynamic forms and to configure the module timings.

Do not deploy as production ready until the institutional acceptance, the backup and
the recovery testing are complete.
