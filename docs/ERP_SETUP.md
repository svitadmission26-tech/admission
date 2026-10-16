# SVIT Admission ERP

The active application is a React/Vite frontend backed by Supabase Auth, PostgreSQL, and private Supabase Storage. An optional Express server exposes a health endpoint. Application data access goes directly through Supabase with row-level security; the Express service does not use a service-role key.

## Run locally

1. Use Node.js 20 or newer and npm.
2. Create a new Supabase development project.
3. In the Supabase SQL Editor, review and run `supabase/migrations/002_admission_erp.sql` once. The existing `001_initial_schema.sql` is for the legacy form-builder prototype and is not required by this application.
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

## Optional Express health endpoint

Copy `server/.env.example` to `server/.env`, then run:

```bash
npm run server
```

Check `http://localhost:3001/api/health`. The server is only a health/API extension scaffold; it does not currently handle admission business operations.

## Included modules

- Admin dashboard and CRUD for universities, colleges, courses, branches, academic years, and admission forms.
- Student registration, published dynamic admission forms, application submission, and admin application status review.
- Private PDF/JPEG/PNG document upload and short-lived signed downloads.
- Fee structures, assignments, and manual payment records stored in integer paise.
- Manual merit schemes and entries, plus basic application CSV reporting.

Form Builder `fields` must be a JSON array. Example:

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
- Full server-side validation, form versioning, receipt generation, integration/browser/security tests, and production deployment are not implemented.
- Use sanitized test data and a separate staging project. Do not use real applicant data until institutional acceptance, security, backup, and recovery testing is complete.
