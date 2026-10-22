-- Migration 034: Dynamic role-based login modules
-- Apply after migration 033. Idempotent and safe to re-run.
--
-- This migration adds the "Login Module" concept that powers the dynamic
-- role-based login page:
--   1. public.login_modules  - the list of login modules shown in the public
--      login dropdown. Each module points at an EXISTING dashboard route
--      (portal_id + entry_page) and an EXISTING set of user roles.
--   2. public.get_college_branding() - reads the college name and logo that
--      are already stored in public.colleges.
--   3. public.effective_login_role() - resolves the caller's role on the
--      server (admin / staff role / student / null when the staff account is
--      disabled).
--   4. public.resolve_login_module() - backend validation of the selected
--      login module. The client cannot bypass it because the role is derived
--      from the database, never from the request.
--   5. public.admin_save_login_module() - admin only create / edit / enable /
--      disable / order / role assignment.
--   6. public.resolve_login_email() - lets a signed-in user type their
--      Supabase user id instead of their email address.
--
-- No existing user, profile, staff member, role, portal or business record is
-- modified. No password is read or written. Disabling a module only flips a
-- boolean, so users and their data stay untouched.

-- ---------------------------------------------------------------------------
-- 1. Login modules table
-- ---------------------------------------------------------------------------
create table if not exists public.login_modules (
  id text primary key,
  name text not null,
  description text not null default '',
  icon text not null default '',
  portal_id text not null,
  entry_page text not null default 'Dashboard',
  display_order integer not null default 100,
  enabled boolean not null default true,
  allowed_roles text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint login_modules_id_format check (id ~ '^[a-z][a-z0-9_]{1,39}$')
);

alter table public.login_modules enable row level security;

-- Reads are public for the enabled modules only. Writes are granted to every
-- signed-in account but the row level security policies below still restrict
-- them to super administrators.
grant select on public.login_modules to anon, authenticated;
grant insert, update, delete on public.login_modules to authenticated;

-- Public readers only ever see the modules that are enabled.
drop policy if exists login_modules_public_read on public.login_modules;
create policy login_modules_public_read on public.login_modules
  for select
  to anon, authenticated
  using (enabled = true);

-- Super admins can read every module, including the disabled ones.
drop policy if exists login_modules_admin_read on public.login_modules;
create policy login_modules_admin_read on public.login_modules
  for select
  to authenticated
  using (public.is_admin());

-- Only super admins can create, edit, enable or disable a module.
drop policy if exists login_modules_admin_manage on public.login_modules;
create policy login_modules_admin_manage on public.login_modules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. College branding for the login page (reads the existing colleges table)
-- ---------------------------------------------------------------------------
create or replace function public.get_college_branding()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object('name', college.name, 'logo_url', college.logo_url)
      from public.colleges college
      where college.active
        and nullif(trim(coalesce(college.logo_url, '')), '') is not null
      order by college.name
      limit 1
    ),
    (
      select jsonb_build_object('name', college.name, 'logo_url', college.logo_url)
      from public.colleges college
      where college.active
      order by college.name
      limit 1
    ),
    jsonb_build_object('name', 'SVIT', 'logo_url', null)
  );
$$;

revoke all on function public.get_college_branding() from public;
grant execute on function public.get_college_branding() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Effective login role of the signed-in user
--    admin  -> super administrator
--    <role> -> active staff_members.role_code
--    student-> profiles.role for accounts without a staff record
--    null   -> no profile, or a staff record that is not active
-- ---------------------------------------------------------------------------
create or replace function public.effective_login_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.is_admin() then 'admin'
    when exists (
      select 1 from public.staff_members staff
      where staff.user_id = auth.uid()
    ) then (
      select staff.role_code
      from public.staff_members staff
      where staff.user_id = auth.uid()
        and staff.active
      limit 1
    )
    else (
      select profile.role
      from public.profiles profile
      where profile.id = auth.uid()
    )
  end;
$$;

