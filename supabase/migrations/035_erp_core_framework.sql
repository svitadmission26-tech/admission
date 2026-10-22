-- Migration 035: SVIT ERP core framework
-- Apply after migration 034. Idempotent and safe to re-run.
--
-- This migration creates the shared framework that the 25 ERP modules run on:
--
--   1. public.erp_modules            - the module registry (enable/disable,
--                                      ordering, dashboard route, settings)
--   2. public.erp_module_permissions - the per-role CRUD matrix
--   3. public.erp_module_timings     - module-wise college timings
--   4. public.erp_feature_flags      - module feature switches
--   5. public.erp_approval_workflows - configurable approval chains
--   6. public.erp_workflow_items     - the records travelling through a chain
--   7. public.erp_receipt_templates  - configurable receipt / letter layouts
--   8. public.erp_report_definitions - configurable custom reports
--   9. public.erp_saved_reports      - a saved report run
--  10. public.erp_notifications      - the notification centre
--  11. public.erp_notification_reads - read receipts of a notification
--  12. public.erp_audit_log          - the audit trail of every domain write
--
-- Helper functions:
--   public.erp_module_enabled(text)
--   public.erp_module_permission(text, text)
--   public.get_my_erp_access()
--   public.erp_notify(...)
--   public.erp_audit_trigger()
--   public.erp_workflow_action(uuid, text, text)
--
-- No existing table, row, user or role is modified. The new staff roles and
-- login modules that are inserted below are additive only.

-- ---------------------------------------------------------------------------
-- 1. Module registry
-- ---------------------------------------------------------------------------
create table if not exists public.erp_modules (
  id text primary key,
  number integer not null default 100,
  title text not null,
  description text not null default '',
  icon text not null default '',
  portal text not null default 'super_admin',
  entry_page text not null default 'Dashboard',
  permission_page text not null default '',
  enabled boolean not null default true,
  display_order integer not null default 100,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_modules_id_format check (id ~ '^[a-z][a-z0-9_]{1,39}$')
);

create index if not exists erp_modules_order_idx
  on public.erp_modules (display_order, number);

-- The table may already exist from an earlier run of this migration.
alter table public.erp_modules
  add column if not exists permission_page text not null default '';

alter table public.erp_modules enable row level security;

grant select on public.erp_modules to anon, authenticated;
grant insert, update, delete on public.erp_modules to authenticated;

drop policy if exists erp_modules_public_read on public.erp_modules;
create policy erp_modules_public_read on public.erp_modules
  for select
  to anon, authenticated
  using (enabled = true);

drop policy if exists erp_modules_admin_read on public.erp_modules;
create policy erp_modules_admin_read on public.erp_modules
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists erp_modules_admin_manage on public.erp_modules;
create policy erp_modules_admin_manage on public.erp_modules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Module permission matrix (view / create / edit / delete / export / approve)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_module_permissions (
  module_id text not null references public.erp_modules (id) on delete cascade,
  role_code text not null,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_export boolean not null default true,
  can_approve boolean not null default false,
  scope jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (module_id, role_code)
);

alter table public.erp_module_permissions enable row level security;

grant select on public.erp_module_permissions to authenticated;
grant insert, update, delete on public.erp_module_permissions to authenticated;

drop policy if exists erp_module_permissions_read on public.erp_module_permissions;
create policy erp_module_permissions_read on public.erp_module_permissions
  for select
  to authenticated
  using (
    public.is_admin()
    or role_code = public.effective_login_role()
  );

drop policy if exists erp_module_permissions_manage on public.erp_module_permissions;
create policy erp_module_permissions_manage on public.erp_module_permissions
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2a. The two helpers that every other policy in this migration relies on.
--     They are defined here because the tables they read already exist.
-- ---------------------------------------------------------------------------

-- Is the module switched on? Administrators always see a module that is
-- disabled so that it can be switched back on.
create or replace function public.erp_module_enabled(p_module_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select module.enabled
      from public.erp_modules module
      where module.id = p_module_id
    ),
    false
  ) or public.is_admin();
$$;

revoke all on function public.erp_module_enabled(text) from public;
grant execute on function public.erp_module_enabled(text) to anon, authenticated;

