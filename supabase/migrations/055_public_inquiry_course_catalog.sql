-- Migration 055: public inquiry course and branch catalog
-- Public inquiry forms need to read active course and branch options before a
-- visitor is signed in. Keep anonymous access limited to active catalog rows.

grant select (id, name, code, active) on public.courses to anon;
grant select (id, course_id, name, intake, active) on public.branches to anon;

drop policy if exists public_inquiry_courses_read on public.courses;
create policy public_inquiry_courses_read on public.courses
  for select
  to anon
  using (active is true);

drop policy if exists public_inquiry_branches_read on public.branches;
create policy public_inquiry_branches_read on public.branches
  for select
  to anon
  using (active is true);
