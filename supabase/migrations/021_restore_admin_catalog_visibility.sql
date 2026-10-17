drop policy if exists admin_universities_read on public.universities;
create policy admin_universities_read on public.universities
for select to authenticated
using (public.is_admin());

drop policy if exists admin_colleges_read on public.colleges;
create policy admin_colleges_read on public.colleges
for select to authenticated
using (public.is_admin());

drop policy if exists admin_courses_read on public.courses;
create policy admin_courses_read on public.courses
for select to authenticated
using (public.is_admin());

drop policy if exists admin_branches_read on public.branches;
create policy admin_branches_read on public.branches
for select to authenticated
using (public.is_admin());
