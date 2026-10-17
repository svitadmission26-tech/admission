create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  active boolean not null default true
);

create table if not exists public.staff_roles (
  code text primary key,
  label text not null
);

insert into public.staff_roles (code, label)
values
  ('admin', 'Administrator'),
  ('authority', 'Admission Authority'),
  ('fees_collection', 'Fees Collection'),
  ('id_card', 'ID Card Operator'),
  ('data_entry', 'Data Entry Operator'),
  ('department_head', 'Department Head'),
  ('principal', 'Principal')
on conflict (code) do nothing;

create table if not exists public.staff_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role_code text not null references public.staff_roles (code),
  department_id uuid references public.departments (id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_code text not null references public.staff_roles (code) on delete cascade,
  permission text not null,
  primary key (role_code, permission)
);

insert into public.role_permissions (role_code, permission)
values
  ('admin', 'users.manage'),
  ('admin', 'masters.manage'),
  ('admin', 'applications.read'),
  ('admin', 'applications.review'),
  ('admin', 'fees.manage'),
  ('admin', 'id_cards.manage'),
  ('admin', 'merit.manage'),
  ('admin', 'reports.read'),
  ('authority', 'applications.read'),
  ('authority', 'applications.review'),
  ('authority', 'reports.read'),
  ('fees_collection', 'applications.read'),
  ('fees_collection', 'fees.manage'),
  ('id_card', 'applications.read'),
  ('id_card', 'id_cards.manage'),
  ('data_entry', 'applications.read'),
  ('data_entry', 'applications.create'),
  ('department_head', 'applications.read'),
  ('department_head', 'applications.review'),
  ('department_head', 'reports.read'),
  ('principal', 'applications.read'),
  ('principal', 'reports.read'),
  ('principal', 'merit.read')
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
    from public.staff_members s
    join public.role_permissions rp on rp.role_code = s.role_code
    where s.user_id = auth.uid()
      and s.active
      and rp.permission = p_permission
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

alter table public.departments enable row level security;
alter table public.staff_roles enable row level security;
alter table public.staff_members enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists departments_staff_read on public.departments;

create policy departments_staff_read on public.departments
for select to authenticated
using (public.has_permission('applications.read'));

drop policy if exists departments_admin_manage on public.departments;

create policy departments_admin_manage on public.departments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists staff_roles_admin_read on public.staff_roles;

create policy staff_roles_admin_read on public.staff_roles
for select to authenticated
using (public.is_admin());

drop policy if exists staff_roles_admin_manage on public.staff_roles;

create policy staff_roles_admin_manage on public.staff_roles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists role_permissions_admin_read on public.role_permissions;

create policy role_permissions_admin_read on public.role_permissions
for select to authenticated
using (public.is_admin());

drop policy if exists role_permissions_admin_manage on public.role_permissions;

create policy role_permissions_admin_manage on public.role_permissions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists staff_members_self_read on public.staff_members;

create policy staff_members_self_read on public.staff_members
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists staff_members_admin_manage on public.staff_members;

create policy staff_members_admin_manage on public.staff_members
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.applications
add column if not exists department_id uuid references public.departments (id);

drop policy if exists staff_applications_read on public.applications;

create policy staff_applications_read on public.applications
for select to authenticated
using (
  public.has_permission('applications.read')
  and (
    not exists (
      select 1
      from public.staff_members s
      where s.user_id = auth.uid()
        and s.active
        and s.role_code = 'department_head'
    )
    or department_id = (
      select s.department_id
      from public.staff_members s
      where s.user_id = auth.uid()
        and s.active
        and s.role_code = 'department_head'
    )
  )
);

create or replace function public.staff_review_application(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('applications.review') then
    raise exception 'Permission denied';
  end if;
  if p_status not in ('under_review', 'approved', 'rejected') then
    raise exception 'Invalid status';
  end if;
  if exists (
    select 1
    from public.staff_members s
    join public.applications a on a.id = p_id
    where s.user_id = auth.uid()
      and s.active
      and s.role_code = 'department_head'
      and a.department_id is distinct from s.department_id
  ) then
    raise exception 'Outside assigned department';
  end if;

  update public.applications
  set status = p_status, updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'Application not found';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'application.review', 'applications', p_id::text);
end;
$$;

revoke all on function public.staff_review_application(uuid, text) from public;
grant execute on function public.staff_review_application(uuid, text) to authenticated;
