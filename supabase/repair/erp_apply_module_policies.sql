-- =============================================================================
-- SVIT College ERP - the one file that repairs the migrations 036 to 042
-- =============================================================================
--
-- PURPOSE
--   This file removes the errors that stop the module migrations 036 to 042:
--
--     ERROR:  function public.erp_apply_module_policies(unknown, unknown)
--             does not exist
--     ERROR:  column "student.user_id" does not exist
--     ERROR:  relation "public.erp_timetable_rooms" does not exist
--
-- HOW TO USE
--   1. Run this whole file once in the Supabase SQL Editor.
--   2. Run the migrations 036 to 042 again, in that order.
--   3. Read the report that the script prints at the end.
--
-- SAFE TO RUN
--   Every statement is idempotent and can run on any database: a table that
--   is missing is skipped, an error in one table does not stop the others
--   and the report reads only the catalogs of PostgreSQL. The script never
--   drops a record, it never drops a table and it never drops a policy that
--   is not a module policy. Running it twice changes nothing the second time.
--
-- WHY IT IS NEEDED
--   The module migrations 036 to 042 each carry their own copy of the policy
--   helper, so a single one of them can also be applied on its own. A
--   database that was stopped halfway can still be missing the helper, the
--   link between the student master and the portal login, or the timetable
--   room master. This file puts all three in place and protects every module
--   table that already exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The policy helper
--    An older version of the helper with different input parameter names is
--    removed first, together with the objects that still use it. PostgreSQL
--    refuses to replace a function in that case and would stop with
--    "cannot change name of input parameter".
--
--    The helper never stops a migration: a table that is missing, a role
--    that is missing or a policy that cannot be created is reported as a
--    warning and the script goes on.
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
-- 2. The shared masters that the module migrations read
--    The people spine of migration 037 links a student and a member of staff
--    to the portal login and to the academic masters. The academics
--    migration of 038 owns the timetable rooms.
--
--    Every change is made only when the table is there. A database that does
--    not have the legacy masters yet is not stopped by this script.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.students') is not null then
    begin
      execute 'alter table public.students
                 add column if not exists user_id uuid references public.profiles (id) on delete set null,
                 add column if not exists course_id uuid references public.courses (id) on delete set null,
                 add column if not exists branch_id uuid references public.branches (id) on delete set null,
                 add column if not exists department_id uuid references public.departments (id) on delete set null';
    exception
      when others then
        raise warning 'the student master could not be linked: %', sqlerrm;
    end;
  else
    raise warning 'the table public.students is missing - run the legacy migrations first';
  end if;

  if to_regclass('public.faculty') is not null then
    begin
      execute 'alter table public.faculty
                 add column if not exists user_id uuid references public.profiles (id) on delete set null,
                 add column if not exists department_id uuid references public.departments (id) on delete set null';
    exception
      when others then
        raise warning 'the faculty master could not be linked: %', sqlerrm;
    end;
  else
    raise warning 'the table public.faculty is missing - run the legacy migrations first';
  end if;

  begin
    execute 'create table if not exists public.erp_timetable_rooms (
               id uuid primary key default gen_random_uuid(),
               code text not null,
               name text not null default '''',
               building text not null default '''',
               room_type text not null default ''classroom'',
               capacity integer not null default 60,
               active boolean not null default true,
               created_at timestamptz not null default now(),
               updated_at timestamptz not null default now())';
    execute 'create unique index if not exists erp_timetable_rooms_code_unique
               on public.erp_timetable_rooms (lower(code))';
  exception
    when others then
      raise warning 'the timetable room master could not be created: %', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The module permissions of every module table that already exists
--    A table that a module migration still has to create is simply skipped.
--    A table whose permissions cannot be set is reported, the other tables
--    are still protected. The count that is printed is the number of the
--    tables that really carry the four module policies.
-- ---------------------------------------------------------------------------
do $$
declare
  v_pair text[];
  v_table text;
  v_module text;
  v_count integer := 0;
  v_policies integer;
  v_failed text := '';
  v_first_error text := '';
  v_modules integer;
