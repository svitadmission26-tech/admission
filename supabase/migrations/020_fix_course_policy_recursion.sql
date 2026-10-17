create or replace function public.course_has_published_admission_form(
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admission_forms form
    where form.course_id = p_course_id
      and form.status = 'published'
      and form.enabled_for_students is true
  );
$$;

revoke all on function public.course_has_published_admission_form(uuid) from public;
grant execute on function public.course_has_published_admission_form(uuid) to authenticated;

drop policy if exists admission_course_catalog_read on public.courses;
create policy admission_course_catalog_read on public.courses
for select to authenticated
using (
  active is true
  and public.course_has_published_admission_form(courses.id)
  and (
    not exists (
      select 1 from public.staff_members staff
      where staff.user_id = auth.uid()
    )
    or (
      public.has_permission('applications.read')
      and public.staff_scope_allows(
        courses.college_id, courses.department_id, courses.id
      )
    )
  )
);
