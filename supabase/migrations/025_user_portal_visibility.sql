-- Migration 025: User-Wise and Role-Wise Portal Visibility & Login Settings
-- Allows configuring which modules each user / role sees on the login and landing screen

-- 1. Add allowed_modules to staff_members (user-wise module setting)
alter table public.staff_members
  add column if not exists allowed_modules text[] not null default '{}'::text[];

-- 2. Add default_modules to staff_roles (role-wise default module setting)
alter table public.staff_roles
  add column if not exists default_modules text[] not null default '{}'::text[];

-- Update default role modules
update public.staff_roles
set default_modules = array['college_info', 'admissions', 'timetable', 'faculty_leave', 'student_management', 'super_admin']
where code = 'admin';

update public.staff_roles
set default_modules = array['timetable', 'faculty_leave']
where code = 'faculty' and cardinality(default_modules) = 0;

update public.staff_roles
set default_modules = array['college_info', 'timetable', 'faculty_leave']
where code = 'department_head' and cardinality(default_modules) = 0;

update public.staff_roles
set default_modules = array['college_info', 'admissions', 'timetable', 'faculty_leave', 'student_management']
where code = 'principal' and cardinality(default_modules) = 0;

update public.staff_roles
set default_modules = array['admissions', 'student_management']
where code in ('authority', 'id_card') and cardinality(default_modules) = 0;

update public.staff_roles
set default_modules = array['admissions']
where code in ('fees_collection', 'data_entry') and cardinality(default_modules) = 0;

-- 3. Portal Visibility Settings for the landing / login screen
create table if not exists public.login_portal_settings (
  id text primary key,
  title text not null,
  description text not null default '',
  icon text not null default '',
  visible_to_public boolean not null default true,
  display_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.login_portal_settings enable row level security;

drop policy if exists login_portal_settings_read on public.login_portal_settings;
create policy login_portal_settings_read on public.login_portal_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists login_portal_settings_manage on public.login_portal_settings;
create policy login_portal_settings_manage on public.login_portal_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed default portal settings
insert into public.login_portal_settings (id, title, description, icon, visible_to_public, display_order, active)
values
  ('college_info', 'College information', 'Users, Universities, Colleges, Courses, Branches, Calendar & Faculty', '🏛️', true, 1, true),
  ('admissions', 'New Admission Student management', 'Inquiries, Admission Forms, Sequences, Fees, Merit, Reports & Notice Board', '🎓', true, 2, true),
  ('timetable', 'Time table', 'Timetable Dashboard, Subjects, Timetable Management & College Timing', '🕐', true, 3, true),
  ('faculty_leave', 'Faculty Leave Mangment', 'Daily Leave & Proxy Dashboard, Approval by Post & Docs', '🌴', true, 4, true),
  ('student_management', 'Student Management', 'Admission Year Student Data (ID & Enrollment Wise), Attendance & ID Cards', '🧑‍🎓', true, 5, true),
  ('super_admin', 'Super Admin', 'Full ERP Control, All Module Access, Security & User Roles', '⚙️', false, 6, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  display_order = excluded.display_order;

-- 4. Update get_my_staff_access() to return allowed_modules and role default_modules
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
    'faculty_id', staff.faculty_id,
    'allowed_modules', case
      when cardinality(staff.allowed_modules) > 0 then to_jsonb(staff.allowed_modules)
      else coalesce((
        select to_jsonb(roles.default_modules)
        from public.staff_roles roles
        where roles.code = staff.role_code
      ), '[]'::jsonb)
    end
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
    'faculty_id', null,
    'allowed_modules', '[]'::jsonb
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