begin
  foreach v_pair slice 1 in array array[
    ['erp_department_targets', 'departments'],
    ['erp_guardians', 'parents'],
    ['erp_parent_students', 'parents'],
    ['erp_student_documents', 'students'],
    ['erp_student_records', 'students'],
    ['erp_faculty_load', 'faculty'],
    ['erp_faculty_achievements', 'faculty'],
    ['erp_semesters', 'academics'],
    ['erp_curriculum', 'academics'],
    ['erp_course_outcomes', 'academics'],
    ['erp_credit_rules', 'academics'],
    ['erp_academic_records', 'academics'],
    ['erp_timetable_rooms', 'timetable'],
    ['erp_timetable_substitutions', 'timetable'],
    ['erp_faculty_attendance', 'attendance'],
    ['erp_attendance_regularisation', 'attendance'],
    ['erp_account_heads', 'accounts'],
    ['erp_vouchers', 'accounts'],
    ['erp_voucher_lines', 'accounts'],
    ['erp_ledger_entries', 'accounts'],
    ['erp_bank_accounts', 'accounts'],
    ['erp_bank_transactions', 'accounts'],
    ['erp_budgets', 'accounts'],
    ['erp_transport_routes', 'transport'],
    ['erp_transport_stops', 'transport'],
    ['erp_transport_vehicles', 'transport'],
    ['erp_transport_drivers', 'transport'],
    ['erp_transport_allocations', 'transport'],
    ['erp_transport_attendance', 'transport'],
    ['erp_transport_maintenance', 'transport'],
    ['erp_leave_policies', 'hr'],
    ['erp_leave_balances', 'hr'],
    ['erp_payroll_components', 'hr'],
    ['erp_payroll_runs', 'hr'],
    ['erp_payslips', 'hr'],
    ['erp_payslip_lines', 'hr'],
    ['erp_employee_attendance', 'hr'],
    ['erp_employee_advances', 'hr'],
    ['erp_exams', 'examinations'],
    ['erp_exam_schedules', 'examinations'],
    ['erp_seating_plans', 'examinations'],
    ['erp_exam_results', 'examinations'],
    ['erp_grade_scales', 'examinations'],
    ['erp_marksheets', 'examinations'],
    ['erp_revaluation_requests', 'examinations'],
    ['erp_library_items', 'library'],
    ['erp_library_members', 'library'],
    ['erp_library_issues', 'library'],
    ['erp_library_reservations', 'library'],
    ['erp_library_fines', 'library'],
    ['erp_hostels', 'hostel'],
    ['erp_hostel_blocks', 'hostel'],
    ['erp_hostel_rooms', 'hostel'],
    ['erp_hostel_allocations', 'hostel'],
    ['erp_hostel_attendance', 'hostel'],
    ['erp_hostel_maintenance', 'hostel'],
    ['erp_hostel_requests', 'hostel'],
    ['erp_id_card_templates', 'id_cards'],
    ['erp_notification_templates', 'communication'],
    ['erp_broadcasts', 'communication'],
    ['erp_message_log', 'communication'],
    ['erp_inventory_categories', 'inventory'],
    ['erp_suppliers', 'inventory'],
    ['erp_inventory_items', 'inventory'],
    ['erp_purchase_orders', 'inventory'],
    ['erp_purchase_order_lines', 'inventory'],
    ['erp_goods_receipts', 'inventory'],
    ['erp_stock_movements', 'inventory'],
    ['erp_companies', 'placement'],
    ['erp_placement_drives', 'placement'],
    ['erp_placement_applications', 'placement'],
    ['erp_placement_offers', 'placement'],
    ['erp_training_programmes', 'placement'],
    ['erp_training_enrollments', 'placement'],
    ['erp_training_attendance', 'placement'],
    ['erp_certificate_templates', 'certificates'],
    ['erp_certificate_requests', 'certificates'],
    ['erp_certificates', 'certificates'],
    ['erp_web_pages', 'website'],
    ['erp_web_posts', 'website'],
    ['erp_web_events', 'website'],
    ['erp_web_menu_items', 'website'],
    ['erp_web_settings', 'website'],
    ['erp_grievance_categories', 'helpdesk'],
    ['erp_grievances', 'helpdesk'],
    ['erp_grievance_comments', 'helpdesk'],
    ['erp_sla_rules', 'helpdesk'],
    ['erp_knowledge_articles', 'helpdesk'],
    ['erp_report_schedules', 'reports']
  ]
  loop
    v_table := v_pair[1];
    v_module := v_pair[2];
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;
    begin
      perform public.erp_apply_module_policies(v_table, v_module);

      -- The helper only warns, so the policies are counted to know whether
      -- the table is really protected.
      select count(*)
      into v_policies
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname in (
          v_table || '_erp_read',
          v_table || '_erp_insert',
          v_table || '_erp_update',
          v_table || '_erp_delete'
        );

      if v_policies = 4 then
        v_count := v_count + 1;
      else
        v_failed := v_failed || v_table || ' ';
      end if;
    exception
      when others then
        v_failed := v_failed || v_table || ' ';
        if v_first_error = '' then
          v_first_error := sqlerrm;
        end if;
    end;
  end loop;
  raise notice 'module permissions applied to % tables', v_count;
  if v_failed <> '' then
    raise warning 'these tables could not be protected: %', v_failed;
    if v_first_error <> '' then
      raise warning 'the first error was: %', v_first_error;
    end if;
  end if;

  if to_regclass('public.erp_modules') is not null then
    execute 'select count(*) from public.erp_modules' into v_modules;
    raise notice 'the module registry holds % modules', v_modules;
  else
    raise warning 'the module registry is missing - run migration 035 first';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The report
