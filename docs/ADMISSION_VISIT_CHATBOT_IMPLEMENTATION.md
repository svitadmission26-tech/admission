# Admission Visit + Chatbot: implementation handoff

Migration 026 adds the database foundation, NOT a finished deployed feature. Apply on a test Supabase project after migrations 001–025. Never put service-role keys in Vite environment variables or the browser.

## Next integration tasks
1. Build authenticated admin APIs for FAQ CRUD, college hours, lunch, holiday and capacity settings; authorize college scope, validate inputs and audit changes.
2. Public FAQ endpoint should return enabled, college/department-scoped questions and answers only. Rate-limit requests; never expose private student records.
3. Public inquiry flow should capture student contact and contact consent, create inquiry, then invoke `reserve_admission_visit` from the trusted server. Show a fresh slot count and handle the `Slot full` error by requesting another selection. Do not assume the previewed capacity is guaranteed until reservation succeeds.
4. Faculty dashboard: show assigned department visits, check in, mark absent, add follow-up remarks, reschedule by cancelling prior booked visit and atomically reserving a new slot. Apply role and college authorization.
5. Notification providers: configure Meta WhatsApp Cloud API, SMS gateway and email server-side, with encrypted credentials, approved templates, consent, retry queue, delivery logs and idempotency. Never send messages directly from browser code. Add scheduled reminders and missed-visit follow-up with opt-out controls.
6. Tests: simultaneous last-seat booking, cancelled seat reopens, holidays, Sundays, lunch overlap, past date/time, multiple colleges, faculty access boundaries, duplicate inquiry booking, API errors, and consent.

Current migration uses college-wide capacity, a Sunday closure and local timezone. Extend it for configurable weekdays and department-specific capacity if required. The database foundation intentionally does not assume existing inquiry table's ID is the same as this appointment inquiry UUID: verify and add the correct foreign key after mapping the live schema.
