-- Migration 051: marks report read access
-- The marks report policy calls the shared permission helper, but a database
-- that is still mid-migration can legitimately be missing that function. We
-- install a safe fallback and keep going so the table does not crash with an
-- HTTP 500 when the report is queried.
do $$
begin
  if to_regprocedure('public.has_permission(text)') is null then
    begin
      create or replace function public.has_permission(p_permission text)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $$
        select public.is_admin() or exists (
          select 1
          from public.staff_members s
          join public.role_permissions rp on rp.role_code = s.role_code
          where s.user_id = auth.uid()
            and s.active
            and rp.permission = p_permission
        );
      $$;
    exception
      when others then
        raise warning 'the fallback permission helper could not be created: %', sqlerrm;
    end;
  end if;
end;
$$;

drop policy if exists student_exam_marks_report_read on public.student_exam_marks;
create policy student_exam_marks_report_read on public.student_exam_marks
  for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('academics.read')
    or public.has_permission('admissions.read')
    or public.has_permission('inquiries.read')
  );
