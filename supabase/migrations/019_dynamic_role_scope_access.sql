alter table public.staff_members
  add column if not exists scope_all boolean not null default false,
  add column if not exists college_scope_ids uuid[] not null default '{}'::uuid[],
  add column if not exists department_scope_ids uuid[] not null default '{}'::uuid[],
  add column if not exists course_scope_ids uuid[] not null default '{}'::uuid[];

alter table public.courses
  add column if not exists department_id uuid references public.departments (id);

alter table public.inquiries
  add column if not exists course_id uuid references public.courses (id);

alter table public.inquiry_admissions
  add column if not exists course_id uuid references public.courses (id);

create index if not exists inquiries_course_id_idx
  on public.inquiries (course_id);

create index if not exists inquiry_admissions_course_id_idx
  on public.inquiry_admissions (course_id);

update public.inquiries inquiry
set course_id = (
  select course.id
  from public.courses course
  where lower(course.name) = lower(inquiry.course_interest)
  limit 1
)
where inquiry.course_id is null
  and (
    select count(*)
    from public.courses course
    where lower(course.name) = lower(inquiry.course_interest)
  ) = 1;

update public.inquiry_admissions admission
set course_id = coalesce(
  (select branch.course_id
   from public.admission_intakes intake
   join public.branches branch on branch.id = intake.branch_id
   where intake.id = admission.intake_id),
  (select inquiry.course_id
   from public.inquiries inquiry
   where inquiry.id = admission.inquiry_id),
  (select course.id
   from public.courses course
   where lower(course.name) = lower(admission.course_name)
   and (
     select count(*)
     from public.courses matches
     where lower(matches.name) = lower(admission.course_name)
   ) = 1
   limit 1)
)
where admission.course_id is null;

update public.staff_members
set department_scope_ids = array[department_id]
where role_code = 'department_head'
  and department_id is not null
  and not scope_all
  and cardinality(college_scope_ids) = 0
  and cardinality(department_scope_ids) = 0
  and cardinality(course_scope_ids) = 0;

update public.staff_members
set scope_all = true
where not scope_all
  and cardinality(college_scope_ids) = 0
  and cardinality(department_scope_ids) = 0
  and cardinality(course_scope_ids) = 0;

insert into public.role_permissions (role_code, permission)
select defaults.role_code, 'page:' || page_name
from (values
  ('authority', array[
    'Dashboard', 'Inquiries', 'Final Admissions', 'Faculty', 'Subjects',
    'Timetable Management', 'Reports'
  ]::text[]),
  ('data_entry', array[
    'Dashboard', 'Inquiries', 'Final Admissions', 'Faculty', 'Subjects',
    'Timetable Management'
  ]::text[]),
  ('principal', array[
    'Dashboard', 'Inquiries', 'Final Admissions', 'Faculty', 'Subjects',
    'Timetable Management', 'Reports'
  ]::text[]),
  ('department_head', array[
    'Dashboard', 'Inquiries', 'Final Admissions', 'Student Management',
    'Faculty', 'Subjects', 'Timetable Management', 'Leave Management',
    'Attendance', 'Reports'
  ]::text[]),
  ('fees_collection', array[
    'Dashboard', 'Fee Assignments', 'Payments', 'Reports'
  ]::text[]),
  ('id_card', array['Dashboard', 'Applications', 'ID Cards']::text[]),
  ('faculty', array[
    'Dashboard', 'Faculty', 'Subjects', 'Timetable Management',
    'Leave Management', 'Attendance'
  ]::text[])
) as defaults(role_code, pages)
cross join lateral unnest(defaults.pages) as pages(page_name)
on conflict (role_code, permission) do nothing;

insert into public.role_permissions (role_code, permission)
values
  ('admin', 'intakes.manage'),
  ('authority', 'intakes.manage'),
  ('admin', 'reports.manage')
on conflict (role_code, permission) do nothing;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1
    from public.staff_members staff
    join public.role_permissions grant_row
      on grant_row.role_code = staff.role_code
    where staff.user_id = auth.uid()
      and staff.active
      and grant_row.permission = p_permission
      and case p_permission
        when 'users.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Manage Users'
        )
        when 'masters.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Universities', 'page:Colleges', 'page:Courses',
              'page:Branches', 'page:Faculty', 'page:Subjects',
              'page:Student Management', 'page:Fee Structures'
            )
        )
        when 'applications.read' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Applications', 'page:Documents', 'page:Final Admissions',
              'page:Reports', 'page:Report Builder'
            )
        )
        when 'applications.create' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Applications', 'page:Final Admissions'
            )
        )
        when 'applications.review' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Applications', 'page:Final Admissions'
            )
        )
        when 'fees.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Fee Structures', 'page:Fee Assignments', 'page:Payments',
              'page:Reports', 'page:Report Builder'
            )
        )
        when 'id_cards.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:ID Cards'
        )
        when 'merit.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Merit Entries', 'page:Reports', 'page:Report Builder'
            )
        )
        when 'merit.read' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Merit Entries', 'page:Reports', 'page:Report Builder'
            )
        )
        when 'reports.read' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in ('page:Reports', 'page:Report Builder')
        )
        when 'reports.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Report Builder'
        )
        when 'admissions.read' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Final Admissions', 'page:Reports', 'page:Report Builder'
            )
        )
        when 'admissions.prepare' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Final Admissions'
        )
        when 'admissions.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Final Admissions'
        )
        when 'intakes.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Final Admissions'
        )
        when 'inquiries.read' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Inquiries', 'page:Reports', 'page:Report Builder'
            )
        )
        when 'inquiries.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Inquiries'
        )
        when 'academics.read' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Faculty', 'page:Student Management', 'page:Subjects',
              'page:Timetable Management', 'page:Leave Management',
              'page:Attendance', 'page:Reports', 'page:Report Builder'
            )
        )
        when 'academics.manage' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission in (
              'page:Faculty', 'page:Student Management', 'page:Subjects',
              'page:Timetable Management', 'page:Leave Management',
              'page:Attendance'
            )
        )
        when 'attendance.record' then exists (
          select 1 from public.role_permissions page
          where page.role_code = staff.role_code
            and page.permission = 'page:Attendance'
        )
        else true
      end
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.staff_scope_allows(
  p_college_id uuid,
  p_department_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1
    from public.staff_members staff
    where staff.user_id = auth.uid()
      and staff.active
      and (
        staff.scope_all
        or (
          cardinality(staff.college_scope_ids)
            + cardinality(staff.department_scope_ids)
            + cardinality(staff.course_scope_ids) > 0
          and (
            cardinality(staff.college_scope_ids) = 0
            or p_college_id = any(staff.college_scope_ids)
          )
          and (
            cardinality(staff.department_scope_ids) = 0
            or p_department_id = any(staff.department_scope_ids)
          )
          and (
            cardinality(staff.course_scope_ids) = 0
            or p_course_id = any(staff.course_scope_ids)
          )
        )
      )
  );

