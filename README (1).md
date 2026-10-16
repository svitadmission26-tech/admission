# SVIT Admission Management ERP

> **Target stack:** React + Vite (frontend), Node.js + npm + Express (API), Supabase (PostgreSQL, Auth, Storage). **Migration specification only:** the existing Phase 1–8 source is Laravel/PHP + MySQL. Uploading the old ZIP to GitHub or changing `.env` will **not** convert it into a working Node/Supabase app.

## Objective
Single-college admission ERP for SVIT: admin, students, master records, dynamic application forms, document verification, fees, merit and reporting. Do not use real applicant data until security, integration, and institutional acceptance tests pass.

## Suggested repository
```text
svit-admission-erp/
  README.md
  docs/PHASE_01.md ... PHASE_08.md
  docs/MIGRATION_PLAN.md
  frontend/             # React + Vite (existing UI requires API refactor)
  server/               # NEW Node.js + Express API (to be implemented)
    src/routes/
    src/middleware/
    src/services/
  supabase/
    migrations/         # NEW PostgreSQL SQL migrations (to be implemented)
    seed.sql            # sanitized demo data only
  .env.example
  .gitignore
```

## Prerequisites
- Node.js current supported LTS, npm, Git and VS Code
- A Supabase project (save project URL and **publishable/anon** key)
- Separate dev/staging/production projects and backups

## Getting started — after the Node migration is implemented
```bash
git clone <YOUR_REPOSITORY_URL>
cd svit-admission-erp
cd frontend
npm install
npm run dev
# separate terminal, once server/package.json exists:
cd ../server
npm install
npm run dev
```
These commands **will not run a complete ERP from the old ZIP**: `server/` and SQL migrations must first be implemented. Existing `frontend/` is a React/Vite prototype; its Laravel API calls need replacement.

## Configuration
Create `frontend/.env.local`:
```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
VITE_API_BASE_URL=http://localhost:3001/api
```
Create `server/.env` (server only):
```dotenv
PORT=3001
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
SUPABASE_SECRET_KEY=SERVER_ONLY_SECRET
CORS_ORIGIN=http://localhost:5173
```
Never commit `.env`, secret/service-role keys, personal student data, or payment credentials. Do **not** put secret/service-role keys in `VITE_` variables. Add `.env*` to `.gitignore` except `.env.example`.

## Recommended architecture
Browser → React/Vite → Node/Express API → Supabase PostgreSQL/Storage. Use Supabase Auth for student/admin sessions; API verifies JWT and independently checks roles/permissions. Use Row Level Security (RLS) on every exposed table; student can only access own applications/documents/receipts, while privileged actions are checked server-side. Private document bucket with short-lived signed downloads; no public student uploads. Apply validation, rate limiting, audit logs, backup/restore tests and HTTPS. Store money in integer paise, not floats. Payments require provider webhook signature validation, idempotency and reconciliation.

## Migration sequence
1. Preserve Phase 8 as a **legacy reference** in a separate branch or folder; do not deploy PHP code as Node.
2. Map MySQL migrations and Eloquent relations to PostgreSQL schemas; review constraints and row ownership.
3. Implement Supabase Auth + role mapping + RLS and private Storage.
4. Port Laravel controller logic into Express routes/services with explicit input validation and tests.
5. Update React API clients, auth flow and forms to the new endpoints.
6. Import **sanitized** test data first; run integration, security and user-acceptance tests.
7. Deploy only after SVIT approves admission/fee/merit rules.

## Phase documentation
See `docs/PHASE_01.md` through `docs/PHASE_08.md` and `docs/MIGRATION_PLAN.md`. These are implementation specifications, not a claim that the Node/Supabase migration is complete.

## Current status
- Existing ZIP: PHP/Laravel + MySQL source overlay with React/Vite frontend.
- This package: GitHub-ready documentation for a Node.js/npm/Supabase rewrite.
- Node API, PostgreSQL migrations, RLS policies, full integration testing and live deployment: **not yet implemented**.
