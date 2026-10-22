-- Migration 039: SVIT ERP accounts, transport, HR and payroll
-- Apply after migration 038. Idempotent and safe to re-run.
--
-- Adds the finance, transport and human resource tables. The fee module keeps
-- using the existing fee_structures / fee_assignments / payments tables, and
-- the finance module posts its vouchers against the same students.

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
-- 1. Accounts and finance
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_account_heads (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    name text not null,
    head_type text not null default 'expense',
    group_name text not null default '',
    parent_id uuid references public.erp_account_heads (id) on delete set null,
    opening_balance_paise bigint not null default 0,
    description text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_account_heads_type check (
      head_type in ('asset', 'liability', 'income', 'expense', 'equity')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_account_heads (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_account_heads_code_unique
    on public.erp_account_heads (lower(code));
exception
  when others then
    raise warning 'create unique index if not exists erp_account_heads_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_account_heads', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_account_heads'', ''accounts''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_vouchers (
    id uuid primary key default gen_random_uuid(),
    voucher_no text not null,
    voucher_type text not null default 'receipt',
    voucher_date date not null default current_date,
    party_name text not null default '',
    party_student_id uuid references public.students (id) on delete set null,
    narration text not null default '',
    total_paise bigint not null default 0,
    status text not null default 'draft',
    receipt_template_id uuid references public.erp_receipt_templates (id) on delete set null,
    created_by uuid references public.profiles (id) on delete set null,
    approved_by uuid references public.profiles (id) on delete set null,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_vouchers_type check (
      voucher_type in ('receipt', 'payment', 'journal', 'contra')
    ),
    constraint erp_vouchers_status check (
      status in ('draft', 'posted', 'cancelled')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_vouchers (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_vouchers_no_unique
    on public.erp_vouchers (lower(voucher_no));
exception
  when others then
    raise warning 'create unique index if not exists erp_vouchers_no_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_vouchers_date_idx on public.erp_vouchers (voucher_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_vouchers_date_idx on public.erp_vouchers (voucher_date desc: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_vouchers', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_vouchers'', ''accounts''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_voucher_lines (
    id uuid primary key default gen_random_uuid(),
    voucher_id uuid not null references public.erp_vouchers (id) on delete cascade,
    head_id uuid references public.erp_account_heads (id) on delete set null,
    narration text not null default '',
    debit_paise bigint not null default 0,
    credit_paise bigint not null default 0,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_voucher_lines (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_voucher_lines_voucher_idx
    on public.erp_voucher_lines (voucher_id);
exception
  when others then
    raise warning 'create index if not exists erp_voucher_lines_voucher_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_voucher_lines', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_voucher_lines'', ''accounts''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_ledger_entries (
    id uuid primary key default gen_random_uuid(),
    head_id uuid not null references public.erp_account_heads (id) on delete cascade,
    voucher_id uuid references public.erp_vouchers (id) on delete set null,
    entry_date date not null default current_date,
    particulars text not null default '',
    reference text not null default '',
    debit_paise bigint not null default 0,
    credit_paise bigint not null default 0,
    balance_paise bigint not null default 0,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_ledger_entries (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_ledger_entries_head_idx
    on public.erp_ledger_entries (head_id, entry_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_ledger_entries_head_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_ledger_entries', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_ledger_entries'', ''accounts''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_bank_accounts (
    id uuid primary key default gen_random_uuid(),
    bank_name text not null,
    account_number text not null default '',
    ifsc text not null default '',
    branch text not null default '',
    account_type text not null default 'current',
    opening_balance_paise bigint not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_bank_accounts (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_bank_accounts_number_unique
    on public.erp_bank_accounts (lower(bank_name), lower(account_number))
    where account_number <> '';
exception
  when others then
    raise warning 'create unique index if not exists erp_bank_accounts_number_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_bank_accounts', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_bank_accounts'', ''accounts''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_bank_transactions (
    id uuid primary key default gen_random_uuid(),
    bank_account_id uuid not null references public.erp_bank_accounts (id) on delete cascade,
    transaction_date date not null default current_date,
    reference text not null default '',
    particulars text not null default '',
    debit_paise bigint not null default 0,
    credit_paise bigint not null default 0,
    reconciled boolean not null default false,
    voucher_id uuid references public.erp_vouchers (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_bank_transactions (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_bank_transactions_account_idx
    on public.erp_bank_transactions (bank_account_id, transaction_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_bank_transactions_account_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_bank_transactions', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_bank_transactions'', ''accounts''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_budgets (
    id uuid primary key default gen_random_uuid(),
    head_id uuid references public.erp_account_heads (id) on delete cascade,
    academic_year text not null default '',
    category text not null default 'department',
    department_id uuid references public.departments (id) on delete set null,
    budgeted_paise bigint not null default 0,
    spent_paise bigint not null default 0,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_budgets (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_budgets_year_idx on public.erp_budgets (academic_year);
exception
  when others then
    raise warning 'create index if not exists erp_budgets_year_idx on public.erp_budgets (academic_year): %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_budgets', 'accounts');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_budgets'', ''accounts''): %', sqlerrm;
end;
$do$;

-- Posting a voucher writes its ledger lines in one step.
do $do$
begin
  create or replace function public.erp_post_voucher(p_voucher_id uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_voucher public.erp_vouchers;
    v_total bigint;
  begin
    select * into v_voucher from public.erp_vouchers where id = p_voucher_id;
    if not found then
      raise exception 'The voucher was not found';
    end if;
    if not (public.is_admin() or public.erp_module_permission('accounts', 'approve')) then
      raise exception 'You are not allowed to post a voucher';
    end if;
    if v_voucher.status <> 'draft' then
      raise exception 'This voucher has already been posted';
    end if;

    select coalesce(sum(debit_paise), 0) into v_total
    from public.erp_voucher_lines
    where voucher_id = p_voucher_id;
    if v_total = 0 then
      select coalesce(sum(credit_paise), 0) into v_total
      from public.erp_voucher_lines
      where voucher_id = p_voucher_id;
    end if;
    if v_total = 0 then
      raise exception 'Add at least one voucher line before posting';
    end if;

    delete from public.erp_ledger_entries where voucher_id = p_voucher_id;

    insert into public.erp_ledger_entries (
      head_id, voucher_id, entry_date, particulars, reference,
      debit_paise, credit_paise, balance_paise, created_by
    )
    select
      line.head_id,
      p_voucher_id,
      v_voucher.voucher_date,
      coalesce(nullif(line.narration, ''), v_voucher.narration),
      v_voucher.voucher_no,
      line.debit_paise,
      line.credit_paise,
      coalesce(
        (select sum(balance.debit_paise - balance.credit_paise)
         from public.erp_ledger_entries balance
         where balance.head_id = line.head_id
           and balance.entry_date <= v_voucher.voucher_date),
        0
      ),
      auth.uid()
    from public.erp_voucher_lines line
    where line.voucher_id = p_voucher_id
      and line.head_id is not null;

    update public.erp_vouchers
    set status = 'posted',
        total_paise = v_total,
        approved_by = auth.uid(),
        approved_at = now(),
        updated_at = now()
    where id = p_voucher_id;

    return v_total;
  end;
  $$;
exception
  when others then
    raise warning 'create or replace function public.erp_post_voucher(p_voucher_id uuid): %', sqlerrm;
end;
$do$;

do $do$
begin
  revoke all on function public.erp_post_voucher(uuid) from public;
exception
  when others then
    raise warning 'revoke all on function public.erp_post_voucher(uuid) from public: %', sqlerrm;
end;
$do$;

do $do$
begin
  grant execute on function public.erp_post_voucher(uuid) to authenticated;
exception
  when others then
    raise warning 'grant execute on function public.erp_post_voucher(uuid) to authenticated: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Transport management
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_transport_routes (
    id uuid primary key default gen_random_uuid(),
    route_code text not null,
    name text not null,
    college_id uuid references public.colleges (id) on delete set null,
    start_point text not null default '',
    end_point text not null default '',
    distance_km numeric not null default 0,
    student_fare_paise bigint not null default 0,
    staff_fare_paise bigint not null default 0,
    shift text not null default 'morning',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_routes (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_transport_routes_code_unique
    on public.erp_transport_routes (lower(route_code));
exception
  when others then
    raise warning 'create unique index if not exists erp_transport_routes_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_routes', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_routes'', ''transport''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_transport_stops (
    id uuid primary key default gen_random_uuid(),
    route_id uuid not null references public.erp_transport_routes (id) on delete cascade,
    name text not null,
    stop_order integer not null default 1,
    pickup_time time,
    dropoff_time time,
    fare_paise bigint not null default 0,
    landmark text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_stops (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_transport_stops_route_idx
    on public.erp_transport_stops (route_id, stop_order);
exception
  when others then
    raise warning 'create index if not exists erp_transport_stops_route_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_stops', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_stops'', ''transport''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_transport_vehicles (
    id uuid primary key default gen_random_uuid(),
    registration_number text not null,
    route_id uuid references public.erp_transport_routes (id) on delete set null,
    vehicle_type text not null default 'bus',
    make_model text not null default '',
    capacity integer not null default 40,
    fitness_expiry date,
    insurance_expiry date,
    permit_expiry date,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_vehicles (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_transport_vehicles_registration_unique
    on public.erp_transport_vehicles (lower(registration_number));
exception
  when others then
    raise warning 'create unique index if not exists erp_transport_vehicles_registration_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_vehicles', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_vehicles'', ''transport''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_transport_drivers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null default '',
    license_number text not null default '',
    license_expiry date,
    vehicle_id uuid references public.erp_transport_vehicles (id) on delete set null,
    address text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_drivers (: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_drivers', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_drivers'', ''transport''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_transport_allocations (
    id uuid primary key default gen_random_uuid(),
    route_id uuid not null references public.erp_transport_routes (id) on delete cascade,
    stop_id uuid references public.erp_transport_stops (id) on delete set null,
    student_id uuid references public.students (id) on delete cascade,
    faculty_id uuid references public.faculty (id) on delete cascade,
    academic_year text not null default '',
    fare_paise bigint not null default 0,
    from_date date not null default current_date,
    to_date date,
    status text not null default 'active',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_transport_allocations_person check (
      student_id is not null or faculty_id is not null
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_allocations (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_transport_allocations_route_idx
    on public.erp_transport_allocations (route_id);
exception
  when others then
    raise warning 'create index if not exists erp_transport_allocations_route_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_transport_allocations_student_unique
    on public.erp_transport_allocations (route_id, student_id, academic_year)
    where student_id is not null;
exception
  when others then
    raise warning 'create unique index if not exists erp_transport_allocations_student_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_allocations', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_allocations'', ''transport''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_transport_attendance (
    id uuid primary key default gen_random_uuid(),
    route_id uuid not null references public.erp_transport_routes (id) on delete cascade,
    allocation_id uuid references public.erp_transport_allocations (id) on delete cascade,
    attendance_date date not null default current_date,
    boarded_at time,
    status text not null default 'boarded',
    remarks text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_attendance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_transport_attendance_route_idx
    on public.erp_transport_attendance (route_id, attendance_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_transport_attendance_route_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_attendance', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_attendance'', ''transport''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_transport_maintenance (
    id uuid primary key default gen_random_uuid(),
    vehicle_id uuid not null references public.erp_transport_vehicles (id) on delete cascade,
    service_date date not null default current_date,
    description text not null default '',
    cost_paise bigint not null default 0,
    next_service_date date,
    vendor text not null default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_transport_maintenance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_transport_maintenance_vehicle_idx
    on public.erp_transport_maintenance (vehicle_id, service_date desc);
exception
  when others then
    raise warning 'create index if not exists erp_transport_maintenance_vehicle_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_transport_maintenance', 'transport');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_transport_maintenance'', ''transport''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3. HR and payroll
-- ---------------------------------------------------------------------------
do $do$
begin
  create table if not exists public.erp_leave_policies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    leave_type text not null,
    days_per_year numeric not null default 0,
    carry_forward boolean not null default false,
    encashable boolean not null default false,
    requires_document_after_days numeric not null default 3,
    description text not null default '',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_leave_policies (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_leave_policies_type_unique
    on public.erp_leave_policies (lower(leave_type));
exception
  when others then
    raise warning 'create unique index if not exists erp_leave_policies_type_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_leave_policies', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_leave_policies'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_leave_balances (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    leave_type text not null,
    year integer not null default 0,
    entitled numeric not null default 0,
    used numeric not null default 0,
    balance numeric not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_leave_balances (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_leave_balances_unique
    on public.erp_leave_balances (faculty_id, leave_type, year);
exception
  when others then
    raise warning 'create unique index if not exists erp_leave_balances_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_leave_balances', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_leave_balances'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_payroll_components (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    name text not null,
    component_type text not null default 'earning',
    calculation text not null default 'fixed',
    amount numeric not null default 0,
    percentage_of text default '',
    is_taxable boolean not null default true,
    display_order integer not null default 100,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_payroll_components_type check (
      component_type in ('earning', 'deduction')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_payroll_components (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_payroll_components_code_unique
    on public.erp_payroll_components (lower(code));
exception
  when others then
    raise warning 'create unique index if not exists erp_payroll_components_code_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_payroll_components', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_payroll_components'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_payroll_runs (
    id uuid primary key default gen_random_uuid(),
    period_month integer not null default 1,
    period_year integer not null default 0,
    status text not null default 'draft',
    employee_count integer not null default 0,
    total_gross_paise bigint not null default 0,
    total_deductions_paise bigint not null default 0,
    total_net_paise bigint not null default 0,
    notes text not null default '',
    processed_by uuid references public.profiles (id) on delete set null,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint erp_payroll_runs_status check (
      status in ('draft', 'processed', 'approved', 'paid')
    )
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_payroll_runs (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_payroll_runs_period_unique
    on public.erp_payroll_runs (period_month, period_year);
exception
  when others then
    raise warning 'create unique index if not exists erp_payroll_runs_period_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_payroll_runs', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_payroll_runs'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_payslips (
    id uuid primary key default gen_random_uuid(),
    payroll_run_id uuid not null references public.erp_payroll_runs (id) on delete cascade,
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    days_paid numeric not null default 0,
    basic_paise bigint not null default 0,
    gross_paise bigint not null default 0,
    deductions_paise bigint not null default 0,
    net_paise bigint not null default 0,
    status text not null default 'draft',
    paid_on date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_payslips (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_payslips_unique
    on public.erp_payslips (payroll_run_id, faculty_id);
exception
  when others then
    raise warning 'create unique index if not exists erp_payslips_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_payslips', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_payslips'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_payslip_lines (
    id uuid primary key default gen_random_uuid(),
    payslip_id uuid not null references public.erp_payslips (id) on delete cascade,
    component_id uuid references public.erp_payroll_components (id) on delete set null,
    name text not null default '',
    component_type text not null default 'earning',
    amount_paise bigint not null default 0,
    created_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_payslip_lines (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_payslip_lines_payslip_idx
    on public.erp_payslip_lines (payslip_id);
exception
  when others then
    raise warning 'create index if not exists erp_payslip_lines_payslip_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_payslip_lines', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_payslip_lines'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_employee_attendance (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    work_date date not null default current_date,
    status text not null default 'present',
    hours numeric not null default 8,
    leave_type text not null default '',
    remarks text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_employee_attendance (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create unique index if not exists erp_employee_attendance_unique
    on public.erp_employee_attendance (faculty_id, work_date);
exception
  when others then
    raise warning 'create unique index if not exists erp_employee_attendance_unique: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_employee_attendance', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_employee_attendance'', ''hr''): %', sqlerrm;
end;
$do$;

do $do$
begin
  create table if not exists public.erp_employee_advances (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.faculty (id) on delete cascade,
    amount_paise bigint not null default 0,
    reason text not null default '',
    sanction_date date not null default current_date,
    recovery_start date,
    recovered_paise bigint not null default 0,
    status text not null default 'sanctioned',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when others then
    raise warning 'create table if not exists public.erp_employee_advances (: %', sqlerrm;
end;
$do$;

do $do$
begin
  create index if not exists erp_employee_advances_faculty_idx
    on public.erp_employee_advances (faculty_id);
exception
  when others then
    raise warning 'create index if not exists erp_employee_advances_faculty_idx: %', sqlerrm;
end;
$do$;

do $do$
begin
  perform public.erp_apply_module_policies('erp_employee_advances', 'hr');
exception
  when others then
    raise warning 'select public.erp_apply_module_policies(''erp_employee_advances'', ''hr''): %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4. Audit triggers
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'erp_account_heads',
    'erp_vouchers',
    'erp_voucher_lines',
    'erp_ledger_entries',
    'erp_bank_accounts',
    'erp_bank_transactions',
    'erp_budgets',
    'erp_transport_routes',
    'erp_transport_stops',
    'erp_transport_vehicles',
    'erp_transport_drivers',
    'erp_transport_allocations',
    'erp_transport_attendance',
    'erp_transport_maintenance',
    'erp_leave_policies',
    'erp_leave_balances',
    'erp_payroll_components',
    'erp_payroll_runs',
    'erp_payslips',
    'erp_payslip_lines',
    'erp_employee_attendance',
    'erp_employee_advances'
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