$$;

revoke all on function public.staff_scope_allows(uuid, uuid, uuid) from public;
grant execute on function public.staff_scope_allows(uuid, uuid, uuid) to authenticated;

create or replace function public.staff_course_scope_allows(p_course text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.staff_scope_allows(null, null, null)
    or exists (
      select 1 from public.courses course
      where lower(course.name) = lower(coalesce(p_course, ''))
        and (
          select count(*)
          from public.courses matches
          where lower(matches.name) = lower(coalesce(p_course, ''))
        ) = 1
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    );
$$;

create or replace function public.staff_department_scope_allows(p_department text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.staff_scope_allows(null, null, null)
    or exists (
      select 1 from public.departments department
      where lower(department.name) = lower(coalesce(p_department, ''))
        and (
          select count(*)
          from public.departments matches
          where lower(matches.name) = lower(coalesce(p_department, ''))
        ) = 1
        and public.staff_scope_allows(null, department.id, null)
    );
$$;

revoke all on function public.staff_course_scope_allows(text) from public;
revoke all on function public.staff_department_scope_allows(text) from public;
grant execute on function public.staff_course_scope_allows(text) to authenticated;
grant execute on function public.staff_department_scope_allows(text) to authenticated;

create or replace function public.get_my_staff_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'role_code', staff.role_code,
    'permissions', coalesce((
      select jsonb_agg(permission.permission order by permission.permission)
      from public.role_permissions permission
      where permission.role_code = staff.role_code
    ), '[]'::jsonb),
    'scope_all', staff.scope_all,
    'college_scope_ids', to_jsonb(staff.college_scope_ids),
    'department_scope_ids', to_jsonb(staff.department_scope_ids),
    'course_scope_ids', to_jsonb(staff.course_scope_ids),
    'faculty_id', staff.faculty_id
  )
  from public.staff_members staff
  where staff.user_id = auth.uid()
    and staff.active
  union all
  select jsonb_build_object(
    'role_code', null,
    'permissions', '[]'::jsonb,
    'scope_all', false,
    'college_scope_ids', '[]'::jsonb,
    'department_scope_ids', '[]'::jsonb,
    'course_scope_ids', '[]'::jsonb,
    'faculty_id', null
  )
  where not public.is_admin()
    and not exists (
      select 1 from public.staff_members staff
      where staff.user_id = auth.uid() and staff.active
    )
  limit 1;
$$;

revoke all on function public.get_my_staff_access() from public;
grant execute on function public.get_my_staff_access() to authenticated;

create or replace function public.admin_save_role_access(
  p_role_code text,
  p_label text,
  p_pages text[],
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_role_code is null or p_role_code !~ '^[a-z][a-z0-9_]{1,39}$'
    or p_role_code = 'admin' then
    raise exception 'Role code must contain 2 to 40 lowercase letters, numbers, or underscores and cannot be admin';
  end if;
  if nullif(trim(coalesce(p_label, '')), '') is null then
    raise exception 'Role name is required';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_permissions, '{}'::text[])) as items(permission)
    where items.permission not in (
      'users.manage', 'masters.manage', 'applications.read',
      'applications.create', 'applications.review', 'fees.manage',
      'id_cards.manage', 'merit.manage', 'merit.read', 'reports.read',
      'reports.manage', 'admissions.read', 'admissions.prepare',
      'admissions.manage', 'intakes.manage', 'inquiries.read',
      'inquiries.manage', 'academics.read', 'academics.manage',
      'attendance.record'
    )
  ) then
    raise exception 'One or more permissions are invalid';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_pages, '{}'::text[])) as items(page)
    where items.page not in (
      'Dashboard', 'Manage Users', 'Universities', 'Colleges', 'Courses',
      'Branches', 'Academic Calendar', 'Admission Sequences',
      'Receipt Sequences', 'Form Types', 'Student Profile Schema',
      'Dynamic Forms', 'Fee Structures', 'Fee Schemes', 'Payment Gateways',
      'Merit Formulas', 'Calculate Merit', 'Inquiry Forms', 'Report Builder',
      'Documentation', 'Config Guide', 'Bus Seva QR Config', 'Faculty',
      'Student Management', 'Subjects', 'Timetable Management',
      'Leave Management', 'Attendance', 'Inquiries', 'ID Cards',
      'Final Admissions', 'Applications', 'Documents',
      'Manage Admission Forms', 'Fee Assignments', 'Payments',
      'Merit Entries', 'Reports', 'Workbook Data'
    )
  ) then
    raise exception 'One or more pages are invalid';
  end if;

  insert into public.staff_roles (code, label)
  values (p_role_code, trim(p_label))
  on conflict (code) do update set label = excluded.label;

  delete from public.role_permissions
  where role_code = p_role_code;
  insert into public.role_permissions (role_code, permission)
  select p_role_code, 'page:' || page
  from unnest(coalesce(p_pages, '{}'::text[])) as pages(page)
  union
  select p_role_code, permission
  from unnest(coalesce(p_permissions, '{}'::text[])) as items(permission);