-- The per-role CRUD matrix for the signed-in account.
-- p_action is one of view, create, edit, delete, export, approve.
create or replace function public.erp_module_permission(
  p_module_id text,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.is_admin() then true
    when p_action is null or trim(p_action) = '' then false
    else coalesce(
      (
        select
          case p_action
            when 'view' then permission.can_view
            when 'create' then permission.can_create
            when 'edit' then permission.can_edit
            when 'delete' then permission.can_delete
            when 'export' then permission.can_export
            when 'approve' then permission.can_approve
            else false
          end
        from public.erp_module_permissions permission
        where permission.module_id = p_module_id
          and permission.role_code = public.effective_login_role()
      ),
      -- No explicit row for this role: fall back to the legacy page
      -- permission of the module so that the roles that already worked keep
      -- working after the matrix was introduced.
      case
        when p_action = 'view' then public.has_permission(
          'page:' || coalesce(
            (select module.permission_page from public.erp_modules module where module.id = p_module_id),
            ''
          )
        )
        else false
      end
    )
  end;
$$;

revoke all on function public.erp_module_permission(text, text) from public;
grant execute on function public.erp_module_permission(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Module-wise college timings
-- ---------------------------------------------------------------------------
create table if not exists public.erp_module_timings (
  id uuid primary key default gen_random_uuid(),
  module_id text not null references public.erp_modules (id) on delete cascade,
  college_id uuid references public.colleges (id) on delete cascade,
  label text not null default 'General',
  day_of_week integer not null default 1,
  opens_at time not null default '09:00',
  closes_at time not null default '16:00',
  period_minutes integer not null default 60,
  break_start time,
  break_end time,
  is_working_day boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_module_timings_day check (day_of_week between 0 and 6)
);

create index if not exists erp_module_timings_module_idx
  on public.erp_module_timings (module_id, day_of_week);

alter table public.erp_module_timings enable row level security;

grant select on public.erp_module_timings to authenticated;
grant insert, update, delete on public.erp_module_timings to authenticated;

drop policy if exists erp_module_timings_read on public.erp_module_timings;
create policy erp_module_timings_read on public.erp_module_timings
  for select
  to authenticated
  using (true);

drop policy if exists erp_module_timings_manage on public.erp_module_timings;
create policy erp_module_timings_manage on public.erp_module_timings
  for all
  to authenticated
  using (public.is_admin() or public.has_permission('settings.manage'))
  with check (public.is_admin() or public.has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- 4. Feature flags
-- ---------------------------------------------------------------------------
create table if not exists public.erp_feature_flags (
  id text primary key,
  name text not null,
  description text not null default '',
  module_id text references public.erp_modules (id) on delete cascade,
  enabled boolean not null default true,
  rollout jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.erp_feature_flags enable row level security;

grant select on public.erp_feature_flags to authenticated;
grant insert, update, delete on public.erp_feature_flags to authenticated;

drop policy if exists erp_feature_flags_read on public.erp_feature_flags;
create policy erp_feature_flags_read on public.erp_feature_flags
  for select
  to authenticated
  using (true);

drop policy if exists erp_feature_flags_manage on public.erp_feature_flags;
create policy erp_feature_flags_manage on public.erp_feature_flags
  for all
  to authenticated
  using (public.is_admin() or public.has_permission('settings.manage'))
  with check (public.is_admin() or public.has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- 5. Approval workflows
-- ---------------------------------------------------------------------------
create table if not exists public.erp_approval_workflows (
  id uuid primary key default gen_random_uuid(),
  module_id text not null references public.erp_modules (id) on delete cascade,
  name text not null,
  description text not null default '',
  entity_table text not null default '',
  steps jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_approval_workflows_module_idx
  on public.erp_approval_workflows (module_id);

alter table public.erp_approval_workflows enable row level security;

grant select on public.erp_approval_workflows to authenticated;
grant insert, update, delete on public.erp_approval_workflows to authenticated;

drop policy if exists erp_approval_workflows_read on public.erp_approval_workflows;
create policy erp_approval_workflows_read on public.erp_approval_workflows
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('modules.manage')
    or public.erp_module_permission(module_id, 'view')
  );

drop policy if exists erp_approval_workflows_manage on public.erp_approval_workflows;
create policy erp_approval_workflows_manage on public.erp_approval_workflows
  for all
  to authenticated
  using (public.is_admin() or public.has_permission('modules.manage'))
  with check (public.is_admin() or public.has_permission('modules.manage'));

create table if not exists public.erp_workflow_items (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.erp_approval_workflows (id) on delete cascade,
  module_id text not null default '',
  entity_table text not null default '',
  entity_id uuid,
  title text not null default '',
  current_step integer not null default 0,
  status text not null default 'pending',
  history jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_workflow_items_status check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  )
);

create index if not exists erp_workflow_items_module_idx
  on public.erp_workflow_items (module_id, status);

alter table public.erp_workflow_items enable row level security;

grant select on public.erp_workflow_items to authenticated;
grant insert, update, delete on public.erp_workflow_items to authenticated;

drop policy if exists erp_workflow_items_read on public.erp_workflow_items;
create policy erp_workflow_items_read on public.erp_workflow_items
  for select
  to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or public.erp_module_permission(module_id, 'view')
  );

drop policy if exists erp_workflow_items_manage on public.erp_workflow_items;
create policy erp_workflow_items_manage on public.erp_workflow_items
  for all
  to authenticated
  using (public.is_admin() or public.has_permission('modules.manage'))
  with check (public.is_admin() or public.has_permission('modules.manage'));

-- ---------------------------------------------------------------------------
-- 6. Receipt / letter templates
-- ---------------------------------------------------------------------------
create table if not exists public.erp_receipt_templates (
  id uuid primary key default gen_random_uuid(),
  module_id text not null references public.erp_modules (id) on delete cascade,
  name text not null,
  receipt_kind text not null default 'receipt',
  college_id uuid references public.colleges (id) on delete set null,
  template jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_receipt_templates_module_idx
  on public.erp_receipt_templates (module_id);

alter table public.erp_receipt_templates enable row level security;

grant select on public.erp_receipt_templates to authenticated;
grant insert, update, delete on public.erp_receipt_templates to authenticated;

drop policy if exists erp_receipt_templates_read on public.erp_receipt_templates;
create policy erp_receipt_templates_read on public.erp_receipt_templates
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('settings.manage')
    or public.erp_module_permission(module_id, 'view')
  );

drop policy if exists erp_receipt_templates_manage on public.erp_receipt_templates;
create policy erp_receipt_templates_manage on public.erp_receipt_templates
  for all
  to authenticated
  using (public.is_admin() or public.has_permission('settings.manage'))
  with check (public.is_admin() or public.has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- 7. Custom report definitions and saved runs
-- ---------------------------------------------------------------------------
create table if not exists public.erp_report_definitions (
  id uuid primary key default gen_random_uuid(),
  module_id text not null references public.erp_modules (id) on delete cascade,
  name text not null,
  description text not null default '',
  base_table text not null,
  columns jsonb not null default '[]'::jsonb,
  filters jsonb not null default '[]'::jsonb,
  chart_type text not null default 'table',
  allowed_roles text[] not null default '{}'::text[],
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_report_definitions_module_idx
  on public.erp_report_definitions (module_id);

alter table public.erp_report_definitions enable row level security;

grant select on public.erp_report_definitions to authenticated;
grant insert, update, delete on public.erp_report_definitions to authenticated;

drop policy if exists erp_report_definitions_read on public.erp_report_definitions;
create policy erp_report_definitions_read on public.erp_report_definitions
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('reports.read')
    or allowed_roles = '{}'::text[]
    or allowed_roles @> ARRAY[public.effective_login_role()]
  );

drop policy if exists erp_report_definitions_manage on public.erp_report_definitions;
create policy erp_report_definitions_manage on public.erp_report_definitions
  for all
  to authenticated
  using (public.is_admin() or public.has_permission('reports.manage'))
  with check (public.is_admin() or public.has_permission('reports.manage'));

create table if not exists public.erp_saved_reports (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid references public.erp_report_definitions (id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.erp_saved_reports enable row level security;

grant select on public.erp_saved_reports to authenticated;
grant insert, update, delete on public.erp_saved_reports to authenticated;

drop policy if exists erp_saved_reports_read on public.erp_saved_reports;
create policy erp_saved_reports_read on public.erp_saved_reports
  for select
  to authenticated
  using (public.is_admin() or user_id = auth.uid());

drop policy if exists erp_saved_reports_manage on public.erp_saved_reports;
create policy erp_saved_reports_manage on public.erp_saved_reports
  for all
  to authenticated
  using (public.is_admin() or user_id = auth.uid() or public.has_permission('reports.manage'))
  with check (public.is_admin() or user_id = auth.uid() or public.has_permission('reports.manage'));

-- ---------------------------------------------------------------------------
-- 8. Notification centre
-- ---------------------------------------------------------------------------
create table if not exists public.erp_notifications (
  id uuid primary key default gen_random_uuid(),
  module_id text references public.erp_modules (id) on delete set null,
  title text not null,
  body text not null default '',
  severity text not null default 'info',
  target_role text,
  target_user uuid references public.profiles (id) on delete cascade,
  audience text[] not null default '{}'::text[],
  course_id uuid references public.courses (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint erp_notifications_severity check (
    severity in ('info', 'success', 'warning', 'error')
  )
);

create index if not exists erp_notifications_created_idx
  on public.erp_notifications (created_at desc);

alter table public.erp_notifications enable row level security;

grant select on public.erp_notifications to authenticated;
grant insert, update, delete on public.erp_notifications to authenticated;

drop policy if exists erp_notifications_read on public.erp_notifications;
create policy erp_notifications_read on public.erp_notifications
  for select
  to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or target_user = auth.uid()
    or (
      target_role is not null
      and target_role = public.effective_login_role()
    )
    or audience = '{}'::text[]
    or audience @> ARRAY[public.effective_login_role()]
    or audience @> ARRAY['all']
  );

drop policy if exists erp_notifications_manage on public.erp_notifications;
create policy erp_notifications_manage on public.erp_notifications
  for all
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('communication.manage')
    or created_by = auth.uid()
  )
  with check (
    public.is_admin()
    or public.has_permission('communication.manage')
    or created_by = auth.uid()
  );

create table if not exists public.erp_notification_reads (
  notification_id uuid not null references public.erp_notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.erp_notification_reads enable row level security;

grant select on public.erp_notification_reads to authenticated;
grant insert, update, delete on public.erp_notification_reads to authenticated;

drop policy if exists erp_notification_reads_read on public.erp_notification_reads;
create policy erp_notification_reads_read on public.erp_notification_reads
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists erp_notification_reads_manage on public.erp_notification_reads;
create policy erp_notification_reads_manage on public.erp_notification_reads
  for all
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. Audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.erp_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null default '',
  action text not null,
  actor_id uuid,
  actor_role text,
  before_data jsonb,
  after_data jsonb,
  at timestamptz not null default now()
);

create index if not exists erp_audit_log_table_idx
  on public.erp_audit_log (table_name, at desc);

alter table public.erp_audit_log enable row level security;

grant select on public.erp_audit_log to authenticated;

drop policy if exists erp_audit_log_read on public.erp_audit_log;
create policy erp_audit_log_read on public.erp_audit_log
  for select
  to authenticated
  using (public.is_admin() or public.has_permission('audit.read'));

-- ---------------------------------------------------------------------------
-- 10. Helper functions
-- ---------------------------------------------------------------------------

-- Everything the client needs to render the navigation for the signed-in
-- account. The client never decides access on its own.
create or replace function public.get_my_erp_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'role', public.effective_login_role(),
    'is_admin', public.is_admin(),
    'modules', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', module.id,
            'number', module.number,
            'title', module.title,
            'enabled', module.enabled,
            'portal', module.portal,
            'entry_page', module.entry_page,
            'display_order', module.display_order,
            'permissions', case when public.is_admin() then jsonb_build_object(
              'view', true, 'create', true, 'edit', true,
              'delete', true, 'export', true, 'approve', true
            ) else (
              select jsonb_build_object(
                'view', permission.can_view,
                'create', permission.can_create,
                'edit', permission.can_edit,
                'delete', permission.can_delete,
                'export', permission.can_export,
                'approve', permission.can_approve
              )
              from public.erp_module_permissions permission
              where permission.module_id = module.id
                and permission.role_code = public.effective_login_role()
            ) end
          )
          order by module.display_order, module.number
        )
        from public.erp_modules module
        where module.enabled
          and (
            public.is_admin()
            or exists (
              select 1
              from public.erp_module_permissions permission
              where permission.module_id = module.id
                and permission.role_code = public.effective_login_role()
                and permission.can_view
            )
          )
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_my_erp_access() from public;
grant execute on function public.get_my_erp_access() to authenticated;

-- Publish a notification into the notification centre.
create or replace function public.erp_notify(
  p_module_id text,
  p_title text,
  p_body text default '',
  p_severity text default 'info',
  p_target_role text default null,
  p_target_user uuid default null,
  p_audience text[] default '{}'::text[],
  p_course_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'A notification needs a title';
  end if;

  insert into public.erp_notifications (
    module_id, title, body, severity, target_role, target_user,
    audience, course_id, created_by
  )
  values (
    p_module_id,
    trim(p_title),
    coalesce(p_body, ''),
    coalesce(p_severity, 'info'),
    nullif(trim(coalesce(p_target_role, '')), ''),
    p_target_user,
    coalesce(p_audience, '{}'::text[]),
    p_course_id,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.erp_notify(text, text, text, text, text, uuid, text[], uuid) from public;
grant execute on function public.erp_notify(text, text, text, text, text, uuid, text[], uuid) to authenticated;

-- Move a workflow item one step forward. Only the role that owns the current
-- step may act on it, and every transition is written to the audit trail.
create or replace function public.erp_workflow_action(
  p_item_id uuid,
  p_action text,
  p_comment text default ''
)
returns public.erp_workflow_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.erp_workflow_items;
  v_workflow public.erp_approval_workflows;
  v_steps jsonb;
  v_step jsonb;
  v_role text;
  v_history jsonb;
  v_next integer;
  v_status text;
begin
  select * into v_item from public.erp_workflow_items where id = p_item_id;
  if not found then
    raise exception 'The workflow item was not found';
  end if;
  if v_item.status <> 'pending' then
    raise exception 'This workflow item is already %', v_item.status;
  end if;

  select * into v_workflow from public.erp_approval_workflows where id = v_item.workflow_id;
  if not found or not v_workflow.enabled then
    raise exception 'The approval workflow is not active';
  end if;

  v_steps := coalesce(v_workflow.steps, '[]'::jsonb);
  v_step := v_steps -> v_item.current_step;
  if v_step is null then
    raise exception 'This workflow item has no further step';
  end if;

  v_role := public.effective_login_role();
  if not public.is_admin() then
    if v_step ->> 'role_code' is distinct from v_role then
      raise exception 'Only the % role can act on this step',
        coalesce(v_step ->> 'role_code', 'assigned');
    end if;
  end if;

  v_history := coalesce(v_item.history, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'step', v_item.current_step,
      'role_code', v_role,
      'action', lower(trim(coalesce(p_action, ''))),
      'comment', coalesce(p_comment, ''),
      'at', now()
    )
  );

  if lower(trim(coalesce(p_action, ''))) = 'reject' then
    v_next := v_item.current_step;
    v_status := 'rejected';
  elsif lower(trim(coalesce(p_action, ''))) = 'cancel' then
    v_next := v_item.current_step;
    v_status := 'cancelled';
  elsif lower(trim(coalesce(p_action, ''))) = 'approve' then
    v_next := v_item.current_step + 1;
    v_status := case when v_next >= jsonb_array_length(v_steps) then 'approved' else 'pending' end;
  else
    raise exception 'Unknown workflow action %', p_action;
  end if;

  update public.erp_workflow_items
  set current_step = v_next,
      status = v_status,
      history = v_history,
      updated_at = now()
  where id = p_item_id
  returning * into v_item;

  insert into public.erp_audit_log (
    table_name, record_id, action, actor_id, actor_role, before_data, after_data
  )
  values (
    'erp_workflow_items',
    p_item_id::text,
    lower(trim(coalesce(p_action, ''))),
    auth.uid(),
    v_role,
    jsonb_build_object('status', v_status, 'step', v_next),
    jsonb_build_object('history', v_history)
  );

  return v_item;
end;
$$;

revoke all on function public.erp_workflow_action(uuid, text, text) from public;
grant execute on function public.erp_workflow_action(uuid, text, text) to authenticated;

-- Generic audit trigger. Every domain table writes its changes here.
create or replace function public.erp_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.erp_audit_log (
    table_name, record_id, action, actor_id, actor_role, before_data, after_data
  )
  values (
    tg_table_name,
    coalesce((to_jsonb(coalesce(new, old)) ->> 'id'), ''),
    lower(tg_op),
    auth.uid(),
    public.effective_login_role(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.erp_audit_trigger() from public;

-- ---------------------------------------------------------------------------
-- 11. The 25 modules
-- ---------------------------------------------------------------------------
insert into public.erp_modules (
  id, number, title, description, icon, portal, entry_page, permission_page, enabled, display_order
)
values
  ('super_admin', 1, 'Super Admin Management', 'Users, roles, module registry, permissions, audit trail and system settings', '🛠️', 'super_admin', 'Super Admin Dashboard', 'Manage Users', true, 10),
  ('admissions', 2, 'Admission & Inquiry Management', 'Inquiries, applications, final admissions, seat intake, forms, fees and merit', '🗂️', 'admissions', 'Dashboard', 'Final Admissions', true, 20),
  ('students', 3, 'Student Management', 'Student master, profile, documents, ID cards, attendance, fees, transport and hostel', '🧑‍🎓', 'student_management', 'Student Management', 'Student Management', true, 30),
  ('faculty', 4, 'Faculty Management', 'Faculty master, profile, teaching load, leave, attendance and payroll summary', '🧑‍🏫', 'college_info', 'Faculty', 'Faculty', true, 40),
  ('accounts', 5, 'Accounts & Finance', 'Ledger heads, vouchers, receipts, payables, receivables, reconciliation and budgets', '💰', 'accounts', 'Accounts Dashboard', 'Payments', true, 50),
  ('transport', 6, 'Transport Management', 'Routes, vehicles, drivers, allocations, daily attendance and maintenance', '🚌', 'transport', 'Transport Dashboard', 'Transport Dashboard', true, 60),
  ('academics', 7, 'Academic Management', 'Academic years, semesters, curriculum, credits, course outcomes and department records', '📚', 'academics', 'Academic Dashboard', 'Academic Dashboard', true, 70),
  ('timetable', 8, 'Timetable Management', 'Weekly timetable, slots, rooms, substitutions and faculty workload', '🕐', 'timetable', 'Timetable Dashboard', 'Timetable Dashboard', true, 80),
  ('attendance', 9, 'Attendance Management', 'Student and faculty attendance, daily register, defaulters and regularisation', '✅', 'attendance', 'Attendance Dashboard', 'Attendance', true, 90),
  ('examinations', 10, 'Examination Management', 'Exams, schedules, seating plans, marks, results, marksheets and revaluation', '🧮', 'examinations', 'Examination Dashboard', 'Examination Dashboard', true, 100),
  ('departments', 11, 'Department & HOD Management', 'Departments, HOD assignment, department faculty, students, results and targets', '🏛️', 'departments', 'Department Dashboard', 'Department Dashboard', true, 110),
  ('hr', 12, 'HR & Payroll', 'Employee directory, leave policies and balances, payroll runs, payslips and advances', '🧑‍💼', 'hr', 'HR Dashboard', 'HR Dashboard', true, 120),
  ('library', 13, 'Library Management', 'Catalogue, accessions, issue and return, reservations, fines and members', '📖', 'library', 'Library Dashboard', 'Library Dashboard', true, 130),
  ('hostel', 14, 'Hostel Management', 'Hostels, blocks, rooms, allocations, warden, attendance, maintenance and fees', '🏠', 'hostel', 'Hostel Dashboard', 'Hostel Dashboard', true, 140),
  ('id_cards', 15, 'Smart ID Card', 'Issue, print, reprint, revoke and QR verification of smart identity cards', '🪪', 'student_management', 'ID Cards', 'ID Cards', true, 150),
  ('communication', 16, 'Communication & Notification', 'Notice board, notification centre, message templates and broadcasts', '📨', 'communication', 'Communication Dashboard', 'Communication Dashboard', true, 160),
  ('parents', 17, 'Parent Portal', 'Linked guardians with read-only access to their child', '👨‍👩‍👧', 'parents', 'Parent Dashboard', 'Parent Dashboard', true, 170),
  ('student_portal', 18, 'Student Portal', 'Application, documents, fees, attendance, timetable, results, library and certificates', '🎓', 'student_portal', 'Student Portal', 'Student Portal', true, 180),
  ('inventory', 19, 'Inventory & Purchase', 'Item master, stock register, suppliers, purchase orders, goods receipt and audit', '📦', 'inventory', 'Inventory Dashboard', 'Inventory Dashboard', true, 190),
  ('placement', 20, 'Placement & Training', 'Recruiters, drives, applications, offers, placement records and training', '🎯', 'placement', 'Placement Dashboard', 'Placement Dashboard', true, 200),
  ('certificates', 21, 'Certificate Management', 'Templates, requests, issuance, print and verification of certificates', '📜', 'certificates', 'Certificate Dashboard', 'Certificate Dashboard', true, 210),
  ('website', 22, 'College Website & Public Portal', 'Pages, posts, events, gallery, menus and public announcements', '🌐', 'website', 'Website Dashboard', 'Website Dashboard', true, 220),
  ('helpdesk', 23, 'Grievance & Helpdesk', 'Tickets, categories, SLA rules, escalation and knowledge base', '🎧', 'helpdesk', 'Helpdesk Dashboard', 'Helpdesk Dashboard', true, 230),
  ('reports', 24, 'Reports & Analytics', 'Admission, academic, financial and attendance analytics plus custom reports', '📈', 'reports', 'Analytics Dashboard', 'Reports', true, 240),
  ('settings', 25, 'System Configuration', 'General settings, module timings, flags, receipt templates and approval workflows', '⚙️', 'settings', 'Configuration Dashboard', 'Configuration Dashboard', true, 250)
on conflict (id) do update set
  number = excluded.number,
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  portal = excluded.portal,
  entry_page = excluded.entry_page,
  permission_page = excluded.permission_page,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 12. New staff roles (additive only, no user is touched)
-- ---------------------------------------------------------------------------
insert into public.staff_roles (code, label)
values
  ('principal', 'Principal'),
  ('transport_manager', 'Transport Manager'),
  ('accounts_officer', 'Accounts Officer'),
  ('hr_manager', 'HR & Payroll Manager'),
  ('librarian', 'Librarian'),
  ('hostel_warden', 'Hostel Warden'),
  ('exam_controller', 'Examination Controller'),
  ('placement_officer', 'Placement Officer'),
  ('inventory_manager', 'Inventory Manager'),
  ('certificate_officer', 'Certificate Officer'),
  ('website_editor', 'Website Editor'),
  ('helpdesk_agent', 'Helpdesk Agent'),
  ('parent', 'Parent'),
  ('counsellor', 'Admission Counsellor')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 13. Default module permissions
--     The administrator always passes the matrix check. Every other role only
--     receives what it actually needs.
-- ---------------------------------------------------------------------------
insert into public.erp_module_permissions (
  module_id, role_code, can_view, can_create, can_edit, can_delete, can_export, can_approve
)
select
  module.id,
  grants.role_code,
  grants.can_view,
  grants.can_create,
  grants.can_edit,
  grants.can_delete,
  grants.can_export,
  grants.can_approve
from public.erp_modules module
cross join lateral (
  values
    -- Super admin and administrative staff
    ('authority', 'super_admin', true, true, true, false, true, true),
    ('authority', 'admissions', true, true, true, false, true, true),
    ('authority', 'students', true, true, true, false, true, false),
    ('authority', 'faculty', true, true, true, false, true, false),
    ('authority', 'academics', true, true, true, false, true, false),
    ('authority', 'timetable', true, true, true, false, true, false),
    ('authority', 'attendance', true, true, false, false, true, false),
    ('authority', 'departments', true, false, false, false, true, false),
    ('authority', 'examinations', true, false, false, false, true, false),
    ('authority', 'reports', true, false, false, false, true, false),
    ('principal', 'super_admin', true, false, false, false, true, false),
    ('principal', 'admissions', true, false, false, false, true, true),
    ('principal', 'students', true, false, false, false, true, false),
    ('principal', 'faculty', true, false, false, false, true, false),
    ('principal', 'academics', true, false, false, false, true, false),
    ('principal', 'timetable', true, false, false, false, true, false),
    ('principal', 'attendance', true, false, false, false, true, false),
    ('principal', 'departments', true, false, false, false, true, true),
    ('principal', 'examinations', true, false, false, false, true, true),
    ('principal', 'accounts', true, false, false, false, true, false),
    ('principal', 'hr', true, false, false, false, true, true),
    ('principal', 'library', true, false, false, false, true, false),
    ('principal', 'hostel', true, false, false, false, true, false),
    ('principal', 'transport', true, false, false, false, true, false),
    ('principal', 'reports', true, false, false, false, true, false),
    ('department_head', 'students', true, true, true, false, true, false),
    ('department_head', 'faculty', true, true, true, false, true, false),
    ('department_head', 'academics', true, true, true, false, true, false),
    ('department_head', 'timetable', true, true, true, false, true, false),
    ('department_head', 'attendance', true, true, true, false, true, true),
    ('department_head', 'departments', true, true, true, false, true, false),
    ('department_head', 'examinations', true, false, false, false, true, false),
    ('department_head', 'helpdesk', true, true, false, false, true, false),
    ('department_head', 'reports', true, false, false, false, true, false),
    ('faculty', 'faculty', true, false, true, false, true, false),
    ('faculty', 'timetable', true, false, true, false, true, false),
    ('faculty', 'attendance', true, true, false, false, true, false),
    ('faculty', 'academics', true, false, false, false, true, false),
    ('faculty', 'library', true, false, false, false, false, false),
    ('faculty', 'helpdesk', true, true, false, false, false, false),
    ('faculty', 'hr', true, false, false, false, false, false),
    ('data_entry', 'admissions', true, true, false, false, true, false),
    ('data_entry', 'students', true, true, false, false, false, false),
    ('data_entry', 'communication', true, true, false, false, false, false),
    ('fees_collection', 'accounts', true, true, true, false, true, false),
    ('fees_collection', 'admissions', true, false, false, false, true, false),
    ('fees_collection', 'reports', true, false, false, false, true, false),
    ('accounts_officer', 'accounts', true, true, true, true, true, true),
    ('accounts_officer', 'reports', true, false, false, false, true, false),
    ('transport_manager', 'transport', true, true, true, false, true, false),
    ('hr_manager', 'hr', true, true, true, false, true, true),
    ('hr_manager', 'faculty', true, false, false, false, true, false),
    ('librarian', 'library', true, true, true, false, true, false),
    ('librarian', 'students', true, false, false, false, false, false),
    ('hostel_warden', 'hostel', true, true, true, false, true, false),
    ('hostel_warden', 'students', true, false, false, false, false, false),
    ('exam_controller', 'examinations', true, true, true, false, true, true),
    ('exam_controller', 'reports', true, false, false, false, true, false),
    ('placement_officer', 'placement', true, true, true, false, true, false),
    ('placement_officer', 'students', true, false, false, false, true, false),
    ('inventory_manager', 'inventory', true, true, true, false, true, false),
    ('certificate_officer', 'certificates', true, true, true, false, true, true),
    ('website_editor', 'website', true, true, true, false, true, false),
    ('website_editor', 'communication', true, true, false, false, true, false),
    ('helpdesk_agent', 'helpdesk', true, true, false, false, true, false),
    ('parent', 'parents', true, false, false, false, true, false),
    ('parent', 'helpdesk', true, true, false, false, false, false),
    ('student', 'student_portal', true, false, false, false, true, false),
    ('student', 'admissions', true, true, false, false, false, false),
    ('student', 'helpdesk', true, true, false, false, false, false)
) as grants(role_code, module_id, can_view, can_create, can_edit, can_delete, can_export, can_approve)
where grants.module_id = module.id
on conflict (module_id, role_code) do nothing;

-- ---------------------------------------------------------------------------
-- 14. Login modules for the new roles
-- ---------------------------------------------------------------------------
insert into public.login_modules (
  id, name, description, icon, portal_id, entry_page, display_order, enabled, allowed_roles
)
values
  ('principal_login', 'Principal', 'College-wide approvals, academic oversight and reports', '🎓', 'super_admin', 'Super Admin Dashboard', 9, true, array['principal']),
  ('accounts_officer_login', 'Accounts', 'Ledger, vouchers, receipts, reconciliation and budgets', '💰', 'accounts', 'Accounts Dashboard', 10, true, array['accounts_officer']),
  ('transport_login', 'Transport', 'Routes, vehicles, drivers and student allocations', '🚌', 'transport', 'Transport Dashboard', 11, true, array['transport_manager']),
  ('hr_login', 'HR & Payroll', 'Leave policies, payroll runs, payslips and advances', '🧑‍💼', 'hr', 'HR Dashboard', 12, true, array['hr_manager']),
  ('library_login', 'Library', 'Catalogue, issue and return, reservations and fines', '📖', 'library', 'Library Dashboard', 13, true, array['librarian']),
  ('hostel_login', 'Hostel', 'Rooms, allocations, warden and hostel attendance', '🏠', 'hostel', 'Hostel Dashboard', 14, true, array['hostel_warden']),
  ('exam_login', 'Examination', 'Exam schedules, marks entry, results and marksheets', '🧮', 'examinations', 'Examination Dashboard', 15, true, array['exam_controller']),
  ('placement_login', 'Placement', 'Recruiters, drives, offers and training programmes', '🎯', 'placement', 'Placement Dashboard', 16, true, array['placement_officer']),
  ('inventory_login', 'Inventory', 'Item master, purchase orders and stock register', '📦', 'inventory', 'Inventory Dashboard', 17, true, array['inventory_manager']),
  ('certificate_login', 'Certificates', 'Templates, requests, issuance and verification', '📜', 'certificates', 'Certificate Dashboard', 18, true, array['certificate_officer']),
  ('website_login', 'Website', 'Pages, posts, events and public announcements', '🌐', 'website', 'Website Dashboard', 19, true, array['website_editor']),
  ('helpdesk_login', 'Helpdesk', 'Grievance tickets, responses and escalation', '🎧', 'helpdesk', 'Helpdesk Dashboard', 20, true, array['helpdesk_agent']),
  ('parent_login', 'Parent', 'Attendance, fees, results and notices of your child', '👨‍👩‍👧', 'parents', 'Parent Dashboard', 21, true, array['parent']),
  ('counsellor_login', 'Counsellor', 'Inquiry follow-up and applicant counselling', '🗣️', 'admissions', 'Inquiries', 22, true, array['counsellor'])
on conflict (id) do nothing;

-- The new portal routes become visible on the module chooser screen.
insert into public.login_portal_settings (id, title, description, icon, visible_to_public, display_order, active)
values
  ('accounts', 'Accounts & Finance', 'Ledger, vouchers, receipts and budgets', '💰', true, 30, true),
  ('transport', 'Transport Management', 'Routes, vehicles, drivers and allocations', '🚌', true, 31, true),
  ('academics', 'Academic Management', 'Curriculum, credits and academic records', '📚', true, 32, true),
  ('attendance', 'Attendance Management', 'Registers, defaulters and regularisation', '✅', true, 33, true),
  ('examinations', 'Examination Management', 'Schedules, marks, results and marksheets', '🧮', true, 34, true),
  ('departments', 'Department & HOD', 'Departments, HOD assignment and targets', '🏛️', true, 35, true),
  ('hr', 'HR & Payroll', 'Leave, payroll runs and payslips', '🧑‍💼', true, 36, true),
  ('library', 'Library Management', 'Catalogue, issues, reservations and fines', '📖', true, 37, true),
  ('hostel', 'Hostel Management', 'Rooms, allocations and warden records', '🏠', true, 38, true),
  ('communication', 'Communication & Notification', 'Notice board, templates and broadcasts', '📨', true, 39, true),
  ('parents', 'Parent Portal', 'Your child at a glance', '👨‍👩‍👧', true, 40, true),
  ('student_portal', 'Student Portal', 'Applications, fees, attendance and results', '🎓', true, 41, true),
  ('inventory', 'Inventory & Purchase', 'Items, suppliers, purchase orders and stock', '📦', true, 42, true),
  ('placement', 'Placement & Training', 'Drives, offers and training', '🎯', true, 43, true),
  ('certificates', 'Certificate Management', 'Templates, requests and issuance', '📜', true, 44, true),
  ('website', 'College Website', 'Pages, posts and public announcements', '🌐', true, 45, true),
  ('helpdesk', 'Grievance & Helpdesk', 'Tickets and escalation', '🎧', true, 46, true),
  ('reports', 'Reports & Analytics', 'Analytics and custom reports', '📈', true, 47, true),
  ('settings', 'System Configuration', 'Settings, timings, workflows and templates', '⚙️', false, 48, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 15. Page permissions for the new roles
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_code, permission)
select grants.role_code, 'page:' || page_name
from (values
  ('counsellor', array['Dashboard', 'Inquiries', 'Final Admissions', 'Faculty', 'Subjects']::text[]),
  ('accounts_officer', array['Dashboard', 'Payments', 'Fee Assignments', 'Fee Structures', 'Reports']::text[]),
  ('transport_manager', array['Dashboard', 'Transport Dashboard', 'Transport Routes', 'Transport Vehicles']::text[]),
  ('hr_manager', array['Dashboard', 'HR Dashboard', 'Payroll Runs', 'Payslips', 'Leave Approvals']::text[]),
  ('librarian', array['Dashboard', 'Library Dashboard', 'Library Catalogue', 'Library Issues']::text[]),
  ('hostel_warden', array['Dashboard', 'Hostel Dashboard', 'Hostel Rooms', 'Hostel Allocations']::text[]),
  ('exam_controller', array['Dashboard', 'Examination Dashboard', 'Exams', 'Exam Results', 'Marksheets']::text[]),
  ('placement_officer', array['Dashboard', 'Placement Dashboard', 'Placement Drives', 'Training Programmes']::text[]),
  ('inventory_manager', array['Dashboard', 'Inventory Dashboard', 'Inventory Items', 'Purchase Orders']::text[]),
  ('certificate_officer', array['Dashboard', 'Certificate Dashboard', 'Certificate Templates', 'Certificates']::text[]),
  ('website_editor', array['Dashboard', 'Website Dashboard', 'Web Pages', 'Web Posts']::text[]),
  ('helpdesk_agent', array['Dashboard', 'Helpdesk Dashboard', 'Tickets', 'My Tickets']::text[]),
  ('parent', array['Dashboard', 'Parent Dashboard', 'My Children', 'Parent Notices']::text[]),
  ('principal', array['Dashboard', 'Super Admin Dashboard', 'Users & Roles', 'Roles & Permissions', 'Module Registry', 'Login Modules', 'Audit Trail']::text[]),
  ('id_card', array['Dashboard', 'ID Cards', 'ID Card Templates']::text[])
) as grants(role_code, pages)
cross join lateral unnest(grants.pages) as pages(page_name)
on conflict (role_code, permission) do nothing;

insert into public.role_permissions (role_code, permission)
values
  ('counsellor', 'inquiries.read'),
  ('counsellor', 'inquiries.manage'),
  ('accounts_officer', 'fees.manage'),
  ('accounts_officer', 'reports.read'),
  ('transport_manager', 'transport.manage'),
  ('hr_manager', 'hr.manage'),
  ('hr_manager', 'payroll.manage'),
  ('hr_manager', 'reports.read'),
  ('librarian', 'library.manage'),
  ('hostel_warden', 'hostel.manage'),
  ('exam_controller', 'examinations.manage'),
  ('placement_officer', 'placement.manage'),
  ('inventory_manager', 'inventory.manage'),
  ('certificate_officer', 'certificates.manage'),
  ('website_editor', 'website.manage'),
  ('website_editor', 'communication.manage'),
  ('helpdesk_agent', 'helpdesk.manage'),
  ('parent', 'parents.read')
on conflict (role_code, permission) do nothing;