revoke all on function public.effective_login_role() from public;
grant execute on function public.effective_login_role() to authenticated;
-- Only a signed in account may ask for its own access information.
revoke execute on function public.effective_login_role() from anon;

-- ---------------------------------------------------------------------------
-- 4. Backend validation of the selected login module
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_module(p_module_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_module public.login_modules%rowtype;
  v_role text;
begin
  if nullif(trim(coalesce(p_module_id, '')), '') is null then
    return jsonb_build_object('allowed', false, 'reason', 'Select a login module.');
  end if;

  select module.* into v_module
  from public.login_modules module
  where module.id = p_module_id;
  if not found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'The selected login module is no longer available.'
    );
  end if;

  v_role := public.effective_login_role();
  if v_role is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'This account is not active. Contact the administrator.',
      'module_id', v_module.id
    );
  end if;

  -- A disabled module stays in the database with all of its users and data.
  -- Only the public entry point disappears.
  if not v_module.enabled and v_role <> 'admin' then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'This login module is currently disabled.',
      'module_id', v_module.id
    );
  end if;

  -- An empty allowed_roles list means "every signed-in role may use this
  -- module". A populated list restricts the module to those roles.
  if v_module.allowed_roles <> '{}'::text[]
     and v_role <> 'admin'
     and not (v_module.allowed_roles @> ARRAY[v_role]) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'Your role is not assigned to this login module.',
      'module_id', v_module.id,
      'role_code', v_role
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'module_id', v_module.id,
    'name', v_module.name,
    'portal_id', v_module.portal_id,
    'entry_page', v_module.entry_page,
    'role_code', v_role
  );
end;
$$;

revoke all on function public.resolve_login_module(text) from public;
grant execute on function public.resolve_login_module(text) to authenticated;
-- The module list is public, the resolution of a module is not.
revoke execute on function public.resolve_login_module(text) from anon;

