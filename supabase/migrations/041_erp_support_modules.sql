-- Migration 041: SVIT ERP communication, inventory, placement, certificates,
--                  website, helpdesk and reporting
-- Apply after migration 040. Idempotent and safe to re-run.

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
-- 0.1 The shared student master of migration 037
--     The people spine links a student to the portal login. The link is
--     ensured here as well, so that this migration can also be applied on
--     its own, without migration 037.
-- ---------------------------------------------------------------------------
do $do$
begin
  alter table public.students
    add column if not exists user_id uuid references public.profiles (id) on delete set null;
exception
  when others then
    raise warning 'alter table public.students: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 1. Communication and notification
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_notification_templates (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    name text not null,
    module_id text references public.erp_modules (id) on delete set null,
    channel text not null default 'in_app',
    subject text not null default '',
    body text not null default '',
    enabled boolean not null default true,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_notification_templates (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_notification_templates_code_unique
    on public.erp_notification_templates (lower(code));
exception
  when others then
    raise warning 'create unique index if not exists erp_notification_templates_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_notification_templates', 'communication');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_notification_templates'', ''communication''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_broadcasts (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    body text not null default '',
    module_id text references public.erp_modules (id) on delete set null,
    audience jsonb not null default '{}'::jsonb,
    channels text[] not null default '{in_app}'::text[],
    recipient_count integer not null default 0,
    status text not null default 'draft',
    sent_at timestamptz,
    sent_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_broadcasts (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_broadcasts', 'communication');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_broadcasts'', ''communication''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_message_log (
    id uuid primary key default gen_random_uuid(),
    broadcast_id uuid references public.erp_broadcasts (id) on delete cascade,
    channel text not null default 'in_app',
    recipient text not null default '',
    status text not null default 'queued',
    detail text not null default '',
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_message_log (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_message_log_broadcast_idx
    on public.erp_message_log (broadcast_id);
exception
  when others then
    raise warning 'create index if not exists erp_message_log_broadcast_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_message_log', 'communication');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_message_log'', ''communication''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Inventory and purchase
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_inventory_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    parent_id uuid references public.erp_inventory_categories (id) on delete set null,
    description text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_inventory_categories (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_inventory_categories_name_unique
    on public.erp_inventory_categories (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_inventory_categories_name_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_inventory_categories', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_inventory_categories'', ''inventory''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_suppliers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    contact_person text not null default '',
    phone text not null default '',
    email text not null default '',
    address text not null default '',
    gst_number text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_suppliers (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_suppliers_name_unique
    on public.erp_suppliers (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_suppliers_name_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_suppliers', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_suppliers'', ''inventory''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_inventory_items (
    id uuid primary key default gen_random_uuid(),
    item_code text not null,
    name text not null,
    category_id uuid references public.erp_inventory_categories (id) on delete set null,
    unit text not null default 'unit',
    unit_price_paise bigint not null default 0,
    reorder_level numeric not null default 0,
    current_stock numeric not null default 0,
    location text not null default '',
    description text not null default '',
    active boolean not null default true,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_inventory_items (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_inventory_items_code_unique
    on public.erp_inventory_items (lower(item_code));
exception
  when others then
    raise warning 'create unique index if not exists erp_inventory_items_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_inventory_items', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_inventory_items'', ''inventory''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_purchase_orders (
    id uuid primary key default gen_random_uuid(),
    po_number text not null,
    supplier_id uuid references public.erp_suppliers (id) on delete set null,
    order_date date not null default current_date,
    expected_date date,
    status text not null default 'draft',
    total_paise bigint not null default 0,
    department_id uuid references public.departments (id) on delete set null,
    notes text not null default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_purchase_orders_status check (
      status in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_purchase_orders (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_purchase_orders_number_unique
    on public.erp_purchase_orders (lower(po_number));
exception
  when others then
    raise warning 'create unique index if not exists erp_purchase_orders_number_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_purchase_orders', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_purchase_orders'', ''inventory''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_purchase_order_lines (
    id uuid primary key default gen_random_uuid(),
    purchase_order_id uuid not null references public.erp_purchase_orders (id) on delete cascade,
    item_id uuid references public.erp_inventory_items (id) on delete set null,
    item_code text not null default '',
    item_name text not null default '',
    quantity numeric not null default 0,
    unit_price_paise bigint not null default 0,
    received_quantity numeric not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_purchase_order_lines (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_purchase_order_lines_order_idx
    on public.erp_purchase_order_lines (purchase_order_id);
exception
  when others then
    raise warning 'create index if not exists erp_purchase_order_lines_order_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_purchase_order_lines', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_purchase_order_lines'', ''inventory''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_goods_receipts (
    id uuid primary key default gen_random_uuid(),
    receipt_number text not null,
    purchase_order_id uuid references public.erp_purchase_orders (id) on delete set null,
    received_on date not null default current_date,
    received_by uuid references public.profiles (id) on delete set null,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_goods_receipts (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_goods_receipts_number_unique
    on public.erp_goods_receipts (lower(receipt_number));
exception
  when others then
    raise warning 'create unique index if not exists erp_goods_receipts_number_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_goods_receipts', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_goods_receipts'', ''inventory''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_stock_movements (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.erp_inventory_items (id) on delete cascade,
    movement_type text not null default 'out',
    quantity numeric not null default 0,
    movement_date date not null default current_date,
    reference text not null default '',
    remarks text not null default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_stock_movements_type check (
      movement_type in ('in', 'out', 'adjustment')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_stock_movements (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_stock_movements_item_idx
    on public.erp_stock_movements (item_id, movement_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_stock_movements_item_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_stock_movements', 'inventory');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_stock_movements'', ''inventory''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3. Placement and training
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    industry text not null default '',
    website text not null default '',
    contact_person text not null default '',
    contact_email text not null default '',
    contact_phone text not null default '',
    logo_url text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_companies (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_companies_name_unique
    on public.erp_companies (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_companies_name_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_companies', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_companies'', ''placement''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_placement_drives (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.erp_companies (id) on delete set null,
    title text not null,
    drive_date date,
    venue text not null default '',
    mode text not null default 'offline',
    package_paise bigint not null default 0,
    eligibility text not null default '',
    course_id uuid references public.courses (id) on delete set null,
    status text not null default 'planned',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_placement_drives_status check (
      status in ('planned', 'open', 'closed', 'completed')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_placement_drives (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_placement_drives_date_idx
    on public.erp_placement_drives (drive_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_placement_drives_date_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_placement_drives', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_placement_drives'', ''placement''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_placement_applications (
    id uuid primary key default gen_random_uuid(),
    drive_id uuid not null references public.erp_placement_drives (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    status text not null default 'applied',
    applied_at timestamptz not null default now(),
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_placement_applications (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_placement_applications_unique
    on public.erp_placement_applications (drive_id, student_id);
exception
  when others then
    raise warning 'create unique index if not exists erp_placement_applications_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_placement_applications', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_placement_applications'', ''placement''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_placement_offers (
    id uuid primary key default gen_random_uuid(),
    drive_id uuid references public.erp_placement_drives (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    package_paise bigint not null default 0,
    role_offered text not null default '',
    joining_date date,
    status text not null default 'offered',
    letter_path text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_placement_offers (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_placement_offers_unique
    on public.erp_placement_offers (drive_id, student_id);
exception
  when others then
    raise warning 'create unique index if not exists erp_placement_offers_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_placement_offers', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_placement_offers'', ''placement''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_training_programmes (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    trainer text not null default '',
    mode text not null default 'offline',
    starts_on date,
    ends_on date,
    hours numeric not null default 0,
    capacity integer not null default 0,
    fee_paise bigint not null default 0,
    description text not null default '',
    status text not null default 'planned',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_training_programmes (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_training_programmes', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_training_programmes'', ''placement''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_training_enrollments (
    id uuid primary key default gen_random_uuid(),
    programme_id uuid not null references public.erp_training_programmes (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    status text not null default 'enrolled',
    attended_hours numeric not null default 0,
    certificate_path text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_training_enrollments (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_training_enrollments_unique
    on public.erp_training_enrollments (programme_id, student_id);
exception
  when others then
    raise warning 'create unique index if not exists erp_training_enrollments_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_training_enrollments', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_training_enrollments'', ''placement''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_training_attendance (
    id uuid primary key default gen_random_uuid(),
    programme_id uuid not null references public.erp_training_programmes (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    session_date date not null default current_date,
    hours numeric not null default 0,
    status text not null default 'present',
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_training_attendance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_training_attendance_unique
    on public.erp_training_attendance (programme_id, student_id, session_date);
exception
  when others then
    raise warning 'create unique index if not exists erp_training_attendance_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_training_attendance', 'placement');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_training_attendance'', ''placement''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. Certificate management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_certificate_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    certificate_type text not null default 'academic',
    body_template jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_certificate_templates (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_certificate_templates_name_unique
    on public.erp_certificate_templates (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_certificate_templates_name_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_certificate_templates', 'certificates');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_certificate_templates'', ''certificates''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_certificate_requests (
    id uuid primary key default gen_random_uuid(),
    template_id uuid references public.erp_certificate_templates (id) on delete set null,
    student_id uuid references public.students (id) on delete cascade,
    faculty_id uuid references public.faculty (id) on delete cascade,
    request_type text not null default 'academic',
    reason text not null default '',
    status text not null default 'pending',
    requested_by uuid references public.profiles (id) on delete set null,
    decided_by uuid references public.profiles (id) on delete set null,
    decided_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_certificate_requests (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_certificate_requests_status_idx
    on public.erp_certificate_requests (status);
exception
  when others then
    raise warning 'create index if not exists erp_certificate_requests_status_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_certificate_requests_own_read
    on public.erp_certificate_requests;
exception
  when others then
    raise warning 'drop policy if exists erp_certificate_requests_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_certificate_requests_own_read
    on public.erp_certificate_requests
    for select
    to authenticated
    using (requested_by = auth.uid());
exception
  when others then
    raise warning 'create policy erp_certificate_requests_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_certificate_requests', 'certificates');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_certificate_requests'', ''certificates''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_certificates (
    id uuid primary key default gen_random_uuid(),
    serial_number text not null default '',
    template_id uuid references public.erp_certificate_templates (id) on delete set null,
    certificate_type text not null default 'academic',
    holder_type text not null default 'student',
    student_id uuid references public.students (id) on delete cascade,
    faculty_id uuid references public.faculty (id) on delete cascade,
    holder_name text not null default '',
    issued_on date not null default current_date,
    data jsonb not null default '{}'::jsonb,
    verification_code text not null default '',
    issued_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_certificates (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_certificates_serial_unique
    on public.erp_certificates (serial_number)
    where serial_number <> '';
exception
  when others then
    raise warning 'create unique index if not exists erp_certificates_serial_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_certificates_student_idx
    on public.erp_certificates (student_id);
exception
  when others then
    raise warning 'create index if not exists erp_certificates_student_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_certificates_own_read on public.erp_certificates;
exception
  when others then
    raise warning 'drop policy if exists erp_certificates_own_read on public.erp_certificates: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_certificates_own_read on public.erp_certificates
    for select
    to authenticated
    using (
      exists (
        select 1 from public.students student
        where student.id = erp_certificates.student_id
          and student.user_id = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_certificates_own_read on public.erp_certificates: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_certificates', 'certificates');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_certificates'', ''certificates''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 5. College website and public portal
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_web_pages (
    id uuid primary key default gen_random_uuid(),
    slug text not null,
    title text not null,
    section text not null default 'general',
    content text not null default '',
    status text not null default 'draft',
    meta jsonb not null default '{}'::jsonb,
    published_at timestamptz,
    updated_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_web_pages_status check (status in ('draft', 'published', 'archived'))
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_web_pages (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_web_pages_slug_unique
    on public.erp_web_pages (lower(slug));
exception
  when others then
    raise warning 'create unique index if not exists erp_web_pages_slug_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_web_pages', 'website');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_web_pages'', ''website''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_web_posts (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    slug text not null,
    excerpt text not null default '',
    content text not null default '',
    category text not null default 'news',
    image_url text not null default '',
    status text not null default 'draft',
    published_at timestamptz,
    author text not null default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_web_posts_status check (status in ('draft', 'published', 'archived'))
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_web_posts (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_web_posts_slug_unique
    on public.erp_web_posts (lower(slug));
exception
  when others then
    raise warning 'create unique index if not exists erp_web_posts_slug_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_web_posts', 'website');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_web_posts'', ''website''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_web_events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text not null default '',
    starts_on date,
    ends_on date,
    venue text not null default '',
    image_url text not null default '',
    status text not null default 'draft',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_web_events (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_web_events', 'website');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_web_events'', ''website''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_web_menu_items (
    id uuid primary key default gen_random_uuid(),
    label text not null,
    url text not null default '',
    parent_id uuid references public.erp_web_menu_items (id) on delete set null,
    display_order integer not null default 100,
    visible boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_web_menu_items (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_web_menu_items_parent_idx
    on public.erp_web_menu_items (parent_id, display_order);
exception
  when others then
    raise warning 'create index if not exists erp_web_menu_items_parent_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_web_menu_items', 'website');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_web_menu_items'', ''website''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_web_settings (
    id uuid primary key default gen_random_uuid(),
    setting_key text not null,
    setting_value jsonb not null default '{}'::jsonb,
    description text not null default '',
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_web_settings (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_web_settings_key_unique
    on public.erp_web_settings (lower(setting_key));
exception
  when others then
    raise warning 'create unique index if not exists erp_web_settings_key_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_web_settings', 'website');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_web_settings'', ''website''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 6. Grievance and helpdesk
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_grievance_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    module_id text references public.erp_modules (id) on delete set null,
    default_priority text not null default 'normal',
    sla_hours integer not null default 48,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_grievance_categories (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_grievance_categories_name_unique
    on public.erp_grievance_categories (lower(name));
exception
  when others then
    raise warning 'create unique index if not exists erp_grievance_categories_name_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_grievance_categories', 'helpdesk');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_grievance_categories'', ''helpdesk''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_grievances (
    id uuid primary key default gen_random_uuid(),
    ticket_number text not null,
    category_id uuid references public.erp_grievance_categories (id) on delete set null,
    subject text not null,
    details text not null default '',
    priority text not null default 'normal',
    status text not null default 'open',
    student_id uuid references public.students (id) on delete cascade,
    faculty_id uuid references public.faculty (id) on delete cascade,
    raised_by uuid references public.profiles (id) on delete set null,
    assigned_to uuid references public.profiles (id) on delete set null,
    due_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_grievances_status check (
      status in ('open', 'in_progress', 'on_hold', 'resolved', 'closed', 'rejected')
    ),
    constraint erp_grievances_priority check (
      priority in ('low', 'normal', 'high', 'urgent')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_grievances (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_grievances_ticket_unique
    on public.erp_grievances (ticket_number);
exception
  when others then
    raise warning 'create unique index if not exists erp_grievances_ticket_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_grievances_status_idx
    on public.erp_grievances (status, priority);
exception
  when others then
    raise warning 'create index if not exists erp_grievances_status_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_grievances_own_read on public.erp_grievances;
exception
  when others then
    raise warning 'drop policy if exists erp_grievances_own_read on public.erp_grievances: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_grievances_own_read on public.erp_grievances
    for select
    to authenticated
    using (raised_by = auth.uid());
exception
  when others then
    raise warning 'create policy erp_grievances_own_read on public.erp_grievances: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_grievances', 'helpdesk');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_grievances'', ''helpdesk''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_grievance_comments (
    id uuid primary key default gen_random_uuid(),
    grievance_id uuid not null references public.erp_grievances (id) on delete cascade,
    author_id uuid references public.profiles (id) on delete set null,
    body text not null,
    internal boolean not null default false,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_grievance_comments (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_grievance_comments_grievance_idx
    on public.erp_grievance_comments (grievance_id, created_at);
exception
  when others then
    raise warning 'create index if not exists erp_grievance_comments_grievance_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  drop policy if exists erp_grievance_comments_own_read
    on public.erp_grievance_comments;
exception
  when others then
    raise warning 'drop policy if exists erp_grievance_comments_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  create policy erp_grievance_comments_own_read
    on public.erp_grievance_comments
    for select
    to authenticated
    using (
      internal = false
      and exists (
        select 1 from public.erp_grievances grievance
        where grievance.id = erp_grievance_comments.grievance_id
          and grievance.raised_by = auth.uid()
      )
    );
exception
  when others then
    raise warning 'create policy erp_grievance_comments_own_read: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_grievance_comments', 'helpdesk');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_grievance_comments'', ''helpdesk''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_sla_rules (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    priority text not null default 'normal',
    response_hours integer not null default 4,
    resolution_hours integer not null default 48,
    escalate_to_role text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_sla_rules (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_sla_rules', 'helpdesk');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_sla_rules'', ''helpdesk''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_knowledge_articles (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    body text not null default '',
    category text not null default 'general',
    status text not null default 'published',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_knowledge_articles (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_knowledge_articles', 'helpdesk');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_knowledge_articles'', ''helpdesk''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 7. Reporting
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_report_schedules (
    id uuid primary key default gen_random_uuid(),
    definition_id uuid references public.erp_report_definitions (id) on delete cascade,
    name text not null,
    cron_expression text not null default '0 8 1 * *',
    recipients text[] not null default '{}'::text[],
    format text not null default 'xlsx',
    enabled boolean not null default true,
    last_run_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_report_schedules (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_report_schedules_definition_idx
    on public.erp_report_schedules (definition_id);
exception
  when others then
    raise warning 'create index if not exists erp_report_schedules_definition_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_report_schedules', 'reports');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_report_schedules'', ''reports''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 8. Audit triggers
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'erp_notification_templates',
    'erp_broadcasts',
    'erp_message_log',
    'erp_inventory_categories',
    'erp_suppliers',
    'erp_inventory_items',
    'erp_purchase_orders',
    'erp_purchase_order_lines',
    'erp_goods_receipts',
    'erp_stock_movements',
    'erp_companies',
    'erp_placement_drives',
    'erp_placement_applications',
    'erp_placement_offers',
    'erp_training_programmes',
    'erp_training_enrollments',
    'erp_training_attendance',
    'erp_certificate_templates',
    'erp_certificate_requests',
    'erp_certificates',
    'erp_web_pages',
    'erp_web_posts',
    'erp_web_events',
    'erp_web_menu_items',
    'erp_web_settings',
    'erp_grievance_categories',
    'erp_grievances',
    'erp_grievance_comments',
    'erp_sla_rules',
    'erp_knowledge_articles',
    'erp_report_schedules'
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