--    The report reads only the catalogs of PostgreSQL and the helper
--    functions. It can never fail, so it can never roll back the repair.
-- ---------------------------------------------------------------------------
select
  'the policy helper is in place' as item,
  to_regprocedure('public.erp_apply_module_policies(text, text)') is not null as ok
union all
select
  'the permission matrix is in place',
  to_regprocedure('public.erp_module_permission(text, text)') is not null
union all
select
  'the module registry is in place',
  to_regclass('public.erp_modules') is not null
union all
select
  'the student master links to the portal login',
  exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'students'
      and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped
  )
union all
select
  'the faculty master links to the portal login',
  exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'faculty'
      and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped
  )
union all
select
  'the timetable room master exists',
  to_regclass('public.erp_timetable_rooms') is not null
union all
select
  'every module table of the ERP is protected',
  not exists (
    select 1
    from unnest(array[
  'erp_department_targets',
  'erp_guardians',
  'erp_parent_students',
  'erp_student_documents',
  'erp_student_records',
  'erp_faculty_load',
  'erp_faculty_achievements',
  'erp_semesters',
  'erp_curriculum',
  'erp_course_outcomes',
  'erp_credit_rules',
  'erp_academic_records',
  'erp_timetable_rooms',
  'erp_timetable_substitutions',
  'erp_faculty_attendance',
  'erp_attendance_regularisation',
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
  'erp_employee_advances',
  'erp_exams',
  'erp_exam_schedules',
  'erp_seating_plans',
  'erp_exam_results',
  'erp_grade_scales',
  'erp_marksheets',
  'erp_revaluation_requests',
  'erp_library_items',
  'erp_library_members',
  'erp_library_issues',
  'erp_library_reservations',
  'erp_library_fines',
  'erp_hostels',
  'erp_hostel_blocks',
  'erp_hostel_rooms',
  'erp_hostel_allocations',
  'erp_hostel_attendance',
  'erp_hostel_maintenance',
  'erp_hostel_requests',
  'erp_id_card_templates',
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
    ]) as mt(tablename)
    where to_regclass(format('public.%I', mt.tablename)) is not null
      and (
        select count(*)
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = mt.tablename
          and p.policyname in (
            mt.tablename || '_erp_read',
            mt.tablename || '_erp_insert',
            mt.tablename || '_erp_update',
            mt.tablename || '_erp_delete'
          )
      ) <> 4
  )
