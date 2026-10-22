-- =============================================================================
-- SVIT College ERP - the diagnosis of the module migrations
-- =============================================================================
--
-- PURPOSE
--   This script only READS the database. It never changes a record, a table
--   or a policy, so it is completely safe to run at any time.
--
--   Run it in the Supabase SQL Editor and send the LAST table of the output
--   back. It shows in one place whether everything the module migrations
--   036 to 042 need is really in place.
--
-- WHAT IT SHOWS
--   1. Every version of the policy helper that is in the database, with its
--      full signature. A version with other parameter names is the reason for
--      "cannot change name of input parameter".
--   2. Everything that still uses the helper.
--   3. The module tables of the ERP, the one that is missing.
--   4. The summary of every check, in one table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Every version of the policy helper
-- ---------------------------------------------------------------------------
select
  n.nspname as schema,
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns,
  case
    when p.prosecdef then 'security definer'
    else 'security invoker'
  end as security,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'erp_apply_module_policies'
order by n.nspname, arguments;

-- ---------------------------------------------------------------------------
-- 2. Everything that still uses the helper
--    A view, a function or a policy that uses the old helper keeps it alive.
--    Then PostgreSQL refuses to replace it.
-- ---------------------------------------------------------------------------
select
  d.deptype as dependency,
  'function' as kind,
  n.nspname as schema,
  p.proname as object,
  d.refobjid::regprocedure as depends_on
from pg_depend d
join pg_proc p on p.oid = d.objid
join pg_namespace n on n.oid = p.pronamespace
where d.refclassid = 'pg_proc'::regclass
  and d.refobjid in (
    select pr.oid
    from pg_proc pr
    join pg_namespace nr on nr.oid = pr.pronamespace
    where pr.proname = 'erp_apply_module_policies'
  )
union all
select
  d.deptype,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    else c.relkind::text
  end,
  n.nspname,
  c.relname,
  d.refobjid::regprocedure
from pg_depend d
join pg_class c on c.oid = d.objid
join pg_namespace n on n.oid = c.relnamespace
where d.refclassid = 'pg_proc'::regclass
  and d.refobjid in (
    select pr.oid
    from pg_proc pr
    join pg_namespace nr on nr.oid = pr.pronamespace
    where pr.proname = 'erp_apply_module_policies'
  )
order by 1, 4;

