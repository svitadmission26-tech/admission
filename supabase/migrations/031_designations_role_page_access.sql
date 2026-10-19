-- Migration 031: Designation tab access and data rules
-- The Designation tab (public.designations) is master data inside the College
-- Information module. This migration:
--   1. Allows the Designation page to be granted to a staff role, so the tab
--      can be reached from the navigation and the Faculty form can list the
--      designations that are configured here.
--   2. Lets staff with masters.manage read and maintain designations, in
--      addition to the academics permissions used by the Academics module.
--   3. Stops duplicate designation names from being saved.
-- Idempotent and safe to re-run. Apply after migration 030.

-- ---------------------------------------------------------------------------
-- 1. Allow the Designation page in the role-access page allowlist
-- ---------------------------------------------------------------------------
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
      'Designation', 'Student Management', 'Subjects',
      'Timetable Dashboard', 'Timetable Management', 'College Timing',
      'Leave Dashboard', 'Leave Management', 'Attendance', 'Notice Board',
      'Inquiries', 'ID Cards', 'Final Admissions', 'Applications', 'Documents',
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

-- ---------------------------------------------------------------------------
-- 2. Designation read and write policies
-- ---------------------------------------------------------------------------
drop policy if exists designations_read on public.designations;
create policy designations_read on public.designations
	for select to authenticated
	using (
		public.has_permission('academics.read')
		or public.has_permission('academics.manage')
		or public.has_permission('masters.manage')
	);

drop policy if exists designations_manage on public.designations;
create policy designations_manage on public.designations
	for all to authenticated
	using (
		public.has_permission('academics.manage')
		or public.has_permission('masters.manage')
	)
	with check (
		public.has_permission('academics.manage')
		or public.has_permission('masters.manage')
	);

-- ---------------------------------------------------------------------------
-- 3. One row per designation name
-- ---------------------------------------------------------------------------
-- Keep the oldest row of a duplicated name and rename the rest, so no
-- designation is lost before the unique index is created.
update public.designations d
set name = d.name || ' (' || d.id::text || ')'
where d.id in (
	select id
	from (
		select id,
			row_number() over (
				partition by lower(btrim(name))
				order by created_at, id
			) as row_number
		from public.designations
	) duplicates
	where duplicates.row_number > 1
);

create unique index if not exists designations_name_unique
	on public.designations (lower(btrim(name)));