end;
$$;

revoke all on function public.admin_save_role_access(text, text, text[], text[]) from public;
grant execute on function public.admin_save_role_access(text, text, text[], text[]) to authenticated;

create or replace function public.link_inquiry_course()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    select course.id
    into new.course_id
    from public.courses course
    where lower(course.name) = lower(new.course_interest)
      and (
        select count(*)
        from public.courses matches
        where lower(matches.name) = lower(new.course_interest)
      ) = 1
    limit 1;
  elsif new.course_id is null
    or new.course_interest is distinct from old.course_interest then
    select course.id
    into new.course_id
    from public.courses course
    where lower(course.name) = lower(new.course_interest)
      and (
        select count(*)
        from public.courses matches
        where lower(matches.name) = lower(new.course_interest)
      ) = 1
    limit 1;
  end if;
  return new;
end;
$$;

create or replace function public.link_admission_course()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.intake_id is not null then
    select branch.course_id
    into new.course_id
    from public.admission_intakes intake
    join public.branches branch on branch.id = intake.branch_id
    where intake.id = new.intake_id;
  elsif tg_op = 'INSERT' then
    select inquiry.course_id
    into new.course_id
    from public.inquiries inquiry
    where inquiry.id = new.inquiry_id;
    if new.course_id is null then
      select course.id
      into new.course_id
      from public.courses course
      where lower(course.name) = lower(new.course_name)
        and (
          select count(*)
          from public.courses matches
          where lower(matches.name) = lower(new.course_name)
        ) = 1
      limit 1;
    end if;
  elsif new.course_id is null
    or new.course_name is distinct from old.course_name then
    select inquiry.course_id
    into new.course_id
    from public.inquiries inquiry
    where inquiry.id = new.inquiry_id;
    if new.course_id is null then
      select course.id
      into new.course_id
      from public.courses course
      where lower(course.name) = lower(new.course_name)
        and (
          select count(*)
          from public.courses matches
          where lower(matches.name) = lower(new.course_name)
        ) = 1
      limit 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.link_inquiry_course() from public;
revoke all on function public.link_admission_course() from public;

drop trigger if exists a_link_inquiry_course on public.inquiries;
create trigger a_link_inquiry_course
before insert or update on public.inquiries
for each row execute function public.link_inquiry_course();

drop trigger if exists a_link_admission_course on public.inquiry_admissions;
create trigger a_link_admission_course
before insert or update on public.inquiry_admissions
for each row execute function public.link_admission_course();