-- ---------------------------------------------------------------------------
-- 3. The module tables of the migrations 036 to 042
--    A table that is missing has to be created by its migration.
-- ---------------------------------------------------------------------------
with module_tables(tablename, module_key) as (
  values
    ('erp_department_targets', 'departments'),
    ('erp_faculty_achievements', 'faculty'),
    ('erp_faculty_load', 'faculty'),
    ('erp_guardians', 'parents'),
    ('erp_parent_students', 'parents'),
    ('erp_student_documents', 'students'),
    ('erp_student_records', 'students'),
    ('erp_semesters', 'academics'),
    ('erp_curriculum', 'academics'),
    ('erp_course_outcomes', 'academics'),
    ('erp_credit_rules', 'academics'),
    ('erp_academic_records', 'academics'),
    ('erp_timetable_rooms', 'timetable'),
    ('erp_timetable_substitutions', 'timetable'),
    ('erp_faculty_attendance', 'attendance'),
    ('erp_attendance_regularisation', 'attendance'),
    ('erp_account_heads', 'accounts'),
    ('erp_vouchers', 'accounts'),
    ('erp_voucher_lines', 'accounts'),
    ('erp_ledger_entries', 'accounts'),
    ('erp_bank_accounts', 'accounts'),
    ('erp_bank_transactions', 'accounts'),
    ('erp_budgets', 'accounts'),
    ('erp_transport_routes', 'transport'),
    ('erp_transport_stops', 'transport'),
    ('erp_transport_vehicles', 'transport'),
    ('erp_transport_drivers', 'transport'),
    ('erp_transport_allocations', 'transport'),
    ('erp_transport_attendance', 'transport'),
    ('erp_transport_maintenance', 'transport'),
    ('erp_leave_policies', 'hr'),
    ('erp_leave_balances', 'hr'),
    ('erp_payroll_components', 'hr'),
    ('erp_payroll_runs', 'hr'),
    ('erp_payslips', 'hr'),
    ('erp_payslip_lines', 'hr'),
    ('erp_employee_attendance', 'hr'),
    ('erp_employee_advances', 'hr'),
    ('erp_exams', 'examinations'),
    ('erp_exam_schedules', 'examinations'),
    ('erp_seating_plans', 'examinations'),
    ('erp_exam_results', 'examinations'),
    ('erp_grade_scales', 'examinations'),
    ('erp_marksheets', 'examinations'),
    ('erp_revaluation_requests', 'examinations'),
    ('erp_library_items', 'library'),
    ('erp_library_members', 'library'),
    ('erp_library_issues', 'library'),
    ('erp_library_reservations', 'library'),
    ('erp_library_fines', 'library'),
    ('erp_hostels', 'hostel'),
    ('erp_hostel_blocks', 'hostel'),
    ('erp_hostel_rooms', 'hostel'),
    ('erp_hostel_allocations', 'hostel'),
    ('erp_hostel_attendance', 'hostel'),
    ('erp_hostel_maintenance', 'hostel'),
    ('erp_hostel_requests', 'hostel'),
    ('erp_id_card_templates', 'id_cards'),
    ('erp_notification_templates', 'communication'),
    ('erp_broadcasts', 'communication'),
    ('erp_message_log', 'communication'),
    ('erp_inventory_categories', 'inventory'),
    ('erp_suppliers', 'inventory'),
    ('erp_inventory_items', 'inventory'),
    ('erp_purchase_orders', 'inventory'),
    ('erp_purchase_order_lines', 'inventory'),
    ('erp_goods_receipts', 'inventory'),
    ('erp_stock_movements', 'inventory'),
    ('erp_companies', 'placement'),
    ('erp_placement_drives', 'placement'),
    ('erp_placement_applications', 'placement'),
    ('erp_placement_offers', 'placement'),
    ('erp_training_programmes', 'placement'),
    ('erp_training_enrollments', 'placement'),
    ('erp_training_attendance', 'placement'),
    ('erp_certificate_templates', 'certificates'),
    ('erp_certificate_requests', 'certificates'),
    ('erp_certificates', 'certificates'),
    ('erp_web_pages', 'website'),
    ('erp_web_posts', 'website'),
    ('erp_web_events', 'website'),
    ('erp_web_menu_items', 'website'),
    ('erp_web_settings', 'website'),
    ('erp_grievance_categories', 'helpdesk'),
    ('erp_grievances', 'helpdesk'),
    ('erp_grievance_comments', 'helpdesk'),
    ('erp_sla_rules', 'helpdesk'),
    ('erp_knowledge_articles', 'helpdesk'),
    ('erp_report_schedules', 'reports')
)
select
  mt.tablename,
  mt.module_key as module,
  to_regclass(format('public.%I', mt.tablename)) is not null as exists,
  coalesce(
    (select c.relrowsecurity from pg_class c
      where c.oid = to_regclass(format('public.%I', mt.tablename))),
    false
  ) as row_level_security,
  (select count(*)
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = mt.tablename
      and p.policyname in (
        mt.tablename || '_erp_read',
        mt.tablename || '_erp_insert',
        mt.tablename || '_erp_update',
        mt.tablename || '_erp_delete'
      )
  ) as module_policies,
  (select count(*)
    from pg_trigger t
    where t.tgrelid = to_regclass(format('public.%I', mt.tablename))
      and t.tgname = 'erp_audit_' || mt.tablename
      and not t.tgisinternal
  ) as audit_trigger
from module_tables mt
order by mt.tablename;

