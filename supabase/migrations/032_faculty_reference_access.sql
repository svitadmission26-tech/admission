-- Migration 032: Faculty college / course / branch reference access
-- The Faculty screen shows the linked College, Course and Branch names and
-- offers them as cascading choices. To resolve those names the signed-in staff
-- account has to be able to read the catalogue rows, but the read policies
-- created with migration 019 only opened colleges and courses to the
-- admissions permissions, and branches to the admissions and intake
-- permissions. A Department Head with academics.read could therefore read the
-- faculty rows but saw empty College, Course and Branch columns, and the
-- cascading selectors had nothing to offer.
-- This migration reopens the catalogue to the academics and master-data
-- permissions, keeping the data-scope restriction in place.
-- Idempotent and safe to re-run. Apply after migration 031.

-- ---------------------------------------------------------------------------
-- 1. Colleges
-- ---------------------------------------------------------------------------
drop policy if exists staff_colleges_scoped_read on public.colleges;
create policy staff_colleges_scoped_read on public.colleges
for select to authenticated
using (
  (public.has_permission('applications.read')
    or public.has_permission('academics.read')
    or public.has_permission('academics.manage')
    or public.has_permission('admissions.read')
    or public.has_permission('intakes.manage')
    or public.has_permission('masters.manage'))
  and (
    public.staff_scope_allows(colleges.id, null, null)
    or exists (
      select 1 from public.courses course
      where course.college_id = colleges.id
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    )
  )
);

-- ---------------------------------------------------------------------------
-- 2. Courses
-- ---------------------------------------------------------------------------
drop policy if exists staff_courses_scoped_read on public.courses;
create policy staff_courses_scoped_read on public.courses
for select to authenticated
using (
  (public.has_permission('applications.read')
    or public.has_permission('academics.read')
    or public.has_permission('academics.manage')
    or public.has_permission('admissions.read')
    or public.has_permission('intakes.manage')
    or public.has_permission('masters.manage'))
  and public.staff_scope_allows(
    courses.college_id, courses.department_id, courses.id
  )
);

-- ---------------------------------------------------------------------------
-- 3. Branches
-- ---------------------------------------------------------------------------
drop policy if exists staff_branches_scoped_read on public.branches;
create policy staff_branches_scoped_read on public.branches
for select to authenticated
using (
  (public.has_permission('admissions.read')
    or public.has_permission('admissions.prepare')
    or public.has_permission('admissions.manage')
    or public.has_permission('intakes.manage')
    or public.has_permission('academics.read')
    or public.has_permission('academics.manage')
    or public.has_permission('masters.manage'))
  and exists (
    select 1 from public.courses course
    where course.id = branches.course_id
      and public.staff_scope_allows(
        coalesce(branches.college_id, course.college_id),
        course.department_id, branches.course_id
      )
  )
);

-- ---------------------------------------------------------------------------
-- 4. A branch must belong to the course recorded on the same faculty row
-- ---------------------------------------------------------------------------
create or replace function public.guard_faculty_reference_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.course_id is not null and new.branch_id is not null then
    if not exists (
      select 1 from public.branches branch
      where branch.id = new.branch_id
        and branch.course_id = new.course_id
    ) then
      raise exception 'The selected branch does not belong to the selected course';
    end if;
  end if;
  if new.college_id is not null and new.course_id is not null then
    if not exists (
      select 1 from public.courses course
      where course.id = new.course_id
        and (course.college_id is null or course.college_id = new.college_id)
    ) then
      raise exception 'The selected course does not belong to the selected college';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists faculty_reference_consistency_guard on public.faculty;
create trigger faculty_reference_consistency_guard
before insert or update on public.faculty
for each row execute function public.guard_faculty_reference_consistency();