-- ---------------------------------------------------------------------------
-- 5. Admin only maintenance of login modules
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_login_module(
  p_id text,
  p_name text,
  p_description text,
  p_icon text,
  p_portal_id text,
  p_entry_page text,
  p_display_order integer,
  p_enabled boolean,
  p_allowed_roles text[]
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
  if p_id is null or trim(p_id) !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'Module id must be 2 to 40 lowercase letters, numbers, or underscores';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Module name is required';
  end if;
  if nullif(trim(coalesce(p_portal_id, '')), '') is null then
    raise exception 'Assign an existing dashboard route';
  end if;
  if p_enabled is false and trim(p_id) = 'admin' then
    raise exception 'The Admin login module cannot be disabled';
  end if;

  insert into public.login_modules (
    id, name, description, icon, portal_id, entry_page,
    display_order, enabled, allowed_roles, updated_at
  )
  values (
    trim(p_id),
    trim(p_name),
    coalesce(trim(coalesce(p_description, '')), ''),
    coalesce(trim(coalesce(p_icon, '')), ''),
    trim(p_portal_id),
    coalesce(nullif(trim(coalesce(p_entry_page, '')), ''), 'Dashboard'),
    coalesce(p_display_order, 100),
    coalesce(p_enabled, true),
    coalesce(p_allowed_roles, '{}'::text[]),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    portal_id = excluded.portal_id,
    entry_page = excluded.entry_page,
    display_order = excluded.display_order,
    enabled = excluded.enabled,
    allowed_roles = excluded.allowed_roles,
    updated_at = now();
end;
$$;

revoke all on function public.admin_save_login_module(text, text, text, text, text, text, integer, boolean, text[]) from public;
grant execute on function public.admin_save_login_module(text, text, text, text, text, text, integer, boolean, text[]) to authenticated;
-- The function itself refuses non administrators, anonymous callers are
-- rejected before they even reach the function.
revoke execute on function public.admin_save_login_module(text, text, text, text, text, text, integer, boolean, text[]) from anon;

-- ---------------------------------------------------------------------------
-- 6. Allow signing in with the Supabase user id instead of the email address
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_email(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select account.email
  from auth.users account
  where account.id = p_user_id
    and exists (
      select 1 from public.profiles profile
      where profile.id = account.id
    );
$$;

revoke all on function public.resolve_login_email(uuid) from public;
grant execute on function public.resolve_login_email(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Default login modules
--    Every module points at a dashboard route that already exists in the ERP.
--    Re-running this migration never overwrites a module an administrator has
--    already customised.
-- ---------------------------------------------------------------------------
insert into public.login_modules (
  id, name, description, icon, portal_id, entry_page,
  display_order, enabled, allowed_roles
)
values
  ('admin', 'Admin', 'Full ERP control, all modules, users and security', '🛠️', 'super_admin', 'Dashboard', 1, true, array['admin']),
  ('faculty', 'Faculty', 'Faculty leave, proxy, timetable and attendance workspace', '🧑‍🏫', 'faculty_leave', 'Leave Dashboard', 2, true, array['faculty']),
  ('student', 'Student', 'Admission application, submitted forms and documents', '🧑‍🎓', 'admissions', 'My Applications', 3, true, array['student']),
  ('hod', 'HOD', 'Department students, attendance and approvals', '🏛️', 'student_management', 'Student Management', 4, true, array['department_head']),
  ('admission_staff', 'Admission Staff', 'Inquiries, final admissions and application review', '🗂️', 'admissions', 'Inquiries', 5, true, array['authority', 'data_entry', 'admission_staff']),
  ('accountant', 'Accountant', 'Fee structures, fee assignments and payments', '💰', 'admissions', 'Payments', 6, true, array['fees_collection', 'accountant']),
  ('library_staff', 'Library Staff', 'Faculty records, subjects and library desk', '📚', 'college_info', 'Faculty', 7, true, array['library_staff']),
  ('examination_cell', 'Examination Cell', 'Applications, merit entries and result reports', '🧮', 'admissions', 'Reports', 8, true, array['examination_cell'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Staff roles for the default login modules that do not have one yet.
--    New role definitions only: no user is created and no existing role,
--    permission or user record is changed.
-- ---------------------------------------------------------------------------
insert into public.staff_roles (code, label)
values
  ('admission_staff', 'Admission Staff'),
  ('accountant', 'Accountant'),
  ('library_staff', 'Library Staff'),
  ('examination_cell', 'Examination Cell')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission)
select grants.role_code, 'page:' || grants.page
from (values
  ('admission_staff', 'Dashboard'),
  ('admission_staff', 'Inquiries'),
  ('admission_staff', 'Final Admissions'),
  ('admission_staff', 'Faculty'),
  ('admission_staff', 'Subjects'),
  ('admission_staff', 'Reports'),
  ('accountant', 'Dashboard'),
  ('accountant', 'Fee Structures'),
  ('accountant', 'Fee Assignments'),
  ('accountant', 'Payments'),
  ('accountant', 'Reports'),
  ('library_staff', 'Dashboard'),
  ('library_staff', 'Faculty'),
  ('library_staff', 'Subjects'),
  ('examination_cell', 'Dashboard'),
  ('examination_cell', 'Applications'),
  ('examination_cell', 'Merit Entries'),
  ('examination_cell', 'Reports')
) as grants(role_code, page)
on conflict (role_code, permission) do nothing;

insert into public.role_permissions (role_code, permission)
values
  ('admission_staff', 'applications.read'),
  ('admission_staff', 'applications.create'),
  ('admission_staff', 'applications.review'),
  ('admission_staff', 'inquiries.read'),
  ('admission_staff', 'inquiries.manage'),
  ('admission_staff', 'academics.read'),
  ('admission_staff', 'reports.read'),
  ('accountant', 'fees.manage'),
  ('accountant', 'applications.read'),
  ('accountant', 'reports.read'),
  ('library_staff', 'academics.read'),
  ('examination_cell', 'applications.read'),
  ('examination_cell', 'merit.read'),
  ('examination_cell', 'reports.read')
on conflict (role_code, permission) do nothing;