-- ---------------------------------------------------------------------------
-- 4. The summary
--    This is the last table of the output. It has to be sent back.
-- ---------------------------------------------------------------------------
with module_tables(tablename) as (
  select unnest(array[
    'erp_department_targets', 'erp_faculty_achievements', 'erp_faculty_load',
    'erp_guardians', 'erp_parent_students', 'erp_student_documents',
    'erp_student_records', 'erp_semesters', 'erp_curriculum',
    'erp_course_outcomes', 'erp_credit_rules', 'erp_academic_records',
    'erp_timetable_rooms', 'erp_timetable_substitutions', 'erp_faculty_attendance',
    'erp_attendance_regularisation', 'erp_account_heads', 'erp_vouchers',
    'erp_voucher_lines', 'erp_ledger_entries', 'erp_bank_accounts',
    'erp_bank_transactions', 'erp_budgets', 'erp_transport_routes',
    'erp_transport_stops', 'erp_transport_vehicles', 'erp_transport_drivers',
    'erp_transport_allocations', 'erp_transport_attendance',
    'erp_transport_maintenance', 'erp_leave_policies', 'erp_leave_balances',
    'erp_payroll_components', 'erp_payroll_runs', 'erp_payslips',
    'erp_payslip_lines', 'erp_employee_attendance', 'erp_employee_advances',
    'erp_exams', 'erp_exam_schedules', 'erp_seating_plans', 'erp_exam_results',
    'erp_grade_scales', 'erp_marksheets', 'erp_revaluation_requests',
    'erp_library_items', 'erp_library_members', 'erp_library_issues',
    'erp_library_reservations', 'erp_library_fines', 'erp_hostels',
    'erp_hostel_blocks', 'erp_hostel_rooms', 'erp_hostel_allocations',
    'erp_hostel_attendance', 'erp_hostel_maintenance', 'erp_hostel_requests',
    'erp_id_card_templates', 'erp_notification_templates', 'erp_broadcasts',
    'erp_message_log', 'erp_inventory_categories', 'erp_suppliers',
    'erp_inventory_items', 'erp_purchase_orders', 'erp_purchase_order_lines',
    'erp_goods_receipts', 'erp_stock_movements', 'erp_companies',
    'erp_placement_drives', 'erp_placement_applications', 'erp_placement_offers',
    'erp_training_programmes', 'erp_training_enrollments',
    'erp_training_attendance', 'erp_certificate_templates',
    'erp_certificate_requests', 'erp_certificates', 'erp_web_pages',
    'erp_web_posts', 'erp_web_events', 'erp_web_menu_items', 'erp_web_settings',
    'erp_grievance_categories', 'erp_grievances', 'erp_grievance_comments',
    'erp_sla_rules', 'erp_knowledge_articles', 'erp_report_schedules'
  ])
),
column_of(tablename, attname) as (
  select
    c.relname,
    a.attname
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and a.attnum > 0
    and not a.attisdropped
),
checks as (
  select
    'the policy helper is in place' as check_name,
    to_regprocedure('public.erp_apply_module_policies(text, text)') is not null as ok
  union all
  select
    'the helper has the right parameter names',
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'erp_apply_module_policies'
        and pg_get_function_identity_arguments(p.oid) = 'p_table text, p_module text'
    )
  union all
  select
    'nothing uses the helper any more',
    not exists (
      select 1
      from pg_depend d
      where d.refclassid = 'pg_proc'::regclass
        and d.refobjid in (
          select pr.oid
          from pg_proc pr
          join pg_namespace nr on nr.oid = pr.pronamespace
          where nr.nspname = 'public'
            and pr.proname = 'erp_apply_module_policies'
        )
    )
  union all
  select
    'the permission matrix is in place',
    to_regclass('public.erp_module_permissions') is not null
  union all
  select
    'the permission function reads the matrix',
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'erp_module_permission'
        and pg_get_functiondef(p.oid) like '%erp_module_permissions%'
    )
  union all
  select
    'the module registry is in place',
    to_regclass('public.erp_modules') is not null
  union all
  select
    'the permission matrix has its rows',
    case
      when to_regclass('public.erp_module_permissions') is null then false
      else (
        xpath(
          '/row/*/text()',
          query_to_xml(
            'select count(*) from public.erp_module_permissions',
            true,
            true,
            ''
          )
        )
      )[1]::text::int > 0
    end
  union all
  select
    'the module registry has its rows',
    case
      when to_regclass('public.erp_modules') is null then false
      else (
        xpath(
          '/row/*/text()',
          query_to_xml(
            'select count(*) from public.erp_modules',
            true,
            true,
            ''
          )
        )
      )[1]::text::int > 0
    end
  union all
  select
    'the student master links to the portal login',
    exists (
      select 1 from column_of
      where tablename = 'students' and attname = 'user_id'
    )
  union all
  select
    'the student master links to the college',
    exists (
      select 1 from column_of
      where tablename = 'students' and attname = 'course_id'
    )
  union all
  select
    'the student master links to the branch',
    exists (
      select 1 from column_of
      where tablename = 'students' and attname = 'branch_id'
    )
  union all
  select
    'the student master links to the department',
    exists (
      select 1 from column_of
      where tablename = 'students' and attname = 'department_id'
    )
  union all
  select
    'the faculty master links to the portal login',
    exists (
      select 1 from column_of
      where tablename = 'faculty' and attname = 'user_id'
    )
  union all
  select
    'the faculty master links to the department',
    exists (
      select 1 from column_of
      where tablename = 'faculty' and attname = 'department_id'
    )
  union all
  select
    'the timetable room master exists',
    to_regclass('public.erp_timetable_rooms') is not null
  union all
  select
    'every module table is there',
    not exists (
      select 1 from module_tables
      where to_regclass(format('public.%I', tablename)) is null
    )
  union all
  select
    'every module table has the row level security on',
    not exists (
      select 1 from module_tables
      where to_regclass(format('public.%I', tablename)) is null
    )
    and not exists (
      select 1
      from module_tables mt
      join pg_class c on c.oid = to_regclass(format('public.%I', mt.tablename))
      where not c.relrowsecurity
    )
  union all
  select
    'every module table has its four module policies',
    not exists (
      select 1
      from module_tables mt
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
      ) <> 4
    )
  union all
  select
    'the audit trigger of every module table is there',
    not exists (
      select 1 from module_tables
      where to_regclass(format('public.%I', tablename)) is null
    )
    and not exists (
      select 1
      from module_tables mt
      where to_regclass(format('public.%I', mt.tablename)) is not null
        and not exists (
          select 1
          from pg_trigger t
          where t.tgrelid = to_regclass(format('public.%I', mt.tablename))
            and t.tgname = 'erp_audit_' || mt.tablename
            and not t.tgisinternal
        )
    )
)
select
  check_name as check,
  ok,
  case
    when ok then 'ok'
    else 'MISSING - this is what the error is about'
  end as state
from checks
order by check_name;
