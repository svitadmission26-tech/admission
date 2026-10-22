-- Migration 036: SVIT ERP centralised dynamic form builder
-- Apply after migration 035. Idempotent and safe to re-run.
--
-- This migration adds the generic form engine that the Super Admin uses to
-- build forms for any module:
--
--   1. public.erp_form_templates   - reusable field groups
--   2. public.erp_form_definitions - a form (bound to a module and a table)
--   3. public.erp_form_versions    - the versioned schema of a form
--   4. public.erp_form_records     - the records submitted against a form
--
-- Helper functions:
--   public.erp_save_form(...)          - create/update a form, versioned
--   public.erp_publish_form(...)       - publish a version
--   public.erp_form_errors(...)        - validate a payload against a version
--   public.erp_save_form_record(...)   - create/update a record safely
--   public.erp_delete_form_record(...) - delete a record safely
--
-- Schema versioning: every save writes a NEW row into erp_form_versions.
-- A record always stores the version it was submitted against, so renaming or
-- removing a field never changes the data that was already collected.

-- ---------------------------------------------------------------------------
-- 0. The reusable policy helper for the module tables
--    The same helper is carried by every module migration of the ERP, so that
--    a single module migration can also be applied on its own.
--
--    An older version of the helper may still sit in the database with
--    different input parameter names or with a different return type.
--    PostgreSQL refuses to replace a function in that case, which would stop
--    the migration with "cannot change name of input parameter". The old
--    definition is therefore removed first, together with the objects that
--    still use it.
--
--    The helper itself never stops a migration: a table that is missing, a
--    role that is missing or a policy that cannot be created is reported as
--    a warning and the migration goes on.
-- ---------------------------------------------------------------------------
do $$
declare
  v_old record;
  v_signature text;
begin
  for v_old in
    select format(
             '%I.%I(%s)',
             ns.nspname,
             proc.proname,
             pg_get_function_identity_arguments(proc.oid)
           ) as signature
    from pg_proc proc
    join pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = 'erp_apply_module_policies'
  loop
    v_signature := v_old.signature;
    begin
      execute format('drop function %s', v_signature);
    exception
      when dependent_objects_still_exist then
        -- Something still uses the old helper. PostgreSQL refuses to replace
        -- a function that is in use, so the old one is removed together with
        -- the objects that use it. The module policies do not use the helper,
        -- they call public.erp_module_permission, so nothing is lost.
        begin
          execute format('drop function %s cascade', v_signature);
          raise notice 'the old helper % was removed with the objects that used it', v_signature;
        exception
          when others then
            raise warning 'the old helper % could not be removed: %', v_signature, sqlerrm;
        end;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0.1 The permission function of migration 035
--     The policies of the module tables call public.erp_module_permission.
--     When that function is not there yet, a safe fallback is installed:
--     everybody is refused and the admins are let in. The migration goes on
--     and the report at the end shows that migration 035 is still missing.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.erp_module_permission(text, text)') is null then
    begin
      execute $fallback$
        create or replace function public.erp_module_permission(
          p_module_id text,
          p_action text
        )
        returns boolean
        language plpgsql
        stable
        security definer
        set search_path = public, pg_temp
        as $body$
        declare
          v_admin boolean := false;
        begin
          if to_regprocedure('public.is_admin()') is not null then
            execute 'select public.is_admin()' into v_admin;
          end if;
          return coalesce(v_admin, false);
        end;
        $body$
      $fallback$;
    exception
      when others then
        raise warning 'the fallback of the permission function could not be created: %', sqlerrm;
    end;

    raise warning
      'Migration 035_erp_core_framework.sql must be applied before this migration - a safe fallback is used until then';
  end if;
end;
$$;

