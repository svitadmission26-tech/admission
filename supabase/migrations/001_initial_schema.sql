create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'viewer', 'data_entry')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  slug text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  current_version integer not null default 1 check (current_version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  schema_json jsonb not null default '{"sections":[],"fields":[]}'::jsonb,
  layout_json jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form_id, version_number)
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  form_version_id uuid not null references public.form_versions(id) on delete restrict,
  submission_number bigint generated always as identity,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'archived')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forms_workspace_idx on public.forms(workspace_id);
create index if not exists form_versions_form_idx on public.form_versions(form_id, version_number desc);
create index if not exists submissions_form_date_idx on public.form_submissions(form_id, submitted_at desc);
create index if not exists submissions_data_gin_idx on public.form_submissions using gin (data);
create index if not exists audit_workspace_date_idx on public.form_audit_logs(workspace_id, created_at desc);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_creator(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = target_workspace_id and w.created_by = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.can_view_submissions(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor', 'viewer')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_creator(uuid) from public;
revoke all on function public.can_edit_workspace(uuid) from public;
revoke all on function public.can_view_submissions(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_creator(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.can_view_submissions(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_audit_logs enable row level security;

drop policy if exists "Members can read their workspaces" on public.workspaces;
create policy "Members can read their workspaces" on public.workspaces
  for select to authenticated
  using (created_by = auth.uid() or public.is_workspace_member(id));

drop policy if exists "Users can create their own workspace" on public.workspaces;
create policy "Users can create their own workspace" on public.workspaces
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Editors can update workspaces" on public.workspaces;
create policy "Editors can update workspaces" on public.workspaces
  for update to authenticated
  using (public.can_edit_workspace(id))
  with check (public.can_edit_workspace(id));

drop policy if exists "Owners can delete workspaces" on public.workspaces;
create policy "Owners can delete workspaces" on public.workspaces
  for delete to authenticated
  using (created_by = auth.uid());

drop policy if exists "Members can read workspace membership" on public.workspace_members;
create policy "Members can read workspace membership" on public.workspace_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "Workspace creators can add themselves" on public.workspace_members;
create policy "Workspace creators can add themselves" on public.workspace_members
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_workspace_creator(workspace_id));

drop policy if exists "Owners can manage workspace membership" on public.workspace_members;
create policy "Owners can manage workspace membership" on public.workspace_members
  for delete to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.created_by = auth.uid()
  ));

drop policy if exists "Members can read forms" on public.forms;
create policy "Members can read forms" on public.forms
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Editors can create forms" on public.forms;
create policy "Editors can create forms" on public.forms
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_workspace(workspace_id));

drop policy if exists "Editors can update forms" on public.forms;
create policy "Editors can update forms" on public.forms
  for update to authenticated
  using (public.can_edit_workspace(workspace_id))
  with check (public.can_edit_workspace(workspace_id));

drop policy if exists "Editors can delete forms" on public.forms;
create policy "Editors can delete forms" on public.forms
  for delete to authenticated
  using (public.can_edit_workspace(workspace_id));

drop policy if exists "Members can read form versions" on public.form_versions;
create policy "Members can read form versions" on public.form_versions
  for select to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.is_workspace_member(f.workspace_id)
  ));

drop policy if exists "Editors can insert form versions" on public.form_versions;
create policy "Editors can insert form versions" on public.form_versions
  for insert to authenticated
  with check (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ));

drop policy if exists "Editors can update form versions" on public.form_versions;
create policy "Editors can update form versions" on public.form_versions
  for update to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ))
  with check (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ));

drop policy if exists "Editors can delete form versions" on public.form_versions;
create policy "Editors can delete form versions" on public.form_versions
  for delete to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ));

drop policy if exists "Authorized members can read submissions" on public.form_submissions;
create policy "Authorized members can read submissions" on public.form_submissions
  for select to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_view_submissions(f.workspace_id)
  ));

drop policy if exists "Authenticated users can submit to published forms" on public.form_submissions;
create policy "Authenticated users can submit to published forms" on public.form_submissions
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1
      from public.forms f
      join public.form_versions fv on fv.form_id = f.id
      where f.id = form_id
        and f.status = 'published'
        and fv.id = form_version_id
        and fv.is_published
        and public.is_workspace_member(f.workspace_id)
    )
  );

drop policy if exists "Editors can update submissions" on public.form_submissions;
create policy "Editors can update submissions" on public.form_submissions
  for update to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ))
  with check (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ));

drop policy if exists "Editors can delete submissions" on public.form_submissions;
create policy "Editors can delete submissions" on public.form_submissions
  for delete to authenticated
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.can_edit_workspace(f.workspace_id)
  ));

drop policy if exists "Members can read audit logs" on public.form_audit_logs;
create policy "Members can read audit logs" on public.form_audit_logs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Editors can write audit logs" on public.form_audit_logs;
create policy "Editors can write audit logs" on public.form_audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid() and public.can_edit_workspace(workspace_id));

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.forms to authenticated;
grant select, insert, update, delete on public.form_versions to authenticated;
grant select, insert, update, delete on public.form_submissions to authenticated;
grant select, insert on public.form_audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;