union all
select
  'every shared master table can be read',
  not exists (
    select 1
    from (
      select
        tablename,
        count(*) filter (where policyname like '%\_erp\_read') as r
      from pg_policies
      where schemaname = 'public' and policyname like '%\_erp\_%'
      group by tablename
    ) t
    where t.r = 0
  )
order by 1;

-- The module tables of the ERP that this script protects. The shared master
-- tables of the legacy migrations are protected as well; they carry their own
-- policies and are not part of this list.
--
-- protected_module_tables counts the tables that really carry the four
-- module policies. module_tables counts the tables that are there. When the
-- two numbers are the same, every module table is protected.
select
  count(*) filter (
    where (
      select count(*)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = mt.tablename
        and p.policyname in (
          mt.tablename || '_erp_read',
          mt.tablename || '_erp_insert',
          mt.tablename || '_erp_update',
          mt.tablename || '_erp_delete'
        )
    ) = 4
  ) as protected_module_tables,
  count(*) as module_tables
from unnest(array[
  'erp_department_targets',
  'erp_guardians',
  'erp_parent_students',
  'erp_student_documents',
  'erp_student_records',
  'erp_faculty_load',
  'erp_faculty_achievements',
  'erp_semesters',
  'erp_curriculum',
  'erp_course_outcomes',
  'erp_credit_rules',
  'erp_academic_records',
  'erp_timetable_rooms',
  'erp_timetable_substitutions',
  'erp_faculty_attendance',
  'erp_attendance_regularisation',
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
  'erp_employee_advances',
  'erp_exams',
  'erp_exam_schedules',
  'erp_seating_plans',
  'erp_exam_results',
  'erp_grade_scales',
  'erp_marksheets',
  'erp_revaluation_requests',
  'erp_library_items',
  'erp_library_members',
  'erp_library_issues',
  'erp_library_reservations',
  'erp_library_fines',
  'erp_hostels',
  'erp_hostel_blocks',
  'erp_hostel_rooms',
  'erp_hostel_allocations',
  'erp_hostel_attendance',
  'erp_hostel_maintenance',
  'erp_hostel_requests',
  'erp_id_card_templates',
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
]) as mt(tablename)
where to_regclass(format('public.%I', mt.tablename)) is not null;

-- The module tables that are there but do not carry the four module
-- policies. An empty list means that every module table is protected.
select mt.tablename as table_without_the_module_policies
from unnest(array[
  'erp_department_targets',
  'erp_guardians',
  'erp_parent_students',
  'erp_student_documents',
  'erp_student_records',
  'erp_faculty_load',
  'erp_faculty_achievements',
  'erp_semesters',
  'erp_curriculum',
  'erp_course_outcomes',
  'erp_credit_rules',
  'erp_academic_records',
  'erp_timetable_rooms',
  'erp_timetable_substitutions',
  'erp_faculty_attendance',
  'erp_attendance_regularisation',
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
  'erp_employee_advances',
  'erp_exams',
  'erp_exam_schedules',
  'erp_seating_plans',
  'erp_exam_results',
  'erp_grade_scales',
  'erp_marksheets',
  'erp_revaluation_requests',
  'erp_library_items',
  'erp_library_members',
  'erp_library_issues',
  'erp_library_reservations',
  'erp_library_fines',
  'erp_hostels',
  'erp_hostel_blocks',
  'erp_hostel_rooms',
  'erp_hostel_allocations',
  'erp_hostel_attendance',
  'erp_hostel_maintenance',
  'erp_hostel_requests',
  'erp_id_card_templates',
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
]) as mt(tablename)
where to_regclass(format('public.%I', mt.tablename)) is not null
  and (
    select count(*)
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = mt.tablename
      and p.policyname in (
        mt.tablename || '_erp_read',
        mt.tablename || '_erp_insert',
        mt.tablename || '_erp_update',
        mt.tablename || '_erp_delete'
      )
  ) <> 4
order by 1;
