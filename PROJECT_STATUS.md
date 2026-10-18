# SVIT ERP source handoff

Existing React/Vite/Supabase admission ERP plus College Timing screen and SQL migration 023.

## Verified
- Entry point and component exports for timetable, leave, attendance and college timing exist.
- Migrations 001–023 and example environment files exist.

## Not verified / incomplete
- npm ci --offline failed: zip-stream 4.1.1 missing from local cache; online npm ci failed with npm Exit handler never called.
- No successful build, browser E2E test, live Supabase migration test, or security audit.
- College Timing CRUD is present, but timetable save does not enforce configured college hours automatically.

## Setup
1. Run npm ci on a network-enabled machine.
2. Configure .env.example and server/.env.example with your own credentials, never commit secrets.
3. Apply migrations 001–023 in order on a test Supabase instance.
4. Run npm run build and npm run dev.
5. Test roles, admissions/cancellations, capacity, fees/receipts, timing, timetable, leave/proxy, attendance and reports.

Do not deploy as production-ready until these checks and integration are completed.