create or replace function public.guard_staff_scoped_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_college_id uuid;
  v_course_id uuid;
  v_department_id uuid;
  v_old_college_id uuid;
  v_old_course_id uuid;
  v_old_department_id uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if exists (
    select 1 from public.staff_members staff
    where staff.user_id = auth.uid() and not staff.active
  ) then
    raise exception 'Staff account is disabled';
  end if;
  if not exists (
    select 1 from public.staff_members staff
    where staff.user_id = auth.uid() and staff.active
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'inquiries' then
      select course.id, course.college_id, course.department_id
      into v_old_course_id, v_old_college_id, v_old_department_id
      from public.courses course
      where course.id = old.course_id;
    elsif tg_table_name = 'inquiry_admissions' then
      if old.intake_id is not null then
        select coalesce(branch.college_id, course.college_id),
          branch.course_id, course.department_id
        into v_old_college_id, v_old_course_id, v_old_department_id
        from public.admission_intakes intake
        left join public.branches branch on branch.id = intake.branch_id
        left join public.courses course on course.id = branch.course_id
        where intake.id = old.intake_id;
      else
        select course.id, course.college_id, course.department_id
        into v_old_course_id, v_old_college_id, v_old_department_id
        from public.courses course
        where course.id = old.course_id;
      end if;
    elsif tg_table_name = 'applications' then
      select course.id, course.college_id,
        coalesce(old.department_id, course.department_id)
      into v_old_course_id, v_old_college_id, v_old_department_id
      from public.admission_forms form
      join public.courses course on course.id = form.course_id
      where form.id = old.form_id;
    end if;
    if not public.staff_scope_allows(
      v_old_college_id, v_old_department_id, v_old_course_id
    ) then
      raise exception 'Record is outside your assigned college, department, or course scope';
    end if;
  end if;

  if tg_table_name = 'inquiries' then
    select course.id, course.college_id
    into v_course_id, v_college_id
    from public.courses course
    where course.id = new.course_id;
    select course.department_id into v_department_id
    from public.courses course where course.id = new.course_id;
  elsif tg_table_name = 'inquiry_admissions' then
    v_department_id := null;
    if new.intake_id is not null then
      select coalesce(branch.college_id, course.college_id),
        branch.course_id, course.department_id
      into v_college_id, v_course_id, v_department_id
      from public.admission_intakes intake
      left join public.branches branch on branch.id = intake.branch_id
      left join public.courses course on course.id = branch.course_id
      where intake.id = new.intake_id;
    else
      select course.id, course.college_id, course.department_id
      into v_course_id, v_college_id, v_department_id
      from public.courses course
      where course.id = new.course_id;
    end if;
  elsif tg_table_name = 'applications' then
    select course.id, course.college_id,
      coalesce(new.department_id, course.department_id)
    into v_course_id, v_college_id, v_department_id
    from public.admission_forms form
    join public.courses course on course.id = form.course_id
    where form.id = new.form_id;
  else
    return new;
  end if;

  if not public.staff_scope_allows(v_college_id, v_department_id, v_course_id) then
    raise exception 'Record is outside your assigned college, department, or course scope';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_staff_scoped_write() from public;

drop trigger if exists inquiries_scope_guard on public.inquiries;
create trigger inquiries_scope_guard
before insert or update on public.inquiries
for each row execute function public.guard_staff_scoped_write();

drop trigger if exists inquiry_admissions_scope_guard on public.inquiry_admissions;
create trigger inquiry_admissions_scope_guard
before insert or update on public.inquiry_admissions
for each row execute function public.guard_staff_scoped_write();

drop trigger if exists applications_scope_guard on public.applications;
create trigger applications_scope_guard
before insert or update on public.applications
for each row execute function public.guard_staff_scoped_write();

drop policy if exists staff_colleges_scoped_read on public.colleges;
create policy staff_colleges_scoped_read on public.colleges
for select to authenticated
using (
  (public.has_permission('applications.read')
    or public.has_permission('academics.read')
    or public.has_permission('admissions.read')
    or public.has_permission('intakes.manage'))
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

drop policy if exists published_forms_read on public.admission_forms;
create policy published_forms_read on public.admission_forms
for select to authenticated
using (
  status = 'published'
  and (
    not exists (
      select 1 from public.staff_members staff
      where staff.user_id = auth.uid()
    )
    or (
      public.has_permission('applications.read')
      and exists (
        select 1 from public.courses course
        where course.id = admission_forms.course_id
          and public.staff_scope_allows(
            course.college_id, course.department_id, course.id
          )
      )
    )
  )
);

drop policy if exists admission_branch_catalog_read on public.branches;
create policy admission_branch_catalog_read on public.branches
for select to authenticated
using (
  active is true
  and (
    not exists (
      select 1 from public.staff_members staff
      where staff.user_id = auth.uid()
    )
    or (
      (
        public.has_permission('admissions.read')
        or public.has_permission('admissions.prepare')
        or public.has_permission('admissions.manage')
        or public.has_permission('intakes.manage')
      )
      and exists (
        select 1 from public.courses course
        where course.id = branches.course_id
          and public.staff_scope_allows(
            coalesce(branches.college_id, course.college_id),
            course.department_id, branches.course_id
          )
      )
    )
  )
);

drop policy if exists followups_staff_read on public.inquiry_followups;
create policy followups_staff_read on public.inquiry_followups
for select to authenticated
using (
  (
    public.has_permission('inquiries.manage')
    or public.has_permission('inquiries.read')
  )
  and exists (
    select 1 from public.inquiries inquiry
    where inquiry.id = inquiry_followups.inquiry_id
  )
);

drop policy if exists staff_colleges_scoped_manage on public.colleges;
create policy staff_colleges_scoped_manage on public.colleges
for all to authenticated
using (
  public.has_permission('masters.manage')
  and public.staff_scope_allows(colleges.id, null, null)
)
with check (
  public.has_permission('masters.manage')
  and public.staff_scope_allows(colleges.id, null, null)
);

drop policy if exists staff_courses_scoped_read on public.courses;
create policy staff_courses_scoped_read on public.courses
for select to authenticated
using (
  (public.has_permission('applications.read')
    or public.has_permission('academics.read')
    or public.has_permission('admissions.read')
    or public.has_permission('intakes.manage'))
  and public.staff_scope_allows(
    courses.college_id, courses.department_id, courses.id
  )
);

drop policy if exists staff_courses_scoped_manage on public.courses;
create policy staff_courses_scoped_manage on public.courses
for all to authenticated
using (
  public.has_permission('masters.manage')
  and public.staff_scope_allows(
    courses.college_id, courses.department_id, courses.id
  )
)
with check (
  public.has_permission('masters.manage')
  and public.staff_scope_allows(
    courses.college_id, courses.department_id, courses.id
  )
);

drop policy if exists staff_branches_scoped_read on public.branches;
create policy staff_branches_scoped_read on public.branches
for select to authenticated
using (
  (public.has_permission('admissions.read')
    or public.has_permission('admissions.prepare')
    or public.has_permission('admissions.manage')
    or public.has_permission('intakes.manage'))
  and exists (
    select 1 from public.courses course
    where course.id = branches.course_id
      and public.staff_scope_allows(
        coalesce(branches.college_id, course.college_id),
        course.department_id, branches.course_id
      )
  )
);

drop policy if exists staff_branches_scoped_manage on public.branches;
create policy staff_branches_scoped_manage on public.branches
for all to authenticated
using (
  public.has_permission('masters.manage')
  and exists (
    select 1 from public.courses course
    where course.id = branches.course_id
      and public.staff_scope_allows(
        coalesce(branches.college_id, course.college_id),
        course.department_id, branches.course_id
      )
  )
)
with check (
  public.has_permission('masters.manage')
  and exists (
    select 1 from public.courses course
    where course.id = branches.course_id
      and public.staff_scope_allows(
        coalesce(branches.college_id, course.college_id),
        course.department_id, branches.course_id
      )
  )
);

drop policy if exists intakes_staff_read on public.admission_intakes;
create policy intakes_staff_read on public.admission_intakes
for select to authenticated
using (
  (
    public.has_permission('admissions.read')
    or public.has_permission('admissions.prepare')
    or public.has_permission('admissions.manage')
    or public.has_permission('intakes.manage')
  )
  and (
    public.staff_scope_allows(null, null, null)
    and public.is_admin()
    or exists (
      select 1
      from public.branches branch
      join public.courses course on course.id = branch.course_id
      where branch.id = admission_intakes.branch_id
        and public.staff_scope_allows(
          coalesce(branch.college_id, course.college_id),
          course.department_id, branch.course_id
        )
    )
  )
);

drop policy if exists intakes_staff_manage on public.admission_intakes;
create policy intakes_staff_manage on public.admission_intakes
for all to authenticated
using (
  public.has_permission('intakes.manage')
  and exists (
    select 1 from public.branches branch
    join public.courses course on course.id = branch.course_id
    where branch.id = admission_intakes.branch_id
      and public.staff_scope_allows(
        coalesce(branch.college_id, course.college_id),
        course.department_id, branch.course_id
      )
  )
)
with check (
  public.has_permission('intakes.manage')
  and exists (
    select 1 from public.branches branch
    join public.courses course on course.id = branch.course_id
    where branch.id = admission_intakes.branch_id
      and public.staff_scope_allows(
        coalesce(branch.college_id, course.college_id),
        course.department_id, branch.course_id
      )
  )
);

drop policy if exists inquiry_staff_read on public.inquiries;
create policy inquiry_staff_read on public.inquiries
for select to authenticated
using (
  (
    public.has_permission('inquiries.manage')
    or public.has_permission('inquiries.read')
  )
  and (
    public.staff_scope_allows(null, null, null)
    and public.is_admin()
    or exists (
      select 1 from public.courses course
      where course.id = inquiries.course_id
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    )
  )
);

drop policy if exists inquiry_staff_update on public.inquiries;
create policy inquiry_staff_update on public.inquiries
for update to authenticated
using (
  public.has_permission('inquiries.manage')
  and (
    public.is_admin()
    or exists (
      select 1 from public.courses course
      where course.id = inquiries.course_id
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    )
  )
)
with check (
  public.has_permission('inquiries.manage')
  and (
    public.is_admin()
    or exists (
      select 1 from public.courses course
      where course.id = inquiries.course_id
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    )
  )
);

drop policy if exists admission_staff_read on public.inquiry_admissions;
create policy admission_staff_read on public.inquiry_admissions
for select to authenticated
using (
  (
    public.has_permission('admissions.read')
    or public.has_permission('admissions.prepare')
    or public.has_permission('admissions.manage')
  )
  and (
    public.is_admin()
    or exists (
      select 1
      from public.admission_intakes intake
      join public.branches branch on branch.id = intake.branch_id
      join public.courses course on course.id = branch.course_id
      where intake.id = inquiry_admissions.intake_id
        and public.staff_scope_allows(
          coalesce(branch.college_id, course.college_id),
          course.department_id, branch.course_id
        )
    )
    or exists (
      select 1
      from public.courses course
      where course.id = inquiry_admissions.course_id
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    )
  )
);

drop policy if exists staff_applications_read on public.applications;
drop policy if exists decision_events_staff_read on public.admission_decision_events;
create policy decision_events_staff_read on public.admission_decision_events
for select to authenticated
using (
  (
    public.has_permission('admissions.read')
    or public.has_permission('admissions.prepare')
    or public.has_permission('admissions.manage')
  )
  and exists (
    select 1 from public.inquiry_admissions admission
    where admission.id = admission_decision_events.admission_id
  )
);

drop policy if exists staff_applications_scoped_read on public.applications;
create policy staff_applications_scoped_read on public.applications
for select to authenticated
using (
  public.has_permission('applications.read')
  and exists (
    select 1
    from public.admission_forms form
    where form.id = applications.form_id
      and (
        public.is_admin()
        or public.staff_scope_allows(
          (select course.college_id from public.courses course
            where course.id = form.course_id),
          coalesce(applications.department_id, (
            select course.department_id from public.courses course
            where course.id = form.course_id
          )),
          form.course_id
        )
      )
  )
);

drop policy if exists staff_documents_scoped_read on public.documents;
create policy staff_documents_scoped_read on public.documents
for select to authenticated
using (
  public.has_permission('applications.read')
  and exists (
    select 1
    from public.applications application
    join public.admission_forms form on form.id = application.form_id
    join public.courses course on course.id = form.course_id
    where application.id = documents.application_id
      and public.staff_scope_allows(
        course.college_id,
        coalesce(application.department_id, course.department_id),
        course.id
      )
  )
);

drop policy if exists staff_student_documents_scoped_read on storage.objects;
create policy staff_student_documents_scoped_read on storage.objects
for select to authenticated
using (
  bucket_id = 'student-documents'
  and exists (
    select 1 from public.documents document
    where document.storage_path = storage.objects.name
  )
);

drop policy if exists staff_merit_schemes_scoped_read on public.merit_schemes;
create policy staff_merit_schemes_scoped_read on public.merit_schemes
for select to authenticated
using (
  (public.has_permission('merit.read')
    or public.has_permission('merit.manage'))
  and (
    public.is_admin()
    or public.staff_scope_allows(
      (select course.college_id from public.courses course
        where course.id = merit_schemes.course_id),
      (select course.department_id from public.courses course
        where course.id = merit_schemes.course_id),
      merit_schemes.course_id
    )
  )
);

drop policy if exists staff_merit_entries_scoped_read on public.merit_entries;
create policy staff_merit_entries_scoped_read on public.merit_entries
for select to authenticated
using (
  (public.has_permission('merit.read')
    or public.has_permission('merit.manage'))
  and exists (
    select 1
    from public.applications application
    join public.admission_forms form on form.id = application.form_id
    join public.courses course on course.id = form.course_id
    where application.id = merit_entries.application_id
      and public.staff_scope_allows(
        course.college_id,
        coalesce(application.department_id, course.department_id),
        course.id
      )
  )
);

drop policy if exists staff_fee_structures_scoped_read on public.fee_structures;
create policy staff_fee_structures_scoped_read on public.fee_structures
for select to authenticated
using (
  public.has_permission('fees.manage')
  and (
    public.is_admin()
    or public.staff_scope_allows(
      (select course.college_id from public.courses course
        where course.id = fee_structures.course_id),
      (select course.department_id from public.courses course
        where course.id = fee_structures.course_id),
      fee_structures.course_id
    )
  )
);

drop policy if exists staff_fee_assignments_scoped_read on public.fee_assignments;
create policy staff_fee_assignments_scoped_read on public.fee_assignments
for select to authenticated
using (
  public.has_permission('fees.manage')
  and exists (
    select 1
    from public.applications application
    join public.admission_forms form on form.id = application.form_id
    where application.id = fee_assignments.application_id
      and (
        public.is_admin()
        or public.staff_scope_allows(
          (select course.college_id from public.courses course
            where course.id = form.course_id),
          coalesce(application.department_id, (
            select course.department_id from public.courses course
            where course.id = form.course_id
          )),
          form.course_id
        )
      )
  )
);

drop policy if exists staff_payments_scoped_read on public.payments;
create policy staff_payments_scoped_read on public.payments
for select to authenticated
using (
  public.has_permission('fees.manage')
  and exists (
    select 1
    from public.fee_assignments assignment
    join public.applications application on application.id = assignment.application_id
    join public.admission_forms form on form.id = application.form_id
    where assignment.id = payments.assignment_id
      and (
        public.is_admin()
        or public.staff_scope_allows(
          (select course.college_id from public.courses course
            where course.id = form.course_id),
          coalesce(application.department_id, (
            select course.department_id from public.courses course
            where course.id = form.course_id
          )),
          form.course_id
        )
      )
  )
);

drop policy if exists report_templates_staff_read on public.report_templates;
create policy report_templates_staff_read on public.report_templates
for select to authenticated
using (
  public.has_permission('reports.read')
  and exists (
    select 1
    from public.staff_members staff
    where staff.user_id = auth.uid()
      and staff.active
      and staff.role_code = any(report_templates.allowed_roles)
  )
);

drop policy if exists report_templates_staff_manage on public.report_templates;
create policy report_templates_staff_manage on public.report_templates
for all to authenticated
using (public.has_permission('reports.manage'))
with check (public.has_permission('reports.manage'));

drop policy if exists staff_roles_report_read on public.staff_roles;
create policy staff_roles_report_read on public.staff_roles
for select to authenticated
using (
  public.has_permission('reports.manage')
  or public.has_permission('users.manage')
);

drop policy if exists id_cards_authorized_read on public.id_cards;
create policy id_cards_authorized_read on public.id_cards
for select to authenticated
using (
  (
    public.has_permission('id_cards.manage')
    and exists (
      select 1
      from public.applications application
      join public.admission_forms form on form.id = application.form_id
      join public.courses course on course.id = form.course_id
      where application.id = id_cards.application_id
        and public.staff_scope_allows(
          course.college_id,
          coalesce(application.department_id, course.department_id),
          course.id
        )
    )
  )
  or exists (
    select 1 from public.applications application
    where application.id = id_cards.application_id
      and application.student_id = auth.uid()
  )
);

drop policy if exists id_card_events_authorized_read on public.id_card_events;
create policy id_card_events_authorized_read on public.id_card_events
for select to authenticated
using (
  public.has_permission('id_cards.manage')
  and exists (
    select 1
    from public.id_cards card
    join public.applications application on application.id = card.application_id
    join public.admission_forms form on form.id = application.form_id
    join public.courses course on course.id = form.course_id
    where card.id = id_card_events.card_id
      and public.staff_scope_allows(
        course.college_id,
        coalesce(application.department_id, course.department_id),
        course.id
      )
  )
);

create or replace function public.guard_id_card_scope_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_application_id uuid;
  v_new_application_id uuid;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.staff_members staff
    where staff.user_id = auth.uid() and not staff.active
  ) then
    raise exception 'Staff account is disabled';
  end if;
  if not exists (
    select 1 from public.staff_members staff
    where staff.user_id = auth.uid() and staff.active
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'id_cards' then
    if tg_op <> 'INSERT' then
      v_old_application_id := old.application_id;
    end if;
    if tg_op <> 'DELETE' then
      v_new_application_id := new.application_id;
    end if;
  else
    if tg_op <> 'INSERT' then
      select card.application_id into v_old_application_id
      from public.id_cards card where card.id = old.card_id;
    end if;
    if tg_op <> 'DELETE' then
      select card.application_id into v_new_application_id
      from public.id_cards card where card.id = new.card_id;
    end if;
  end if;

  if v_old_application_id is not null and not exists (
    select 1
    from public.applications application
    join public.admission_forms form on form.id = application.form_id
    join public.courses course on course.id = form.course_id
    where application.id = v_old_application_id
      and public.staff_scope_allows(
        course.college_id,
        coalesce(application.department_id, course.department_id),
        course.id
      )
  ) then
    raise exception 'Record is outside your assigned college, department, or course scope';
  end if;
  if v_new_application_id is not null and not exists (
    select 1
    from public.applications application
    join public.admission_forms form on form.id = application.form_id
    join public.courses course on course.id = form.course_id
    where application.id = v_new_application_id
      and public.staff_scope_allows(
        course.college_id, course.department_id, course.id
      )
  ) then
    raise exception 'Record is outside your assigned college, department, or course scope';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_id_card_scope_write() from public;

drop trigger if exists id_cards_scope_guard on public.id_cards;
create trigger id_cards_scope_guard
before insert or update or delete on public.id_cards
for each row execute function public.guard_id_card_scope_write();

drop trigger if exists id_card_events_scope_guard on public.id_card_events;
create trigger id_card_events_scope_guard
before insert or update or delete on public.id_card_events
for each row execute function public.guard_id_card_scope_write();

create or replace function public.guard_academic_scope_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course text;
  v_department text;
  v_slot_id uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name in ('students', 'subjects', 'timetable_slots') then
      v_course := old.course;
      if not public.staff_course_scope_allows(v_course) then
        raise exception 'Record is outside your assigned college, department, or course scope';
      end if;
    elsif tg_table_name = 'faculty' then
      if not public.staff_department_scope_allows(public.faculty_department_name(old.id)) then
        raise exception 'Record is outside your assigned college, department, or course scope';
      end if;
    elsif tg_table_name = 'faculty_leaves' then
      v_department := public.faculty_department_name(old.faculty_id);
      if not public.staff_department_scope_allows(v_department) then
        raise exception 'Record is outside your assigned college, department, or course scope';
      end if;
    elsif tg_table_name = 'lecture_proxies' then
      select slot.course into v_course
      from public.timetable_slots slot where slot.id = old.slot_id;
      if not public.staff_course_scope_allows(v_course) then
        raise exception 'Record is outside your assigned college, department, or course scope';
      end if;
    elsif tg_table_name = 'lecture_attendance' then
      select slot.course into v_course
      from public.timetable_slots slot where slot.id = old.slot_id;
      if not public.staff_course_scope_allows(v_course) then
        raise exception 'Record is outside your assigned college, department, or course scope';
      end if;
    end if;
  end if;

  if tg_table_name in ('students', 'subjects', 'timetable_slots') then
    v_course := new.course;
  elsif tg_table_name = 'faculty' then
    v_department := public.faculty_department_name(new.id);
  elsif tg_table_name = 'faculty_leaves' then
    v_department := public.faculty_department_name(new.faculty_id);
  elsif tg_table_name = 'lecture_proxies' then
    select slot.course into v_course
    from public.timetable_slots slot where slot.id = new.slot_id;
  elsif tg_table_name = 'lecture_attendance' then
    select slot.course into v_course
    from public.timetable_slots slot where slot.id = new.slot_id;
  else
    return new;
  end if;

  if tg_table_name = 'faculty' or tg_table_name = 'faculty_leaves' then
    if not public.staff_department_scope_allows(v_department) then
      raise exception 'Record is outside your assigned college, department, or course scope';
    end if;
  elsif not public.staff_course_scope_allows(v_course) then
    raise exception 'Record is outside your assigned college, department, or course scope';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_academic_scope_write() from public;

drop trigger if exists students_scope_guard on public.students;
create trigger students_scope_guard before insert or update on public.students
for each row execute function public.guard_academic_scope_write();
drop trigger if exists subjects_scope_guard on public.subjects;
create trigger subjects_scope_guard before insert or update on public.subjects
for each row execute function public.guard_academic_scope_write();
drop trigger if exists timetable_scope_guard on public.timetable_slots;
create trigger timetable_scope_guard before insert or update on public.timetable_slots
for each row execute function public.guard_academic_scope_write();
drop trigger if exists faculty_scope_guard on public.faculty;
create trigger faculty_scope_guard before insert or update on public.faculty
for each row execute function public.guard_academic_scope_write();
drop trigger if exists faculty_leaves_scope_guard on public.faculty_leaves;
create trigger faculty_leaves_scope_guard before insert or update on public.faculty_leaves
for each row execute function public.guard_academic_scope_write();
drop trigger if exists lecture_proxies_scope_guard on public.lecture_proxies;
create trigger lecture_proxies_scope_guard before insert or update on public.lecture_proxies
for each row execute function public.guard_academic_scope_write();
drop trigger if exists lecture_attendance_scope_guard on public.lecture_attendance;
create trigger lecture_attendance_scope_guard before insert or update on public.lecture_attendance
for each row execute function public.guard_academic_scope_write();

-- The department of a faculty member. The free text column was
-- removed by migration 029, so the column that the database has is used.
create or replace function public.faculty_department_name(p_faculty_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_department text;
begin
  if p_faculty_id is null then
    return null;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'faculty'
      and column_name = 'department'
  ) then
    execute 'select faculty.department from public.faculty faculty where faculty.id = $1'
      into v_department using p_faculty_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'faculty'
      and column_name = 'department_id'
  ) then
    execute 'select department.name from public.faculty faculty join public.departments department on department.id = faculty.department_id where faculty.id = $1'
      into v_department using p_faculty_id;
  end if;
  return v_department;
end;
$$;

revoke all on function public.faculty_department_name(uuid) from public;
grant execute on function public.faculty_department_name(uuid) to authenticated;

drop policy if exists faculty_academics_read on public.faculty;
create policy faculty_academics_read on public.faculty
for select to authenticated
using (
  (public.has_permission('academics.read')
    or public.has_permission('academics.manage'))
  and public.staff_department_scope_allows(public.faculty_department_name(faculty.id))
);
drop policy if exists faculty_academics_manage on public.faculty;
create policy faculty_academics_manage on public.faculty
for all to authenticated
using (
  public.has_permission('academics.manage')
  and public.staff_department_scope_allows(public.faculty_department_name(faculty.id))
)
with check (
  public.has_permission('academics.manage')
  and public.staff_department_scope_allows(public.faculty_department_name(faculty.id))
);

drop policy if exists students_academics_read on public.students;
create policy students_academics_read on public.students
for select to authenticated
using (
  (public.has_permission('academics.read')
    or public.has_permission('academics.manage'))
  and public.staff_course_scope_allows(students.course)
);
drop policy if exists students_academics_manage on public.students;
create policy students_academics_manage on public.students
for all to authenticated
using (
  public.has_permission('academics.manage')
  and public.staff_course_scope_allows(students.course)
)
with check (
  public.has_permission('academics.manage')
  and public.staff_course_scope_allows(students.course)
);

drop policy if exists subjects_academics_read on public.subjects;
create policy subjects_academics_read on public.subjects
for select to authenticated
using (
  (public.has_permission('academics.read')
    or public.has_permission('academics.manage'))
  and public.staff_course_scope_allows(subjects.course)
);
drop policy if exists subjects_academics_manage on public.subjects;
create policy subjects_academics_manage on public.subjects
for all to authenticated
using (
  public.has_permission('academics.manage')
  and public.staff_course_scope_allows(subjects.course)
)
with check (
  public.has_permission('academics.manage')
  and public.staff_course_scope_allows(subjects.course)
);

drop policy if exists timetable_slots_academics_read on public.timetable_slots;
create policy timetable_slots_academics_read on public.timetable_slots
for select to authenticated
using (
  (public.has_permission('academics.read')
    or public.has_permission('academics.manage'))
  and public.staff_course_scope_allows(timetable_slots.course)
);

drop policy if exists faculty_leaves_read on public.faculty_leaves;
create policy faculty_leaves_read on public.faculty_leaves
for select to authenticated
using (
  (
    public.has_permission('academics.manage')
    or faculty_id = public.current_faculty_id()
  )
  and exists (
    select 1 from public.faculty member
    where member.id = faculty_leaves.faculty_id
      and public.staff_department_scope_allows(public.faculty_department_name(member.id))
  )
);
drop policy if exists faculty_leaves_insert on public.faculty_leaves;
create policy faculty_leaves_insert on public.faculty_leaves
for insert to authenticated
with check (
  (
    public.has_permission('academics.manage')
    or faculty_id = public.current_faculty_id()
  )
  and exists (
    select 1 from public.faculty member
    where member.id = faculty_leaves.faculty_id
      and public.staff_department_scope_allows(public.faculty_department_name(member.id))
  )
);
drop policy if exists faculty_leaves_manage on public.faculty_leaves;
create policy faculty_leaves_manage on public.faculty_leaves
for all to authenticated
using (
  public.has_permission('academics.manage')
  and exists (
    select 1 from public.faculty member
    where member.id = faculty_leaves.faculty_id
      and public.staff_department_scope_allows(public.faculty_department_name(member.id))
  )
)
with check (
  public.has_permission('academics.manage')
  and exists (
    select 1 from public.faculty member
    where member.id = faculty_leaves.faculty_id
      and public.staff_department_scope_allows(public.faculty_department_name(member.id))
  )
);

drop policy if exists lecture_proxies_read on public.lecture_proxies;
create policy lecture_proxies_read on public.lecture_proxies
for select to authenticated
using (
  (
    public.has_permission('academics.manage')
    or original_faculty_id = public.current_faculty_id()
    or proxy_faculty_id = public.current_faculty_id()
  )
  and exists (
    select 1 from public.timetable_slots slot
    where slot.id = lecture_proxies.slot_id
      and public.staff_course_scope_allows(slot.course)
  )
);
drop policy if exists lecture_proxies_manage on public.lecture_proxies;
create policy lecture_proxies_manage on public.lecture_proxies
for all to authenticated
using (
  public.has_permission('academics.manage')
  and exists (
    select 1 from public.timetable_slots slot
    where slot.id = lecture_proxies.slot_id
      and public.staff_course_scope_allows(slot.course)
  )
)
with check (
  public.has_permission('academics.manage')
  and exists (
    select 1 from public.timetable_slots slot
    where slot.id = lecture_proxies.slot_id
      and public.staff_course_scope_allows(slot.course)
  )
);

drop policy if exists lecture_attendance_read on public.lecture_attendance;
create policy lecture_attendance_read on public.lecture_attendance
for select to authenticated
using (
  (
    public.has_permission('academics.manage')
    or public.has_permission('attendance.record')
  )
  and exists (
    select 1 from public.timetable_slots slot
    where slot.id = lecture_attendance.slot_id
      and public.staff_course_scope_allows(slot.course)
  )
);
drop policy if exists lecture_attendance_manage on public.lecture_attendance;
create policy lecture_attendance_manage on public.lecture_attendance
for all to authenticated
using (
  public.has_permission('academics.manage')
  and exists (
    select 1 from public.timetable_slots slot
    where slot.id = lecture_attendance.slot_id
      and public.staff_course_scope_allows(slot.course)
  )
)
with check (
  public.has_permission('academics.manage')
  and exists (
    select 1 from public.timetable_slots slot
    where slot.id = lecture_attendance.slot_id
      and public.staff_course_scope_allows(slot.course)
  )
);

drop policy if exists staff_scope_academic_years_read on public.academic_years;
create policy staff_scope_academic_years_read on public.academic_years
for select to authenticated
using (
  public.has_permission('academics.read')
  or public.has_permission('admissions.read')
  or public.has_permission('intakes.manage')
);

drop policy if exists staff_universities_scoped_read on public.universities;
create policy staff_universities_scoped_read on public.universities
for select to authenticated
using (
  (
    public.has_permission('applications.read')
    or public.has_permission('academics.read')
    or public.has_permission('admissions.read')
  )
  and exists (
    select 1 from public.colleges college
    where college.university_id = universities.id
      and (
        public.staff_scope_allows(college.id, null, null)
        or exists (
          select 1 from public.courses course
          where course.college_id = college.id
            and public.staff_scope_allows(
              course.college_id, course.department_id, course.id
            )
        )
      )
  )
);

drop policy if exists departments_staff_read on public.departments;
create policy departments_staff_read on public.departments
for select to authenticated
using (
  (
    public.has_permission('applications.read')
    or public.has_permission('academics.read')
    or public.has_permission('academics.manage')
    or public.has_permission('admissions.read')
  )
  and (
    public.staff_scope_allows(null, departments.id, null)
    or exists (
      select 1 from public.courses course
      where course.department_id = departments.id
        and public.staff_scope_allows(
          course.college_id, course.department_id, course.id
        )
    )
  )
);