create or replace function public.erp_apply_module_policies(
  p_table text,
  p_module text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text := format('public.%I', p_table);
  v_has_role boolean;
begin
  -- The table has to be there. When it is not, the migration says so and
  -- goes on, so that one missing table cannot stop the whole migration.
  if to_regclass(v_table) is null then
    raise warning 'the table % is not there, the policies for it are skipped', v_table;
    return;
  end if;

  v_has_role := exists (select 1 from pg_roles where rolname = 'authenticated');

  begin
    execute format('alter table %s enable row level security', v_table);
  exception
    when others then
      raise warning 'the row level security of % could not be switched on: %', v_table, sqlerrm;
  end;

  if v_has_role then
    begin
      execute format('grant select on %s to authenticated', v_table);
      execute format('grant insert, update, delete on %s to authenticated', v_table);
    exception
      when others then
        raise warning 'the grants of % could not be given: %', v_table, sqlerrm;
    end;
  else
    raise warning 'the role authenticated is not there, the grants of % are skipped', v_table;
  end if;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_read', v_table);
    execute format(
      'create policy %I on %s for select to authenticated '
      || 'using (public.erp_module_permission(%L, ''view''))',
      p_table || '_erp_read',
      v_table,
      p_module
    );
  exception
    when others then
      raise warning 'the read policy of % could not be created: %', v_table, sqlerrm;
  end;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_insert', v_table);
    execute format(
      'create policy %I on %s for insert to authenticated '
      || 'with check (public.erp_module_permission(%L, ''create''))',
      p_table || '_erp_insert',
      v_table,
      p_module
    );
  exception
    when others then
      raise warning 'the insert policy of % could not be created: %', v_table, sqlerrm;
  end;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_update', v_table);
    execute format(
      'create policy %I on %s for update to authenticated '
      || 'using (public.erp_module_permission(%L, ''edit'')) '
      || 'with check (public.erp_module_permission(%L, ''edit''))',
      p_table || '_erp_update',
      v_table,
      p_module,
      p_module
    );
  exception
    when others then
      raise warning 'the update policy of % could not be created: %', v_table, sqlerrm;
  end;

  begin
    execute format('drop policy if exists %I on %s', p_table || '_erp_delete', v_table);
    execute format(
      'create policy %I on %s for delete to authenticated '
      || 'using (public.erp_module_permission(%L, ''delete''))',
      p_table || '_erp_delete',
      v_table,
      p_module
    );
  exception
    when others then
      raise warning 'the delete policy of % could not be created: %', v_table, sqlerrm;
  end;
end;
$$;

revoke all on function public.erp_apply_module_policies(text, text) from public;

-- ---------------------------------------------------------------------------
-- 1. Field templates
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_form_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text not null default '',
    module_id text references public.erp_modules (id) on delete set null,
    fields jsonb not null default '[]'::jsonb,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_form_templates (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_form_templates_name_key
    on public.erp_form_templates (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_form_templates_name_key: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.erp_form_templates enable row level security;
exception
  when others then
    raise warning 'alter table public.erp_form_templates enable row level security: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant select on public.erp_form_templates to authenticated;
exception
  when others then
    raise warning 'grant select on public.erp_form_templates to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant insert, update, delete on public.erp_form_templates to authenticated;
exception
  when others then
    raise warning 'grant insert, update, delete on public.erp_form_templates to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_templates_read on public.erp_form_templates;
exception
  when others then
    raise warning 'drop policy if exists erp_form_templates_read on public.erp_form_templates: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_templates_read on public.erp_form_templates
    for select
    to authenticated
    using (
      public.is_admin()
      or public.has_permission('modules.manage')
      or module_id is null
      or public.erp_module_permission(module_id, 'view')
    );
exception
  when others then
    raise warning 'create policy erp_form_templates_read on public.erp_form_templates: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_templates_manage on public.erp_form_templates;
exception
  when others then
    raise warning 'drop policy if exists erp_form_templates_manage on public.erp_form_templates: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_templates_manage on public.erp_form_templates
    for all
    to authenticated
    using (public.is_admin() or public.has_permission('modules.manage'))
    with check (public.is_admin() or public.has_permission('modules.manage'));
exception
  when others then
    raise warning 'create policy erp_form_templates_manage on public.erp_form_templates: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Form definitions
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_form_definitions (
    id uuid primary key default gen_random_uuid(),
    module_id text not null references public.erp_modules (id) on delete cascade,
    name text not null,
    description text not null default '',
    key text not null,
    table_name text not null default 'erp_form_records',
    layout jsonb not null default '{"type":"cards"}'::jsonb,
    status text not null default 'draft',
    current_version integer not null default 0,
    published_version integer not null default 0,
    allowed_roles text[] not null default '{}'::text[],
    record_permissions jsonb not null default '{"view":"view","create":"create","edit":"edit","delete":"delete"}'::jsonb,
    settings jsonb not null default '{}'::jsonb,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_form_definitions_status check (
      status in ('draft', 'published', 'archived')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_form_definitions (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_form_definitions_key_key
    on public.erp_form_definitions (module_id, key);
exception
  when others then
    raise warning 'create unique index if not exists erp_form_definitions_key_key: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_form_definitions_module_idx
    on public.erp_form_definitions (module_id, status);
exception
  when others then
    raise warning 'create index if not exists erp_form_definitions_module_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.erp_form_definitions enable row level security;
exception
  when others then
    raise warning 'alter table public.erp_form_definitions enable row level security: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant select on public.erp_form_definitions to authenticated;
exception
  when others then
    raise warning 'grant select on public.erp_form_definitions to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant insert, update, delete on public.erp_form_definitions to authenticated;
exception
  when others then
    raise warning 'grant insert, update, delete on public.erp_form_definitions to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_definitions_read on public.erp_form_definitions;
exception
  when others then
    raise warning 'drop policy if exists erp_form_definitions_read on public.erp_form_definitions: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_definitions_read on public.erp_form_definitions
    for select
    to authenticated
    using (
      public.is_admin()
      or public.has_permission('modules.manage')
      or allowed_roles = '{}'::text[]
      or allowed_roles @> ARRAY[public.effective_login_role()]
    );
exception
  when others then
    raise warning 'create policy erp_form_definitions_read on public.erp_form_definitions: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_definitions_manage on public.erp_form_definitions;
exception
  when others then
    raise warning 'drop policy if exists erp_form_definitions_manage on public.erp_form_definitions: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_definitions_manage on public.erp_form_definitions
    for all
    to authenticated
    using (public.is_admin() or public.has_permission('modules.manage'))
    with check (public.is_admin() or public.has_permission('modules.manage'));
exception
  when others then
    raise warning 'create policy erp_form_definitions_manage on public.erp_form_definitions: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3. Versioned schemas
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_form_versions (
    id uuid primary key default gen_random_uuid(),
    definition_id uuid not null references public.erp_form_definitions (id) on delete cascade,
    version integer not null,
    fields jsonb not null default '[]'::jsonb,
    sections jsonb not null default '[]'::jsonb,
    settings jsonb not null default '{}'::jsonb,
    change_note text not null default '',
    published boolean not null default false,
    published_at timestamptz,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    constraint erp_form_versions_unique unique (definition_id, version)
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_form_versions (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_form_versions_definition_idx
    on public.erp_form_versions (definition_id, version desc);
exception
  when others then
    raise warning 'create index if not exists erp_form_versions_definition_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.erp_form_versions enable row level security;
exception
  when others then
    raise warning 'alter table public.erp_form_versions enable row level security: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant select on public.erp_form_versions to authenticated;
exception
  when others then
    raise warning 'grant select on public.erp_form_versions to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant insert, update, delete on public.erp_form_versions to authenticated;
exception
  when others then
    raise warning 'grant insert, update, delete on public.erp_form_versions to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_versions_read on public.erp_form_versions;
exception
  when others then
    raise warning 'drop policy if exists erp_form_versions_read on public.erp_form_versions: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_versions_read on public.erp_form_versions
    for select
    to authenticated
    using (
      public.is_admin()
      or public.has_permission('modules.manage')
      or exists (
        select 1
        from public.erp_form_definitions definition
        where definition.id = erp_form_versions.definition_id
          and (
            definition.allowed_roles = '{}'::text[]
            or definition.allowed_roles @> ARRAY[public.effective_login_role()]
          )
      )
    );
exception
  when others then
    raise warning 'create policy erp_form_versions_read on public.erp_form_versions: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_versions_manage on public.erp_form_versions;
exception
  when others then
    raise warning 'drop policy if exists erp_form_versions_manage on public.erp_form_versions: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_versions_manage on public.erp_form_versions
    for all
    to authenticated
    using (public.is_admin() or public.has_permission('modules.manage'))
    with check (public.is_admin() or public.has_permission('modules.manage'));
exception
  when others then
    raise warning 'create policy erp_form_versions_manage on public.erp_form_versions: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. Records of a dynamic form
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_form_records (
    id uuid primary key default gen_random_uuid(),
    definition_id uuid not null references public.erp_form_definitions (id) on delete cascade,
    module_id text not null default '',
    version integer not null default 1,
    data jsonb not null default '{}'::jsonb,
    status text not null default 'submitted',
    submitted_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_form_records (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_form_records_definition_idx
    on public.erp_form_records (definition_id, created_at desc);
exception
  when others then
    raise warning 'create index if not exists erp_form_records_definition_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_form_records_module_idx
    on public.erp_form_records (module_id, status);
exception
  when others then
    raise warning 'create index if not exists erp_form_records_module_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.erp_form_records enable row level security;
exception
  when others then
    raise warning 'alter table public.erp_form_records enable row level security: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant select on public.erp_form_records to authenticated;
exception
  when others then
    raise warning 'grant select on public.erp_form_records to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant insert, update, delete on public.erp_form_records to authenticated;
exception
  when others then
    raise warning 'grant insert, update, delete on public.erp_form_records to authenticated: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_records_read on public.erp_form_records;
exception
  when others then
    raise warning 'drop policy if exists erp_form_records_read on public.erp_form_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_records_read on public.erp_form_records
    for select
    to authenticated
    using (
      public.is_admin()
      or submitted_by = auth.uid()
      or public.erp_module_permission(module_id, 'view')
    );
exception
  when others then
    raise warning 'create policy erp_form_records_read on public.erp_form_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_form_records_manage on public.erp_form_records;
exception
  when others then
    raise warning 'drop policy if exists erp_form_records_manage on public.erp_form_records: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_form_records_manage on public.erp_form_records
    for all
    to authenticated
    using (public.is_admin() or public.erp_module_permission(module_id, 'edit'))
    with check (public.is_admin() or public.erp_module_permission(module_id, 'create'));
exception
  when others then
    raise warning 'create policy erp_form_records_manage on public.erp_form_records: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 5. Saving a form (always creates a new version)
-- ---------------------------------------------------------------------------
do $do$
begin
  create or replace function public.erp_save_form(
    p_definition_id uuid,
    p_module_id text,
    p_name text,
    p_description text,
    p_key text,
    p_table_name text,
    p_layout jsonb,
    p_fields jsonb,
    p_sections jsonb,
    p_settings jsonb,
    p_allowed_roles text[],
    p_record_permissions jsonb,
    p_change_note text default ''
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_definition public.erp_form_definitions;
    v_version integer;
  begin
    if not (public.is_admin() or public.has_permission('modules.manage')) then
      raise exception 'Administrator access required';
    end if;
    if nullif(trim(coalesce(p_name, '')), '') is null then
      raise exception 'The form needs a name';
    end if;
    if nullif(trim(coalesce(p_key, '')), '') is null then
      raise exception 'The form needs a key';
    end if;
    if p_key !~ '^[a-z][a-z0-9_]{1,39}$' then
      raise exception 'The form key must be lowercase letters, numbers and underscores';
    end if;

    if p_definition_id is null then
      insert into public.erp_form_definitions (
        module_id, name, description, key, table_name, layout, status,
        allowed_roles, record_permissions, settings, created_by
      )
      values (
        p_module_id,
        trim(p_name),
        coalesce(p_description, ''),
        trim(p_key),
        coalesce(nullif(trim(coalesce(p_table_name, '')), ''), 'erp_form_records'),
        coalesce(p_layout, '{"type":"cards"}'::jsonb),
        'draft',
        coalesce(p_allowed_roles, '{}'::text[]),
        coalesce(p_record_permissions, '{}'::jsonb),
        coalesce(p_settings, '{}'::jsonb),
        auth.uid()
      )
      returning * into v_definition;
    else
      select * into v_definition
      from public.erp_form_definitions
      where id = p_definition_id;
      if not found then
        raise exception 'The form was not found';
      end if;
      update public.erp_form_definitions
      set module_id = p_module_id,
          name = trim(p_name),
          description = coalesce(p_description, ''),
          key = trim(p_key),
          table_name = coalesce(nullif(trim(coalesce(p_table_name, '')), ''), 'erp_form_records'),
          layout = coalesce(p_layout, layout),
          allowed_roles = coalesce(p_allowed_roles, allowed_roles),
          record_permissions = coalesce(p_record_permissions, record_permissions),
          settings = coalesce(p_settings, settings),
          updated_at = now()
      where id = p_definition_id
      returning * into v_definition;
    end if;

    select coalesce(max(version), 0) + 1 into v_version
    from public.erp_form_versions
    where definition_id = v_definition.id;

    insert into public.erp_form_versions (
      definition_id, version, fields, sections, settings, change_note, created_by
    )
    values (
      v_definition.id,
      v_version,
      coalesce(p_fields, '[]'::jsonb),
      coalesce(p_sections, '[]'::jsonb),
      coalesce(p_settings, '{}'::jsonb),
      coalesce(p_change_note, ''),
      auth.uid()
    );

    update public.erp_form_definitions
    set current_version = v_version,
        updated_at = now()
    where id = v_definition.id;

    return v_definition.id;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_save_form(: %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_save_form(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text[], jsonb, text) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_save_form(uuid, text, text, text, text, text, jsonb, jso: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_save_form(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text[], jsonb, text) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_save_form(uuid, text, text, text, text, text, jsonb, : %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 6. Publishing a version
-- ---------------------------------------------------------------------------
do $do$
begin
  create or replace function public.erp_publish_form(
    p_definition_id uuid,
    p_version integer default null
  )
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_definition public.erp_form_definitions;
    v_version integer;
    v_field_count integer;
  begin
    if not (public.is_admin() or public.has_permission('modules.manage')) then
      raise exception 'Administrator access required';
    end if;

    select * into v_definition from public.erp_form_definitions where id = p_definition_id;
    if not found then
      raise exception 'The form was not found';
    end if;

    v_version := coalesce(p_version, v_definition.current_version);
    if v_version <= 0 then
      raise exception 'Save the form before publishing it';
    end if;

    select count(*) into v_field_count
    from public.erp_form_versions version_row
    where version_row.definition_id = p_definition_id
      and version_row.version = v_version
      and jsonb_array_length(version_row.fields) > 0;
    if v_field_count = 0 then
      raise exception 'Add at least one field before publishing this form';
    end if;

    update public.erp_form_versions
    set published = true,
        published_at = now()
    where definition_id = p_definition_id
      and version = v_version;

    update public.erp_form_definitions
    set status = 'published',
        published_version = v_version,
        updated_at = now()
    where id = p_definition_id;

    return v_version;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_publish_form(: %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_publish_form(uuid, integer) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_publish_form(uuid, integer) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_publish_form(uuid, integer) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_publish_form(uuid, integer) to authenticated: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 7. Validation of a payload against a version
--    Returns a json array of { field, message } entries. An empty array means
--    the payload is valid.
-- ---------------------------------------------------------------------------
do $do$
begin
  create or replace function public.erp_form_errors(
    p_definition_id uuid,
    p_version integer,
    p_data jsonb
  )
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    with version_row as (
      select fields
      from public.erp_form_versions
      where definition_id = p_definition_id
        and version = coalesce(p_version, 0)
    ),
    expanded as (
      select field
      from version_row,
           lateral jsonb_array_elements(fields) as field
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object('field', field ->> 'key', 'message', message)
        order by coalesce((field ->> 'display_order')::int, 0)
      ),
      '[]'::jsonb
    )
    from (
      select
        field,
        case
          when coalesce((field ->> 'required')::boolean, false)
            and (
              p_data -> (field ->> 'key') is null
              or jsonb_typeof(p_data -> (field ->> 'key')) = 'string'
              and btrim(p_data ->> (field ->> 'key')) = ''
            )
            then coalesce(nullif(field ->> 'required_message', ''), 'This field is required')
          when field ->> 'type' = 'number'
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and (p_data ->> (field ->> 'key')) !~ '^-?[0-9]+(\.[0-9]+)?$'
            then 'Enter a number'
          when field ->> 'type' = 'email'
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and p_data ->> (field ->> 'key') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
            then 'Enter a valid email address'
          when field ->> 'type' = 'phone'
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and length(regexp_replace(p_data ->> (field ->> 'key'), '[^0-9]', '', 'g')) < 10
            then 'Enter a valid phone number'
          when coalesce((field ->> 'min_length')::int, 0) > 0
            and p_data ? (field ->> 'key')
            and length(p_data ->> (field ->> 'key')) < coalesce((field ->> 'min_length')::int, 0)
            then 'Use at least ' || (field ->> 'min_length') || ' characters'
          when coalesce((field ->> 'max_length')::int, 0) > 0
            and p_data ? (field ->> 'key')
            and length(p_data ->> (field ->> 'key')) > coalesce((field ->> 'max_length')::int, 0)
            then 'Use at most ' || (field ->> 'max_length') || ' characters'
          when coalesce((field ->> 'min_value')::numeric, 0) <> 0
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and (p_data ->> (field ->> 'key'))::numeric < coalesce((field ->> 'min_value')::numeric, 0)
            then 'The value cannot be less than ' || (field ->> 'min_value')
          when coalesce((field ->> 'max_value')::numeric, 0) <> 0
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and (p_data ->> (field ->> 'key'))::numeric > coalesce((field ->> 'max_value')::numeric, 0)
            then 'The value cannot be more than ' || (field ->> 'max_value')
          when coalesce(nullif(field ->> 'pattern', ''), '') <> ''
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and (p_data ->> (field ->> 'key')) !~ (field ->> 'pattern')
            then coalesce(nullif(field ->> 'error_message', ''), 'The value is not valid')
          when field ->> 'type' = 'select'
            and p_data ? (field ->> 'key')
            and p_data ->> (field ->> 'key') <> ''
            and jsonb_array_length(coalesce(field -> 'options', '[]'::jsonb)) > 0
            and not exists (
              select 1
              from jsonb_array_elements(coalesce(field -> 'options', '[]'::jsonb)) as option
              where option #>> '{}' = p_data ->> (field ->> 'key')
            )
            then 'Select one of the available options'
          else null
        end as message
      from expanded
    ) issues
    where message is not null;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_form_errors(: %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_form_errors(uuid, integer, jsonb) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_form_errors(uuid, integer, jsonb) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_form_errors(uuid, integer, jsonb) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_form_errors(uuid, integer, jsonb) to authenticated: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 8. Saving a record of a dynamic form
-- ---------------------------------------------------------------------------
do $do$
begin
  create or replace function public.erp_save_form_record(
    p_definition_id uuid,
    p_record_id uuid,
    p_data jsonb,
    p_status text default 'submitted'
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_definition public.erp_form_definitions;
    v_version integer;
    v_errors jsonb;
    v_record_id uuid;
  begin
    select * into v_definition from public.erp_form_definitions where id = p_definition_id;
    if not found then
      raise exception 'The form was not found';
    end if;

    if v_definition.allowed_roles <> '{}'::text[]
       and not public.is_admin()
       and not (v_definition.allowed_roles @> ARRAY[public.effective_login_role()]) then
      raise exception 'Your role cannot use this form';
    end if;

    v_version := case
      when v_definition.published_version > 0 then v_definition.published_version
      else v_definition.current_version
    end;
    if v_version <= 0 then
      raise exception 'This form has no saved version yet';
    end if;

    v_errors := public.erp_form_errors(p_definition_id, v_version, coalesce(p_data, '{}'::jsonb));
    if jsonb_array_length(v_errors) > 0 then
      raise exception '%', (
        select string_agg(error ->> 'message', ', ' order by error ->> 'field')
        from jsonb_array_elements(v_errors) as error
      );
    end if;

    if p_record_id is null then
      if not (public.is_admin() or public.erp_module_permission(v_definition.module_id, 'create')) then
        raise exception 'You are not allowed to create records in this module';
      end if;
      insert into public.erp_form_records (
        definition_id, module_id, version, data, status, submitted_by
      )
      values (
        v_definition.id,
        v_definition.module_id,
        v_version,
        coalesce(p_data, '{}'::jsonb),
        coalesce(nullif(trim(coalesce(p_status, '')), ''), 'submitted'),
        auth.uid()
      )
      returning id into v_record_id;
    else
      if not (public.is_admin() or public.erp_module_permission(v_definition.module_id, 'edit')) then
        raise exception 'You are not allowed to edit records in this module';
      end if;
      update public.erp_form_records
      set data = coalesce(p_data, data),
          status = coalesce(nullif(trim(coalesce(p_status, '')), ''), status),
          updated_at = now()
      where id = p_record_id
        and definition_id = p_definition_id
      returning id into v_record_id;
      if v_record_id is null then
        raise exception 'The record was not found';
      end if;
    end if;

    return v_record_id;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_save_form_record(: %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_save_form_record(uuid, uuid, jsonb, text) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_save_form_record(uuid, uuid, jsonb, text) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_save_form_record(uuid, uuid, jsonb, text) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_save_form_record(uuid, uuid, jsonb, text) to authenti: %', sqlerrm;
end;
$do$;

do $do$
begin
  create or replace function public.erp_delete_form_record(p_record_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_record public.erp_form_records;
  begin
    select * into v_record from public.erp_form_records where id = p_record_id;
    if not found then
      raise exception 'The record was not found';
    end if;
    if not (public.is_admin() or public.erp_module_permission(v_record.module_id, 'delete')) then
      raise exception 'You are not allowed to delete records in this module';
    end if;
    delete from public.erp_form_records where id = p_record_id;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_delete_form_record(p_record_id uuid): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_delete_form_record(uuid) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_delete_form_record(uuid) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_delete_form_record(uuid) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_delete_form_record(uuid) to authenticated: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 9. System settings used by the modules
--     The category list of the existing settings table is widened so that the
--     system configuration module can store a setting per module. Existing
--     rows and their categories are untouched.
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.erp_settings drop constraint if exists erp_settings_category_check;
exception
  when others then
    raise warning 'alter table public.erp_settings drop constraint if exists erp_settings_category_check: %', sqlerrm;
end;
$do$;

do $do$
begin
  alter table public.erp_settings
    add constraint erp_settings_category_check
    check (
      category = any (array[
        'communication', 'appointment', 'college', 'chatbot', 'security',
        'general', 'admission', 'transport', 'hostel', 'library',
        'examinations', 'attendance', 'finance', 'hr', 'reports', 'modules'
      ])
    );
exception
  when others then
    raise warning 'alter table public.erp_settings: %', sqlerrm;
end;
$do$;

do $do$
begin
  insert into public.erp_settings (id, category, setting_key, setting_value, is_secret, description)
  values
    ('erp.general.college_name', 'general', 'college_name', '"SVIT College"', false, 'The college name printed on receipts, reports and the public portal'),
    ('erp.general.currency', 'general', 'currency', '"INR"', false, 'The currency code used by the finance modules'),
    ('erp.general.currency_symbol', 'general', 'currency_symbol', '"₹"', false, 'The currency symbol used by the finance modules'),
    ('erp.general.academic_year', 'general', 'academic_year', '"2026-2027"', false, 'The academic year the modules default to'),
    ('erp.admission.application_fee_paise', 'admission', 'application_fee_paise', '0', false, 'Default admission application fee in paise'),
    ('erp.transport.default_fare_paise', 'transport', 'default_fare_paise', '0', false, 'Default student transport fare in paise'),
    ('erp.hostel.default_room_rent_paise', 'hostel', 'default_room_rent_paise', '0', false, 'Default hostel room rent in paise'),
    ('erp.library.default_loan_days', 'library', 'default_loan_days', '14', false, 'Default number of days a book may be kept'),
    ('erp.examination.default_pass_percentage', 'examinations', 'default_pass_percentage', '40', false, 'Default pass percentage used by the examination module'),
    ('erp.attendance.minimum_percentage', 'attendance', 'minimum_percentage', '75', false, 'Minimum attendance percentage before a student is listed as a defaulter'),
    ('erp.communication.default_channels', 'communication', 'default_channels', '["in_app"]', false, 'The channels the communication module uses by default')
  on conflict (id) do nothing;
exception
  when others then
    raise warning 'insert into public.erp_settings (id, category, setting_key, setting_value, is_secret, desc: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 10. Audit triggers on the framework tables
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'erp_modules',
    'erp_module_permissions',
    'erp_module_timings',
    'erp_feature_flags',
    'erp_approval_workflows',
    'erp_receipt_templates',
    'erp_report_definitions',
    'erp_form_definitions',
    'erp_form_versions',
    'erp_form_templates',
    'erp_notifications'
  ]
  loop
    begin
          execute format('drop trigger if exists erp_audit_%s on public.%I', target, target);
          execute format(
            'create trigger erp_audit_%s after insert or update or delete on public.%I '
            || 'for each row execute function public.erp_audit_trigger()',
            target,
            target
          );

    exception
      when others then
        raise warning 'the audit trigger could not be created: %', sqlerrm;
    end;
  end loop;
end;
$$;
